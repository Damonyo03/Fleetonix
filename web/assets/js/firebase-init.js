import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig, useEmulators, emulatorConfig } from "./firebase-config.js";

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// Connect to Emulators if needed
if (useEmulators) {
    console.log("Connecting to Firebase Emulators...");
    connectAuthEmulator(auth, emulatorConfig.auth);
    connectFirestoreEmulator(db, emulatorConfig.firestore.host, emulatorConfig.firestore.port);
}

export { app, auth, db };
