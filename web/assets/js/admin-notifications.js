import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    getFirestore, collection, query, orderBy, onSnapshot,
    doc, getDoc, updateDoc, writeBatch, where, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { initLayout } from "./modules/ui.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let allNotifs = [];
let currentFilter = 'all';

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = '../login.html'; return; }
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const name = userDoc.exists() ? (userDoc.data().full_name || user.email.split('@')[0]) : user.email.split('@')[0];
    initLayout('System Notifications', name);

    // Listen to ALL activity/system logs in real-time
    listenToLogs();
    // Also listen to booking events (new bookings)
    listenToBookingEvents();
});

/** Listens to the activity collection for system events */
function listenToLogs() {
    onSnapshot(
        query(collection(db, "activity"), orderBy("timestamp", "desc")),
        (snapshot) => {
            const activityNotifs = snapshot.docs.map(d => ({
                id: d.id, source: 'activity', ...d.data(),
                created_at: d.data().timestamp
            }));
            mergeAndRender('activity', activityNotifs);
        },
        (err) => {
            // Fallback: try without orderBy
            onSnapshot(collection(db, "activity"), (snapshot) => {
                const activityNotifs = snapshot.docs.map(d => ({
                    id: d.id, source: 'activity', ...d.data(),
                    created_at: d.data().timestamp || d.data().created_at
                }));
                mergeAndRender('activity', activityNotifs);
            });
        }
    );

    // Also listen to general notifications collection
    onSnapshot(
        query(collection(db, "notifications"), orderBy("created_at", "desc")),
        (snapshot) => {
            const notifs = snapshot.docs.map(d => ({ id: d.id, source: 'notifications', ...d.data() }));
            mergeAndRender('notifications', notifs);
        },
        () => {
            onSnapshot(collection(db, "notifications"), (snapshot) => {
                const notifs = snapshot.docs.map(d => ({ id: d.id, source: 'notifications', ...d.data() }));
                mergeAndRender('notifications', notifs);
            });
        }
    );
}

/** Listens to bookings collection to generate new booking events */
function listenToBookingEvents() {
    onSnapshot(
        query(collection(db, "bookings"), orderBy("created_at", "desc")),
        (snapshot) => {
            const bookingNotifs = snapshot.docs.map(d => {
                const b = d.data();
                return {
                    id: 'booking_' + d.id,
                    source: 'bookings',
                    type: 'booking',
                    title: `New Booking — ${b.client_name || 'Client'}`,
                    message: `From ${b.pickup_location || 'Unknown'} → ${b.dropoff_location || 'Unknown'} on ${b.pickup_date || ''}`,
                    is_read: b.status !== 'pending',
                    created_at: b.created_at
                };
            });
            mergeAndRender('bookings', bookingNotifs);
        },
        () => {} // silently ignore if no access
    );
}

// Keeps track of each source's items separately
const sourceBuckets = {};
function mergeAndRender(source, items) {
    sourceBuckets[source] = items;
    // Merge all sources
    allNotifs = Object.values(sourceBuckets)
        .flat()
        .sort((a, b) => {
            const aT = a.created_at?.toMillis?.() || a.created_at?.seconds * 1000 || 0;
            const bT = b.created_at?.toMillis?.() || b.created_at?.seconds * 1000 || 0;
            return bT - aT;
        });
    updateStats();
    renderFiltered();
}

function updateStats() {
    const total   = allNotifs.length;
    const unread  = allNotifs.filter(n => !n.is_read).length;
    const warnings = allNotifs.filter(n => ['warning', 'accident', 'vehicle_issue'].includes(n.type)).length;
    const bookings = allNotifs.filter(n => n.type === 'booking').length;

    document.getElementById('totalCount').textContent   = total;
    document.getElementById('unreadCount').textContent  = unread;
    document.getElementById('warningCount').textContent = warnings;
    document.getElementById('bookingCount').textContent = bookings;
}

function renderFiltered() {
    let list = allNotifs;
    if (currentFilter !== 'all') {
        list = allNotifs.filter(n => {
            const t = (n.type || '').toLowerCase();
            if (currentFilter === 'booking')  return t === 'booking';
            if (currentFilter === 'trip')     return ['trip', 'completed', 'started'].includes(t);
            if (currentFilter === 'warning')  return t === 'warning';
            if (currentFilter === 'accident') return ['accident', 'vehicle_issue'].includes(t);
            if (currentFilter === 'system')   return ['system', 'info'].includes(t);
            return true;
        });
    }
    renderNotifications(list.slice(0, 100)); // cap at 100 for performance
}

function renderNotifications(items) {
    const container = document.getElementById('notificationList');
    if (!container) return;

    if (items.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:60px; color:var(--text-muted);">
                <i class="fas fa-bell-slash" style="font-size:2.5em; margin-bottom:12px; display:block;"></i>
                <p>No notifications in this category.</p>
            </div>`;
        return;
    }

    container.innerHTML = items.map(n => {
        const type = (n.type || 'info').toLowerCase();
        const iconMap = {
            'booking': { icon: 'fa-calendar-check', cls: 'booking' },
            'trip': { icon: 'fa-car', cls: 'info' },
            'completed': { icon: 'fa-flag-checkered', cls: 'success' },
            'accident': { icon: 'fa-car-crash', cls: 'danger' },
            'vehicle_issue': { icon: 'fa-tools', cls: 'warning' },
            'warning': { icon: 'fa-exclamation-triangle', cls: 'warning' },
            'system': { icon: 'fa-cog', cls: 'info' },
            'info': { icon: 'fa-info-circle', cls: 'info' },
        };
        const { icon, cls } = iconMap[type] || { icon: 'fa-bell', cls: 'info' };
        const cardCls = n.is_read ? cls : `unread ${cls}`;
        const timeStr = formatTime(n.created_at);

        return `
            <div class="notif-card ${cardCls}">
                <div class="notif-icon ${cls}"><i class="fas ${icon}"></i></div>
                <div class="notif-body">
                    <div class="notif-title">${n.title || 'System Event'}</div>
                    <div class="notif-message">${n.message || n.details || n.description || ''}</div>
                    <div class="notif-meta">
                        <span><i class="fas fa-clock"></i> ${timeStr}</span>
                        ${n.driver ? `<span><i class="fas fa-user"></i> ${n.driver}</span>` : ''}
                        ${n.source ? `<span style="text-transform:capitalize;"><i class="fas fa-tag"></i> ${n.source}</span>` : ''}
                    </div>
                </div>
                ${!n.is_read ? `<span style="width:8px; height:8px; background:var(--accent-blue); border-radius:50%; flex-shrink:0; margin-top:4px;"></span>` : ''}
            </div>
        `;
    }).join('');
}

function formatTime(ts) {
    if (!ts) return '—';
    try {
        const d = ts.toDate ? ts.toDate() : new Date(ts.seconds ? ts.seconds * 1000 : ts);
        return d.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return '—'; }
}

// Exposed to HTML
window.filterBy = function(type, el) {
    currentFilter = type;
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    renderFiltered();
};

window.markAllRead = async function() {
    // Mark notifications in the notifications collection as read
    try {
        const snap = await getDocs(query(collection(db, "notifications"), where("is_read", "==", false)));
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.update(d.ref, { is_read: true }));
        await batch.commit();
        alert("All notifications marked as read.");
    } catch (e) {
        console.warn("Could not mark all read:", e.message);
    }
};
