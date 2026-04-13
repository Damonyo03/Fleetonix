const admin = require('firebase-admin');
const serviceAccount = require('../appfleetonix-firebase-adminsdk-fbsvc-b6aecf2c1e.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function dumpDrivers() {
  const snap = await db.collection('drivers').get();
  snap.forEach(doc => {
    const data = doc.data();
    console.log(`ID: ${doc.id}`);
    console.log(`- email: [${data.driver_email}] (type: ${typeof data.driver_email})`);
    console.log(`- uid: [${data.driver_uid}] (type: ${typeof data.driver_uid})`);
    console.log(`- status: [${data.status}]`);
  });
  
  console.log("\n--- EXAMPLES OF PENDING SCHEDULES ---");
  const scheds = await db.collection('schedules').where('trip_phase','==','pending').limit(3).get();
  scheds.forEach(doc => {
    const data = doc.data();
    console.log(`Sched ID: ${doc.id}`);
    console.log(`- email: [${data.driver_email}]`);
    console.log(`- uid: [${data.driver_uid}]`);
  });
  
  process.exit(0);
}

dumpDrivers().catch(console.error);
