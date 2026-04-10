const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath))
});

const db = admin.firestore();

async function fixUser() {
  const email = 'perezraprap15@gmail.com';
  console.log(`Searching for user: ${email}`);
  
  const snapshot = await db.collection('users').where('email', '==', email).get();
  
  if (snapshot.empty) {
    console.error('User not found');
    process.exit(1);
  }

  const userDoc = snapshot.docs[0];
  await userDoc.ref.update({
    isFirstLogin: false,
    status: 'active'
  });

  console.log(`Successfully updated ${email}: isFirstLogin = false, status = active`);
  process.exit(0);
}

fixUser().catch(err => {
  console.error(err);
  process.exit(1);
});
