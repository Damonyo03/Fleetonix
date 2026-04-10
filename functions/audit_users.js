const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Try to find the service account key
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(serviceAccountPath)) {
    console.error(`Service account key not found at ${serviceAccountPath}`);
    process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath))
});

const db = admin.firestore();

async function listUsers() {
  console.log('--- User Status Audit ---');
  const snapshot = await db.collection('users').get();
  console.log(`Total users in Firestore: ${snapshot.size}`);
  
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`- ID: ${doc.id}`);
    console.log(`  Email: ${data.email}`);
    console.log(`  Role/Type: ${data.role || 'N/A'}/${data.user_type || 'N/A'}`);
    console.log(`  Status: ${data.status}`);
    console.log(`  isFirstLogin: ${data.isFirstLogin}`);
    console.log(`  Full Name: ${data.full_name}`);
    console.log('-------------------------');
  });
  process.exit(0);
}

listUsers().catch(err => {
  console.error(err);
  process.exit(1);
});
