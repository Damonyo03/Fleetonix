const admin = require("firebase-admin");
const fs = require("fs");
const logFile = "cleanup_log.txt";

function log(msg) {
  const line = `${new Date().toISOString()} - ${msg}\n`;
  console.log(msg);
  fs.appendFileSync(logFile, line);
}

// Clear log
fs.writeFileSync(logFile, "Starting Cleanup Process\n");

// Initialize Admin SDK with service account
try {
  const serviceAccount = require("./serviceAccountKey.json");
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (e) {
  log("Critical: Failed to initialize Firebase Admin SDK. Error: " + e.message);
  process.exit(1);
}

const db = admin.firestore();

async function cleanup() {
  log("Fetching active drivers...");
  const driversSnapshot = await db.collection("drivers").get();
  const activeEmails = new Set();
  const activeUids = new Set();
  
  driversSnapshot.docs.forEach(doc => {
    const data = doc.data();
    if (data.driver_email) activeEmails.add(data.driver_email.toLowerCase().trim());
    activeUids.add(doc.id); // Doc ID is usually UID
  });
  
  log(`Found ${activeEmails.size} active driver emails and ${activeUids.size} UIDs.`);

  log("Scanning trip_tickets...");
  const ticketsSnapshot = await db.collection("trip_tickets").get();
  log(`Total tickets found: ${ticketsSnapshot.size}`);

  const now = Date.now();
  const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
  
  let deletedCount = 0;
  let preservedCount = 0;
  
  const batch = db.batch();
  let batchOpCount = 0;

  for (const doc of ticketsSnapshot.docs) {
    const data = doc.data();
    const createdAt = data.created_at ? (data.created_at.toMillis ? data.created_at.toMillis() : 0) : 0;
    const email = data.driver_email ? data.driver_email.toLowerCase().trim() : "";
    const uid = data.driver_uid || "";
    
    const isRecent = (now - createdAt) < FORTY_EIGHT_HOURS_MS;
    const isValidDriver = activeEmails.has(email) || activeUids.has(uid);
    
    // Logic: Keep if recent AND associated with a valid account
    // OR if it's very recent (last 24h) regardless (to be safe)
    const isVeryRecent = (now - createdAt) < (24 * 60 * 60 * 1000);

    if (isValidDriver && (isRecent || data.status === "completed" || data.status === "cancelled")) {
      preservedCount++;
    } else if (isVeryRecent) {
      preservedCount++;
    } else {
      batch.delete(doc.ref);
      deletedCount++;
      batchOpCount++;
      
      if (batchOpCount >= 400) {
        await batch.commit();
        log(`Committing batch... deleted ${deletedCount} so far.`);
        batchOpCount = 0;
      }
    }
  }

  if (batchOpCount > 0) {
    await batch.commit();
  }

  log(`--- CLEANUP SUMMARY ---`);
  log(`Deleted: ${deletedCount} stale/orphan tickets.`);
  log(`Preserved: ${preservedCount} valid/recent tickets.`);
  log(`--- COMPLETE ---`);
  process.exit(0);
}

cleanup().catch(err => {
  log("Cleanup failed: " + err.message);
  process.exit(1);
});
