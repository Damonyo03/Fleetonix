const admin = require('firebase-admin');
const serviceAccount = require('./appfleetonix-firebase-adminsdk-fbsvc-b6aecf2c1e.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function listUsers() {
  const snapshot = await db.collection('users').get();
  console.log(`Total users in Firestore: ${snapshot.size}`);
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`ID: ${doc.id} | Email: ${data.email} | Role: ${data.role}/${data.user_type} | Status: ${data.status} | FirstLogin: ${data.isFirstLogin} | Full Name: ${data.full_name}`);
  });
  process.exit(0);
}

listUsers().catch(err => {
  console.error(err);
  process.exit(1);
});
