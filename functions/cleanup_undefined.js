const admin = require('firebase-admin');
const serviceAccount = require('../appfleetonix-firebase-adminsdk-fbsvc-b6aecf2c1e.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function cleanup() {
  console.log("--- CLEANING UP SCHEDULES ---");
  const scheds = await db.collection('schedules').get();
  let schedCount = 0;
  for (const doc of scheds.docs) {
    const data = doc.data();
    if (data.driver_uid === "undefined" || data.driver_uid === undefined) {
      console.log(`Fixing Schedule ${doc.id}: driver_uid was "${data.driver_uid}"`);
      await doc.ref.update({ driver_uid: "" });
      schedCount++;
    }
  }
  console.log(`Updated ${schedCount} schedules.`);

  console.log("\n--- CLEANING UP DRIVERS ---");
  const drivers = await db.collection('drivers').get();
  let driverCount = 0;
  for (const doc of drivers.docs) {
    const data = doc.data();
    let updates = {};
    
    if (data.driver_uid === "undefined" || data.driver_uid === undefined) {
      console.log(`Fixing Driver ${doc.id}: driver_uid was "${data.driver_uid}"`);
      // Use the Document ID as the UID if it looks like a UID
      updates.driver_uid = doc.id;
      driverCount++;
    }
    
    if (Object.keys(updates).length > 0) {
        await doc.ref.update(updates);
    }
  }
  console.log(`Updated ${driverCount} drivers.`);

  process.exit(0);
}

cleanup().catch(console.error);
