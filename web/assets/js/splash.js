import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

/**
 * Fleetonix - Splash Screen Script (Module)
 * Handles auto-login redirect and animations
 */

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

document.addEventListener('DOMContentLoaded', function() {
    const splashDuration = 2500; 
    let redirectUrl = 'login.html';

    // ── Check Auth State ──────────────────────────────────────────────────────
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                // Determine redirect based on role
                const userRef = doc(db, "users", user.uid);
                const userSnap = await getDoc(userRef);
                let userData = userSnap.exists() ? userSnap.data() : null;

                if (!userData) {
                    const q = query(collection(db, "users"), where("email", "==", user.email));
                    const snap = await getDocs(q);
                    if (!snap.empty) userData = snap.docs[0].data();
                }

                if (userData) {
                    const role = userData.user_type || userData.role || 'client';
                    if (role === 'admin') {
                        redirectUrl = 'admin/dashboard.html';
                    } else if (role === 'client') {
                        redirectUrl = 'client/dashboard.html';
                    }
                }
            } catch (e) {
                console.error("Splash redirect check failed:", e);
            }
        }
    });

    // ── Animation & Redirect ──────────────────────────────────────────────────
    setTimeout(() => {
        const splashContainer = document.querySelector('.splash-container');
        if (splashContainer) {
            splashContainer.style.transition = 'opacity 0.6s ease-out';
            splashContainer.style.opacity = '0';
        }
        
        setTimeout(() => {
            window.location.href = redirectUrl;
        }, 600);
    }, splashDuration);
    
    // Skip splash on click
    document.addEventListener('click', () => { window.location.href = redirectUrl; });
});
