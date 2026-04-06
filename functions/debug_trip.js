const admin = require('firebase-admin');
const serviceAccount = require('../appfleetonix-firebase-adminsdk-fbsvc-b6aecf2c1e.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function debug() {
  const scheduleId = 'SCHED_177538';
  console.log(`Checking case-insensitive schedules/trip_tickets...`);
  
  const collections = ['schedules', 'trip_tickets', 'bookings'];
  for (const colName of collections) {
      console.log(`\nScanning collection: ${colName}`);
      const list = await db.collection(colName).limit(10).get();
      list.forEach(doc => {
          console.log(`  - Doc ID: ${doc.id}`);
          if (doc.id.toLowerCase() === scheduleId.toLowerCase()) {
              console.log(`  MATCH FOUND: ${doc.id}`);
              console.log(JSON.stringify(doc.data(), null, 2));
          }
      });
  }

  console.log(`\nDirectly checking all-caps and lowercase variants...`);
  const variants = [scheduleId, scheduleId.toLowerCase(), scheduleId.toUpperCase()];
  for (const v of variants) {
      for (const c of collections) {
          const d = await db.collection(c).doc(v).get();
          if (d.exists) console.log(`  FOUND [${c}/${v}]`);
      }
  }
  
  process.exit(0);
}

debug().catch(err => {
  console.error(err);
  process.exit(1);
});
