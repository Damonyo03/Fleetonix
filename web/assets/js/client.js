/**
 * Fleettonix - Client Portal Scripts
 */

document.addEventListener('DOMContentLoaded', function() {
    // Sidebar toggle for mobile
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    
    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', function() {
            sidebar.classList.toggle('show');
        });
    }
    
    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', function(e) {
        if (window.innerWidth <= 768) {
            if (sidebar && !sidebar.contains(e.target) && menuToggle && !menuToggle.contains(e.target)) {
                sidebar.classList.remove('show');
            }
        }
    });
});

// Real-time Sidebar Alerts & Global Logout for Client
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { clearUserCache } from "./modules/ui.js";

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);

// Global Sidebar Counters
onAuthStateChanged(auth, (user) => {
    if (user) {
        onSnapshot(query(collection(db, "notifications"), where("user_id", "==", user.uid), where("is_read", "==", false)), (snapshot) => {
            const counters = document.querySelectorAll('.notif-count');
            counters.forEach(counter => {
                counter.innerText = snapshot.size;
                counter.style.display = 'inline-flex';
            });
        }, (error) => {
            console.error("Sidebar notification fetch error:", error);
        });
    }
});

// Global Logout Handler
document.addEventListener('click', (e) => {
    const logoutBtn = e.target.closest('#logoutBtn') || e.target.closest('.nav-item.logout');
    if (logoutBtn) {
        e.preventDefault();
        if (confirm("Are you sure you want to logout?")) {
            clearUserCache();
            signOut(auth).then(() => {
                window.location.href = '../login.html';
            }).catch(error => {
                console.error("Logout error:", error);
                window.location.href = '../login.html';
            });
        }
    }
});
