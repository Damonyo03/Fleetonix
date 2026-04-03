const admin = require('firebase-admin');
const path = require('path');
const serviceAccountPath = path.join(__dirname, '..', 'appfleetonix-firebase-adminsdk-fbsvc-b6aecf2c1e.json');
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

const adminEmail = 'aisenaldersonquia05@gmail.com';
const adminPassword = 'admin123';

async function setAdmin() {
  console.log(`Setting up Admin: ${adminEmail}...`);
  
  try {
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(adminEmail);
      console.log(`User exists (UID: ${userRecord.uid}). Updating password...`);
      await auth.updateUser(userRecord.uid, {
        password: adminPassword
      });
    } catch (e) {
      console.log("User does not exist. Creating new user...");
      userRecord = await auth.createUser({
        email: adminEmail,
        password: adminPassword,
        emailVerified: true,
        displayName: "System Admin"
      });
    }

    const uid = userRecord.uid;

    // Set user_type to admin in Firestore
    await db.collection('users').doc(uid).set({
      full_name: "System Admin",
      email: adminEmail,
      user_type: "admin",
      created_at: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log(`Successfully configured ${adminEmail} as Admin.`);
    process.exit(0);
  } catch (error) {
    console.error("Error setting admin:", error);
    process.exit(1);
  }
}

setAdmin();
