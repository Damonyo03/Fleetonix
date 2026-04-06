const admin = require('firebase-admin');
const path = require('path');

// Use the service account found in the root
const serviceAccount = require('../appfleetonix-firebase-adminsdk-fbsvc-b6aecf2c1e.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrateNames() {
  console.log("Starting Robust Migration: 'Ralph Perez' Variants -> 'Raprap Perez'");
  
  const collections = ['trip_tickets', 'schedules'];
  let totalUpdated = 0;

  for (const colName of collections) {
    console.log(`\nScanning collection: ${colName}...`);
    const snapshot = await db.collection(colName).get();
    const batch = db.batch();
    let count = 0;

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const name = (data.driver_name || data.driverName || "").toString().trim();
      
      // Case-insensitive check for "Ralph Perez"
      if (name.toLowerCase() === 'ralph perez' || name.toLowerCase().includes('ralph perez')) {
        console.log(`  Updating [${doc.id}]: '${name}' -> 'Raprap Perez'`);
        batch.update(doc.ref, { 
            driver_name: 'Raprap Perez',
            driverName: 'Raprap Perez' // Cover both variations
        });
        count++;
        totalUpdated++;
      }
    });

    if (count > 0) {
      await batch.commit();
      console.log(`  Successfully updated ${count} records in ${colName}.`);
    } else {
      console.log(`  No matching records found in ${colName}.`);
    }
  }

  console.log(`\nMigration Complete. Total records updated: ${totalUpdated}`);
  process.exit(0);
}

migrateNames().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
