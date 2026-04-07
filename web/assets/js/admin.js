/**
 * Fleetonix - Admin Dashboard Controller
 * Synchronized with Premium Design System
 */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot, getDoc, doc, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { clearUserCache } from "./modules/ui.js";

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);

document.addEventListener('DOMContentLoaded', () => {
    // ── Navigation & Sidebar Controls ─────────────────────────────────────────
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    
    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('show');
        });

        // Close sidebar when clicking outside on mobile viewports
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 1024 && sidebar.classList.contains('show')) {
                if (!sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
                    sidebar.classList.remove('show');
                }
            }
        });
    }

    // Standardize select elements dropdown visuals
    const selectElements = document.querySelectorAll('select.btn-secondary, select.form-input');
    selectElements.forEach(select => {
        const fixArrow = () => {
            select.style.setProperty('background-position', 'right 12px center', 'important');
            select.style.setProperty('padding-right', '36px', 'important');
        };
        select.addEventListener('focus', fixArrow);
        select.addEventListener('change', fixArrow);
        fixArrow();
    });
});

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

// ── Real-time Notification Dispatcher ────────────────────────────────────────
let accidentCount = 0;
let issueCount = 0;

const updateVisualBadges = () => {
    const total = accidentCount + issueCount;
    
    // Sidebar Counters
    document.querySelectorAll('.notif-count').forEach(counter => {
        counter.innerText = total > 0 ? total : '0';
        counter.style.display = total > 0 ? 'inline-flex' : 'none';
        
        // Ensure proper badge classes are present
        if (!counter.classList.contains('badge')) counter.classList.add('badge');
        if (!counter.classList.contains('badge-error')) {
             counter.classList.add('badge-error');
             // Clean up any legacy inline styles from previous iterations
             counter.style.removeProperty('background');
             counter.style.removeProperty('color');
        }
    });

    // Header Bell Badge
    const headerBadge = document.querySelector('.notification-badge');
    if (headerBadge) {
        headerBadge.innerText = total > 0 ? total : '0';
        headerBadge.style.display = total > 0 ? 'flex' : 'none';
    }
};

onSnapshot(query(collection(db, "accidents"), where("status", "!=", "acknowledged")), (snap) => {
    accidentCount = snap.size;
    updateVisualBadges();
});

onSnapshot(query(collection(db, "vehicle_issues"), where("status", "!=", "acknowledged")), (snap) => {
    issueCount = snap.size;
    updateVisualBadges();
});

// ── Global Session Management ────────────────────────────────────────────────
document.addEventListener('click', (e) => {
    const logoutBtn = e.target.closest('#logoutBtn') || e.target.closest('.nav-item.logout');
    if (logoutBtn) {
        e.preventDefault();
        if (confirm("Sign out of the administrative terminal?")) {
            clearUserCache();
            signOut(auth).then(() => {
                window.location.href = '../login.html';
            }).catch(() => {
                window.location.href = '../login.html';
            });
        }
    }
});
