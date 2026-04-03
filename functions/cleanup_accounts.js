const admin = require('firebase-admin');
const path = require('path');
// Service account is in the parent directory
const serviceAccountPath = path.join(__dirname, '..', 'appfleetonix-firebase-adminsdk-fbsvc-b6aecf2c1e.json');
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

const emailsToKeep = [
  'aisenaldersonquia05@gmail.com',
  'aisenaldersonquia@gmail.com',
  'perezralph15@gmail.com'
];

async function cleanup() {
  console.log("Starting cleanup...");

  try {
    const listUsers = await auth.listUsers();
    console.log(`Found ${listUsers.users.length} users total.`);

    for (const userRecord of listUsers.users) {
      if (emailsToKeep.includes(userRecord.email)) {
        console.log(`Keeping user: ${userRecord.email}`);
        continue;
      }

      console.log(`Deleting user: ${userRecord.email} (UID: ${userRecord.uid})`);

      try {
        // Delete from Auth
        await auth.deleteUser(userRecord.uid);

        // Delete from Firestore 'users'
        const userDoc = await db.collection('users').doc(userRecord.uid).get();
        if (userDoc.exists) {
          await db.collection('users').doc(userRecord.uid).delete();
          console.log(`  - Deleted from 'users' collection`);
        }

        // Delete from Firestore 'drivers' (search by email)
        const drivers = await db.collection('drivers').where('email', '==', userRecord.email).get();
        for (const doc of drivers.docs) {
          await doc.ref.delete();
          console.log(`  - Deleted from 'drivers' collection`);
        }

        // Delete from Firestore 'clients' (search by email)
        const clients = await db.collection('clients').where('email', '==', userRecord.email).get();
        for (const doc of clients.docs) {
          await doc.ref.delete();
          console.log(`  - Deleted from 'clients' collection`);
        }

        // Delete from Firestore 'driver_locations' (real-time map markers)
        // Check both UID and email as document IDs due to different app versions
        const locByUid = await db.collection('driver_locations').doc(userRecord.uid).get();
        if (locByUid.exists) {
          await db.collection('driver_locations').doc(userRecord.uid).delete();
          console.log(`  - Deleted from 'driver_locations' (ID: ${userRecord.uid})`);
        }
        
        const locByEmail = await db.collection('driver_locations').doc(userRecord.email).get();
        if (locByEmail.exists) {
          await db.collection('driver_locations').doc(userRecord.email).delete();
          console.log(`  - Deleted from 'driver_locations' (ID: ${userRecord.email})`);
        }
      } catch (err) {
        console.error(`  ! Error deleting user ${userRecord.email}:`, err.message);
      }
    }

    // FORCE CLEANUP OF STALE LOCATIONS (in case users were already deleted from Auth)
    console.log("Cleaning up orphaned driver_locations...");
    const locations = await db.collection('driver_locations').get();
    for (const doc of locations.docs) {
      const data = doc.data();
      const email = data.driver_email || doc.id; // Some use email as ID, some use UID
      if (!emailsToKeep.includes(email)) {
        console.log(`Deleting stale location marker: ${doc.id}`);
        await doc.ref.delete();
      }
    }

    console.log("Cleanup finished successfully.");
  } catch (error) {
    console.error("Error during cleanup:", error);
  }
}

cleanup();
