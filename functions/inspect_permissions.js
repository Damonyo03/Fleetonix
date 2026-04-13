const admin = require('firebase-admin');
const serviceAccount = require('../appfleetonix-firebase-adminsdk-fbsvc-b6aecf2c1e.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function inspectForPermissions() {
  console.log("--- PENDING SCHEDULES ---");
  const pendingScheds = await db.collection('schedules')
    .where('trip_phase', '==', 'pending')
    .limit(10)
    .get();

  pendingScheds.forEach(doc => {
    const data = doc.data();
    console.log(`Schedule ID: ${doc.id}`);
    console.log(`- status: ${data.status}`);
    console.log(`- trip_phase: ${data.trip_phase}`);
    console.log(`- driver_email: "${data.driver_email}"`);
    console.log(`- driver_uid: "${data.driver_uid}"`);
    console.log(`- is_published: ${data.is_published}`);
  });

  console.log("\n--- DRIVERS SAMPLE ---");
  const drivers = await db.collection('drivers').limit(5).get();
  drivers.forEach(doc => {
      const data = doc.data();
      console.log(`Driver Doc ID: ${doc.id}`);
      console.log(`- driver_email: "${data.driver_email}"`);
      console.log(`- driver_uid: "${data.driver_uid}"`);
  });

  process.exit(0);
}

inspectForPermissions().catch(console.error);
