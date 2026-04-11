const admin = require('firebase-admin');
const serviceAccount = require('./appfleetonix-firebase-adminsdk-fbsvc-b6aecf2c1e.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const TARGET_COLLECTIONS = [
  "schedules",
  "bookings",
  "activity",
  "driver_activity",
  "driver_locations",
  "notifications",
  "accidents",
  "vehicle_issues",
  "trip_tickets",
  "dtr_logs",
  "incidents"
];

async function deleteCollection(collectionPath, batchSize = 500) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.orderBy('__name__').limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(db, query, resolve).catch(reject);
  });
}

async function deleteQueryBatch(db, query, resolve) {
  const snapshot = await query.get();

  const batchSize = snapshot.size;
  if (batchSize === 0) {
    resolve();
    return;
  }

  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });

  await batch.commit();

  // Recurse on the next process tick, to avoid
  // exploding the stack.
  process.nextTick(() => {
    deleteQueryBatch(db, query, resolve);
  });
}

async function resetDrivers() {
    console.log("Resetting driver statuses...");
    const driversSnap = await db.collection("drivers").get();
    const batch = db.batch();
    
    driversSnap.docs.forEach(doc => {
        batch.update(doc.ref, {
            current_status: "available",
            current_trip_id: null,
            current_trip_phase: "none",
            active_ticket_id: null,
            last_updated: admin.firestore.FieldValue.serverTimestamp()
        });
    });
    
    await batch.commit();
    console.log(`Reset ${driversSnap.size} drivers to available status.`);
}

async function wipe() {
  console.log("Starting Factory Reset for Testing...");
  
  for (const col of TARGET_COLLECTIONS) {
    console.log(`Wiping collection: ${col}...`);
    await deleteCollection(col);
  }
  
  await resetDrivers();
  
  console.log("Cleanup Complete! Registered Users and Driver Profiles were preserved.");
}

wipe().then(() => process.exit(0)).catch(err => {
  console.error("Wipe failed:", err);
  process.exit(1);
});
