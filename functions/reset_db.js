const admin = require("firebase-admin");
const fs = require("fs");
const logFile = "reset_log.txt";

function log(msg) {
  const line = `${new Date().toISOString()} - ${msg}\n`;
  console.log(msg);
  fs.appendFileSync(logFile, line);
}

// Clear log
fs.writeFileSync(logFile, "Starting Reset Process\n");

// Initialize Admin SDK
try {
  admin.initializeApp();
} catch (e) {
  log("Critical: Failed to initialize Firebase Admin SDK. Error: " + e.message);
  process.exit(1);
}

const db = admin.firestore();
const auth = admin.auth();

const COLLECTIONS_TO_WIPE = [
  "users", "drivers", "bookings", "schedules", "activity", "accidents", 
  "vehicle_issues", "registration_otps", "otps", "accredited_companies", 
  "dtr_logs", "vehicle_logs", "driver_locations", "trip_tickets", "otp_codes"
];

async function deleteCollection(collectionPath, batchSize = 100) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(query, resolve).catch(reject);
  });
}

async function deleteQueryBatch(query, resolve) {
  const snapshot = await query.get();

  if (snapshot.size === 0) {
    resolve();
    return;
  }

  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  process.nextTick(() => {
    deleteQueryBatch(query, resolve);
  });
}

async function deleteAllUsers() {
  log("Deleting all Auth users...");
  try {
    let users = await auth.listUsers(1000);
    while (users.users.length > 0) {
      const uids = users.users.map((u) => u.uid);
      await auth.deleteUsers(uids);
      log(`Deleted batch of ${uids.length} users.`);
      if (users.pageToken) {
        users = await auth.listUsers(1000, users.pageToken);
      } else {
        break;
      }
    }
  } catch (e) {
    log("Error deleting users: " + e.message);
  }
}

async function createSuperAdmin(email, password) {
  log(`Creating Super Admin: ${email}`);
  try {
    // 1. Create Auth User
    const userRecord = await auth.createUser({
      email: email,
      password: password,
      displayName: "Super Admin",
      emailVerified: true
    });

    // 2. Create Firestore User Doc
    await db.collection("users").doc(userRecord.uid).set({
      full_name: "Super Admin",
      email: email,
      role: "super_admin",
      user_type: "super_admin",
      status: "active",
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });

    log(`Super Admin created successfully with UID: ${userRecord.uid}`);
  } catch (e) {
    log("Error creating super admin: " + e.message);
  }
}

async function main() {
  log("Starting Full Database Reset...");

  for (const col of COLLECTIONS_TO_WIPE) {
    log(`Wiping collection: ${col}...`);
    try {
      await deleteCollection(col);
      log(`Completed wiping ${col}.`);
    } catch (e) {
      log(`Error wiping ${col}: ${e.message}`);
    }
  }

  await deleteAllUsers();
  await createSuperAdmin("perezralph15@gmail.com", "admin123");

  log("--- RESET COMPLETE ---");
  process.exit(0);
}

main().catch((err) => {
  log("Main function failed: " + err.message);
  process.exit(1);
});
