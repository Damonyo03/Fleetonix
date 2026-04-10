const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

async function purgeTestDrivers() {
  console.log("Starting purge of test drivers...");
  
  const usersSnap = await db.collection("users")
    .where("role", "==", "driver")
    .get();

  console.log(`Found ${usersSnap.size} drivers in total.`);

  let deletedCount = 0;

  for (const doc of usersSnap.docs) {
    const data = doc.data();
    // Delete only if not active (to protect real production data)
    if (data.status === 'pending_verification' || data.status === 'pending_approval') {
      const uid = doc.id;
      const email = data.email;

      console.log(`Deleting user: ${email} (${uid})`);

      try {
        // 1. Delete from Auth
        await auth.deleteUser(uid).catch(e => console.log(`Auth deletion skipped for ${uid}: ${e.message}`));

        // 2. Delete from Firestore collections
        await db.collection("users").doc(uid).delete();
        await db.collection("drivers").doc(uid).delete();
        await db.collection("driver_locations").doc(uid).delete();
        
        // Also check if they might have a record keyed by email (legacy)
        if (email) {
          const emailLower = email.toLowerCase().trim();
          await db.collection("drivers").doc(emailLower).delete();
          await db.collection("driver_locations").doc(emailLower).delete();
          await db.collection("registration_otps").doc(emailLower).delete();
        }

        deletedCount++;
      } catch (err) {
        console.error(`Error deleting ${uid}:`, err);
      }
    }
  }

  console.log(`Purge complete. Deleted ${deletedCount} users.`);
  process.exit(0);
}

purgeTestDrivers();
