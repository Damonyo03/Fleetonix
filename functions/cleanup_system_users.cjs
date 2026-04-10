const admin = require('firebase-admin');
const serviceAccount = require('../appfleetonix-firebase-adminsdk-fbsvc-b6aecf2c1e.json');

// Initialize Admin SDK with service account (must be in root or relative to script)
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

const SUPER_ADMIN_EMAIL = "perezralph15@gmail.com";

async function cleanupUsers() {
    console.log(`Starting system-wide user cleanup. Preserving: ${SUPER_ADMIN_EMAIL}`);

    let superAdminUid = null;

    try {
        // 1. Identify Super Admin in Auth
        const adminUser = await auth.getUserByEmail(SUPER_ADMIN_EMAIL);
        superAdminUid = adminUser.uid;
        console.log(`Found Super Admin in Auth. UID: ${superAdminUid}`);
    } catch (e) {
        console.error(`ERROR: Super Admin email ${SUPER_ADMIN_EMAIL} not found in Firebase Auth!`);
        console.error("Aborting cleanup to prevent complete lock-out.");
        process.exit(1);
    }

    // 2. Ensure Super Admin is correct in Firestore and has proper role
    console.log("Ensuring Super Admin role in Firestore...");
    const adminDocRef = db.collection('users').doc(superAdminUid);
    await adminDocRef.set({
        email: SUPER_ADMIN_EMAIL,
        role: 'super_admin',
        user_type: 'super_admin',
        updated_at: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    console.log("Super Admin record updated/confirmed in Firestore.");

    // 3. Clear all other users from Firebase Auth
    console.log("Fetching all Auth users...");
    const authList = await auth.listUsers();
    console.log(`Total Auth users: ${authList.users.length}`);
    
    const deleteAuthOps = authList.users
        .filter(u => u.uid !== superAdminUid)
        .map(u => auth.deleteUser(u.uid).then(() => console.log(`Deleted Auth User: ${u.email} (${u.uid})`)));

    await Promise.all(deleteAuthOps);
    console.log("Auth cleanup complete.");

    // 4. Clear all other users from Firestore
    console.log("Fetching all Firestore users...");
    const firestoreSnap = await db.collection('users').get();
    console.log(`Total Firestore user documents: ${firestoreSnap.size}`);

    const deleteFirestoreOps = [];
    firestoreSnap.forEach(doc => {
        if (doc.id !== superAdminUid) {
            deleteFirestoreOps.push(doc.ref.delete().then(() => console.log(`Deleted Firestore User: ${doc.id}`)));
        }
    });

    await Promise.all(deleteFirestoreOps);
    console.log("Firestore cleanup complete.");

    console.log("--- CLEANUP SUCCESSFUL ---");
    console.log(`Only user remaining: ${SUPER_ADMIN_EMAIL}`);
    process.exit(0);
}

cleanupUsers().catch(err => {
    console.error("Cleanup failed:", err);
    process.exit(1);
});
