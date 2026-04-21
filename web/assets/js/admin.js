/**
 * Fleetonix - Admin Dashboard Controller
 * Synchronized with Premium Design System
 */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot, getDoc, doc, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { clearUserCache, showToast } from "./modules/ui.js";

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);

// ── Admin Authorization Guard ────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        if (!window.location.pathname.includes('login.html')) {
            window.location.href = '../login.html';
        }
        return;
    }

    try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        let userData = userSnap.exists() ? userSnap.data() : null;

        if (!userData) {
            const q = query(collection(db, "users"), where("email", "==", user.email));
            const emailSnap = await getDocs(q);
            if (!emailSnap.empty) userData = emailSnap.docs[0].data();
        }

        const adminRoles = ['admin', 'super_admin'];
        const role = userData?.user_type || userData?.role;
        
        if (!userData || !adminRoles.includes(role)) {
            console.error("Unauthorized: Elevated privileges required.");
            window.location.href = '../login.html?error=unauthorized';
        }
    } catch (error) {
        console.error("Security verification failed:", error);
    }
});
