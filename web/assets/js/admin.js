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

// ── Real-time Notification Dispatcher (Enhanced) ─────────────────────────────
let unreadAlerts = 0;
let lastSeenTimestamp = Date.now(); 
let initialLoadAccidents = true;
let initialLoadNotifs = true;
let initialLoadBookings = true;

const updateVisualBadges = () => {
    document.querySelectorAll('.notif-count, .notification-badge, .approval-count').forEach(counter => {
        let val = 0;
        if (counter.classList.contains('notif-count') || counter.classList.contains('notification-badge')) {
            val = unreadAlerts;
        }
        
        counter.innerText = val > 0 ? val : '0';
        counter.style.display = val > 0 ? 'inline-flex' : 'none';
        if (counter.classList.contains('notification-badge')) counter.style.display = val > 0 ? 'flex' : 'none';
    });
};

// 1. Monitor Accidents (Urgent)
onSnapshot(query(collection(db, "accidents"), where("status", "!=", "acknowledged")), (snap) => {
    unreadAlerts = snap.size;
    updateVisualBadges();
    
    if (!initialLoadAccidents) {
        snap.docChanges().forEach(change => {
            if (change.type === "added") {
                const data = change.doc.data();
                showToast("🚨 EMERGENCY ALERT", data.description || "Driver reported an accident!", "danger", 10000);
            }
        });
    }
    initialLoadAccidents = false;
});

// 2. Monitor System Notifications & Driver Actions
onSnapshot(query(collection(db, "notifications"), orderBy("timestamp", "desc")), (snap) => {
    if (initialLoadNotifs) {
        initialLoadNotifs = false;
        return;
    }

    snap.docChanges().forEach(change => {
        if (change.type === "added") {
            const data = change.doc.data();
            const ts = data.timestamp?.toMillis ? data.timestamp.toMillis() : Date.now();
            
            if (ts > lastSeenTimestamp - 5000) {
                showToast(data.title || "System Update", data.message || "New activity detected.", data.type || "info");
            }
        }
    });
});

// 3. Monitor New Bookings
onSnapshot(query(collection(db, "bookings"), where("status", "==", "pending")), (snap) => {
    if (!initialLoadBookings) {
        snap.docChanges().forEach(change => {
            if (change.type === "added") {
                const data = change.doc.data();
                showToast("📅 New Booking Request", `From: ${data.client_name || 'Guest User'}`, "info");
            }
        });
    }
    initialLoadBookings = false;
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
