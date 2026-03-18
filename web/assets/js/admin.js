/**
 * Fleettonix - Admin Dashboard Scripts
 */

document.addEventListener('DOMContentLoaded', function() {
    // Sidebar toggle for mobile
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    
    if (menuToggle) {
        menuToggle.addEventListener('click', function() {
            sidebar.classList.toggle('show');
        });
    }
    
    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', function(e) {
        if (window.innerWidth <= 768) {
            if (!sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
                sidebar.classList.remove('show');
            }
        }
    });
    
    // Handle window resize
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768) {
            sidebar.classList.remove('show');
        }
    });
    
    // Notification icon click (handled by link in header)
    
    // Fix dropdown arrow position - prevent it from moving when clicked
    const selectElements = document.querySelectorAll('select.form-input');
    selectElements.forEach(function(select) {
        // Function to force arrow position
        function fixArrowPosition() {
            select.style.setProperty('background-position', 'right 16px center', 'important');
            select.style.setProperty('direction', 'ltr', 'important');
            select.style.setProperty('text-align', 'left', 'important');
            select.style.setProperty('padding-right', '40px', 'important');
        }
        
        // Force arrow position on all events
        select.addEventListener('focus', fixArrowPosition);
        select.addEventListener('blur', fixArrowPosition);
        select.addEventListener('change', fixArrowPosition);
        select.addEventListener('click', fixArrowPosition);
        select.addEventListener('mousedown', fixArrowPosition);
        select.addEventListener('mouseup', fixArrowPosition);
        
        // Continuously check and fix position (for browsers that change it dynamically)
        setInterval(function() {
            if (document.activeElement === select || select.matches(':focus')) {
                fixArrowPosition();
            }
        }, 50);
    });
    
    // Auto-refresh notifications every 30 seconds
    setInterval(function() {
        // This will be implemented with AJAX later
    }, 30000);
});

// Sidebar Accordion Toggle Logic
window.toggleAccordion = function(header) {
    const content = header.nextElementSibling;
    
    // Toggle active state on header
    header.classList.toggle('active');
    
    // Toggle content visibility
    if (content.style.maxHeight) {
        content.style.maxHeight = null;
    } else {
        content.style.maxHeight = content.scrollHeight + "px";
    }
};

// Real-time Sidebar Alerts & Global Logout for Admin
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { clearUserCache } from "./modules/ui.js";

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);

// Global Sidebar Counters
const updateSidebarBadge = (count) => {
    const counters = document.querySelectorAll('.notif-count');
    counters.forEach(counter => {
        const val = parseInt(count) || 0;
        if (val > 0) {
            counter.innerText = val;
            counter.style.display = 'inline-flex';
            // Ensure there's a space if it's right after text
            if (counter.previousSibling && counter.previousSibling.nodeType === 3) {
                 if (!counter.previousSibling.textContent.endsWith(' ')) {
                     counter.previousSibling.textContent += ' ';
                 }
            }
        } else {
            counter.innerText = '';
            counter.style.display = 'none';
        }
        
        // Add badge styling if missing
        if (!counter.classList.contains('badge')) {
            counter.classList.add('badge', 'danger');
            counter.style.background = '#ef4444';
            counter.style.color = 'white';
            counter.style.marginLeft = '8px';
            counter.style.padding = '2px 6px';
            counter.style.borderRadius = '4px';
            counter.style.fontSize = '0.7em';
        }
    });
};

// Listen to both accidents and vehicle_issues for the sidebar badge
let accidentCount = 0;
let issueCount = 0;

onSnapshot(collection(db, "accidents"), (snap) => {
    accidentCount = snap.size;
    updateSidebarBadge(accidentCount + issueCount);
});

onSnapshot(collection(db, "vehicle_issues"), (snap) => {
    issueCount = snap.size;
    updateSidebarBadge(accidentCount + issueCount);
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
                // Fallback redirect if signOut fails
                window.location.href = '../login.html';
            });
        }
    }
});

