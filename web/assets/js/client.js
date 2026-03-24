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

// Global Sidebar Counters & Real-time Toasts
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Real-time Sidebar Alerts & Global Toasts
        onSnapshot(query(collection(db, "notifications"), 
            where("user_email", "==", user.email), 
            where("is_read", "==", false)), (snapshot) => {
            
            const counters = document.querySelectorAll('.notif-count');
            counters.forEach(counter => {
                counter.innerText = snapshot.size;
                counter.style.display = snapshot.size > 0 ? 'inline-flex' : 'none';
            });

            // Show toast for new notifications
            snapshot.docChanges().forEach(change => {
                if (change.type === "added") {
                    const data = change.doc.data();
                    showNotificationToast(data.title, data.message);
                }
            });

        }, (error) => {
            console.error("Sidebar notification fetch error:", error);
        });
    }
});

/**
 * Modern Toast Notification UI
 */
function showNotificationToast(title, message) {
    let toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toastContainer';
        toastContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 11000;
            display: flex;
            flex-direction: column;
            gap: 10px;
        `;
        document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.className = 'notif-toast';
    toast.innerHTML = `
        <div class="toast-icon"><i class="fas fa-bell"></i></div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-msg">${message}</div>
        </div>
    `;

    toastContainer.appendChild(toast);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(50px)';
        setTimeout(() => toast.remove(), 500);
    }, 5000);
}

// Global Toast Styles
if (!document.getElementById('toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
        .notif-toast {
            background: rgba(26, 31, 46, 0.9);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(0, 212, 255, 0.3);
            border-radius: 12px;
            padding: 15px;
            color: white;
            display: flex;
            gap: 15px;
            width: 320px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.4);
            animation: slideInRight 0.4s cubic-bezier(0.19, 1, 0.22, 1);
            transition: all 0.5s ease;
        }
        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        .toast-icon {
            width: 35px;
            height: 35px;
            background: rgba(0, 212, 255, 0.1);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #00d4ff;
            flex-shrink: 0;
        }
        .toast-title { font-weight: 700; font-size: 0.9rem; margin-bottom: 2px; }
        .toast-msg { font-size: 0.8rem; opacity: 0.8; line-height: 1.4; }
    `;
    document.head.appendChild(style);
}

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
