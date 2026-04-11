import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    getFirestore, collection, query, orderBy, onSnapshot,
    doc, getDoc, updateDoc, writeBatch, where, getDocs, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { initLayout } from "./modules/ui.js";

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

let allNotifs = [];
let currentFilter = 'all';
const seenNotifs = new Set();
let isInitialLoad = true;

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = '../login.html'; return; }
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const name = userDoc.exists() ? (userDoc.data().full_name || user.email.split('@')[0]) : user.email.split('@')[0];
    initLayout('System Notification', name);

    // Start Listeners
    listenToSystemLogs();
    listenToTrips();
    listenToBookings();
    listenToAccidents();
    listenToDTR();
});

/** Listens to the activity collection for system events (CRUD) */
function listenToSystemLogs() {
    const q = query(collection(db, "activity"), orderBy("timestamp", "desc"));
    onSnapshot(q, (snapshot) => {
        const logs = snapshot.docs.map(d => ({
            id: d.id, source: 'system', type: 'system', ...d.data(),
            created_at: d.data().timestamp || d.data().created_at
        }));
        mergeAndRender('system', logs);
    }, (err) => {
        console.warn("System logs index error, falling back:", err);
        onSnapshot(collection(db, "activity"), (snapshot) => {
            const logs = snapshot.docs.map(d => ({
                id: d.id, source: 'system', type: 'system', ...d.data(),
                created_at: d.data().timestamp || d.data().created_at
            }));
            mergeAndRender('system', logs);
        });
    });
}

/** Listens to schedules for trip updates */
        });
    });
}


/** Listens to bookings for new and status changes */
function listenToBookings() {
    const q = query(collection(db, "bookings"), orderBy("created_at", "desc"));
    onSnapshot(q, (snapshot) => {
        const bookings = snapshot.docs.map(d => {
            const b = d.data();
            return {
                id: d.id, source: 'bookings', type: 'booking',
                title: `New Booking: #${d.id.slice(-6).toUpperCase()}`,
                message: `${b.passenger_name || b.client_name} | From: ${b.pickup_location?.address || 'N/A'}`,
                driver: b.assigned_driver_name || 'Unassigned',
                created_at: b.created_at,
                is_read: b.status !== 'pending'
            };
        });
        mergeAndRender('bookings', bookings);
    }, (err) => {
        console.warn("Bookings index missing, falling back...");
        onSnapshot(collection(db, "bookings"), (snapshot) => {
            const bookings = snapshot.docs.map(d => ({
                 id: d.id, source: 'bookings', type: 'booking',
                 ...d.data(), created_at: d.data().created_at
            }));
            mergeAndRender('bookings', bookings);
        });
    });
}


/** Listens to DTR logs for operational awareness */
function listenToDTR() {
    const q = query(collection(db, "dtr_logs"), orderBy("timestamp", "desc"));
    onSnapshot(q, (snapshot) => {
        const dtr = snapshot.docs.map(d => {
            const log = d.data();
            return {
                id: d.id, source: 'dtr_logs', type: 'attendance',
                title: log.type === 'clock_in' ? 'Driver Clocked In' : 'Driver Clocked Out',
                message: `${log.driver_name} (${log.plate_number}) at ${log.location_name || 'Field'}`,
                driver: log.driver_name,
                created_at: log.timestamp,
                is_read: true
            };
        });
        mergeAndRender('attendance', dtr);
    }, (err) => {
        onSnapshot(collection(db, "dtr_logs"), (snapshot) => {
            const dtr = snapshot.docs.map(d => ({
                id: d.id, source: 'dtr_logs', type: 'attendance', ...d.data(), created_at: d.data().timestamp
            }));
            mergeAndRender('attendance', dtr);
        });
    });
}



/** Listens to accident reports from mobile app */
function listenToAccidents() {
    const q = query(collection(db, "accidents"), orderBy("reported_at", "desc"));
    onSnapshot(q, (snapshot) => {
        const accidents = snapshot.docs.map(d => {
            const data = d.data();
            return {
                id: d.id, source: 'accidents', type: 'accident',
                title: `🚨 Accident Reported!`,
                message: data.description || 'Driver reported an accident via mobile app.',
                driver: data.driver_email,
                coords: data.latitude && data.longitude ? `${data.latitude}, ${data.longitude}` : null,
                created_at: data.reported_at,
                is_read: false
            };
        });
        mergeAndRender('accidents', accidents);
    }, (err) => {
        onSnapshot(collection(db, "accidents"), (snapshot) => {
            const accidents = snapshot.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id, source: 'accidents', type: 'accident',
                    title: `🚨 Accident Reported!`,
                    message: data.description || 'Driver reported an accident via mobile app.',
                    driver: data.driver_email,
                    coords: data.latitude && data.longitude ? `${data.latitude}, ${data.longitude}` : null,
                    created_at: data.reported_at,
                    is_read: false
                };
            });
            mergeAndRender('accidents', accidents);
        });
    });
}

const sourceBuckets = {};
function mergeAndRender(source, items) {
    sourceBuckets[source] = items;
    allNotifs = Object.values(sourceBuckets).flat().sort((a, b) => {
        const aT = a.created_at?.toMillis?.() || a.created_at?.seconds * 1000 || 0;
        const bT = b.created_at?.toMillis?.() || b.created_at?.seconds * 1000 || 0;
        return bT - aT;
    });

    // Mark which ones are "newly" arrived unread alerts
    allNotifs.forEach(n => {
        const isAlert = n.type === 'accident';
        const isUnread = n.status !== 'acknowledged' && !n.is_read;
        
        if (isAlert && isUnread && !seenNotifs.has(n.id)) {
            if (!isInitialLoad) {
                n.isNew = true; // Flag for animation
            }
            seenNotifs.add(n.id);
        }
    });

    isInitialLoad = false;
    updateStats();
    renderFiltered();
}

function updateStats() {
    const unreadNotifs = allNotifs.filter(n => n.status !== 'acknowledged' && !n.is_read);
    const counts = {
        trip: allNotifs.filter(n => n.type === 'trip').length,
        accident: allNotifs.filter(n => n.type === 'accident' && n.status !== 'acknowledged').length,
        total: allNotifs.length,
        unreadAlerts: allNotifs.filter(n => (n.type === 'accident') && n.status !== 'acknowledged').length
    };

    if (document.getElementById('totalCount')) document.getElementById('totalCount').textContent = counts.total;
    if (document.getElementById('tripCount')) document.getElementById('tripCount').textContent = counts.trip;
    if (document.getElementById('accidentCount')) document.getElementById('accidentCount').textContent = counts.accident;

    // Synchronize sidebar badge from here if on notifications page
    const sidebarCount = document.querySelector('.notif-count');
    if (sidebarCount) {
        const val = counts.unreadAlerts;
        sidebarCount.innerText = val > 0 ? val : '';
        sidebarCount.style.display = val > 0 ? 'inline-flex' : 'none';
    }
}

function renderFiltered() {
    let list = allNotifs;
    if (currentFilter !== 'all') {
        list = allNotifs.filter(n => {
            if (currentFilter === 'ops') return n.type === 'trip' || n.type === 'booking';
            if (currentFilter === 'accident') return n.type === 'accident';
            if (currentFilter === 'security') return n.type === 'system' || n.type === 'security';
            if (currentFilter === 'attendance') return n.type === 'attendance';
            return true;
        });
    }
    renderNotifications(list.slice(0, 50)); 
}

function renderNotifications(items) {
    const container = document.getElementById('notificationList');
    if (!container) return;

    if (items.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:60px; color:var(--text-muted);"><p>No notifications found.</p></div>`;
        return;
    }

    container.innerHTML = items.map(n => {
        const type = n.type.toLowerCase();
        const iconMap = {
            'trip': { icon: 'fa-car', cls: 'info' },
            'booking': { icon: 'fa-calendar-check', cls: 'info' },
            'accident': { icon: 'fa-car-crash', cls: 'danger' },
            'attendance': { icon: 'fa-user-clock', cls: 'warning' },
            'system': { icon: 'fa-shield-alt', cls: 'success' },
            'security': { icon: 'fa-user-shield', cls: 'danger' },
        };
        const { icon, cls } = iconMap[type] || { icon: 'fa-bell', cls: 'info' };
        
        // Use a persistent 'read' state from Firestore if available, else default to false for alerts
        const isRead = n.status === 'acknowledged' || n.is_read; 
        const isNew = n.isNew ? 'new-alert' : '';
        const cardCls = `notif-card ${cls} ${isRead ? '' : 'unread'} ${isNew}`;
        const timeStr = formatTime(n.created_at);

        return `
            <div class="${cardCls}" id="notif-${n.id}">
                <div class="notif-icon ${cls}"><i class="fas ${icon}"></i></div>
                <div class="notif-body">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div class="notif-title">${n.title}</div>
                        ${!isRead && (type === 'accident') ? 
                            `<button class="btn-ack" onclick="acknowledgeNotif('${n.id}', '${n.source}')">Acknowledge</button>` : ''}
                    </div>
                    <div class="notif-message">${n.message}</div>
                    <div class="notif-meta">
                        <span><i class="fas fa-clock"></i> ${timeStr}</span>
                        ${n.driver ? `<span><i class="fas fa-user-circle"></i> ${n.driver}</span>` : ''}
                        ${n.coords ? `<span><i class="fas fa-map-marker-alt"></i> ${n.coords}</span>` : ''}
                        ${isRead ? `<span style="color:var(--accent-green);"><i class="fas fa-check-circle"></i> Acknowledged</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

window.acknowledgeNotif = async function(id, source) {
    console.log("Acknowledging:", id, "from source:", source);
    if (!id || !source) return;
    
    try {
        const btn = document.querySelector(`#notif-${id} .btn-ack`);
        if (btn) {
            btn.disabled = true;
            btn.innerText = 'Acknowledging...';
        }

        await updateDoc(doc(db, source, id), {
            status: 'acknowledged',
            acknowledged_at: serverTimestamp(),
            acknowledged_by: auth.currentUser?.email || 'admin'
        });
        
        // If it was an accident, clear the incident_active flag on the driver
        if (source === 'accidents') {
            const accidentSnap = await getDoc(doc(db, "accidents", id));
            if (accidentSnap.exists()) {
                const driverId = accidentSnap.data().driver_uid || accidentSnap.data().driver_id;
                if (driverId) {
                    await updateDoc(doc(db, "drivers", driverId), {
                        incident_active: false
                    });
                }
            }
        }
        
        console.log("Successfully acknowledged in Firestore");

        // Log to activity
        await addDoc(collection(db, "activity"), {
            type: 'system',
            title: 'Alert Acknowledged',
            message: `Admin acknowledged ${source} alert (ID: ${id})`,
            timestamp: serverTimestamp(),
            admin_email: auth.currentUser?.email || 'admin'
        });
    } catch (e) {
        console.error("Ack error:", e);
        alert("Failed to acknowledge: " + e.message);
        const btn = document.querySelector(`#notif-${id} .btn-ack`);
        if (btn) {
            btn.disabled = false;
            btn.innerText = 'Acknowledge';
        }
    }
};

function formatTime(ts) {
    if (!ts) return 'Just now';
    try {
        const d = ts.toDate ? ts.toDate() : new Date(ts.seconds ? ts.seconds * 1000 : ts);
        return d.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return '—'; }
}

window.filterBy = function(type, el) {
    currentFilter = type;
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    renderFiltered();
};

window.markAllRead = async function() {
    const unreadAlerts = allNotifs.filter(n => (n.type === 'accident') && n.status !== 'acknowledged');
    if (unreadAlerts.length === 0) return;

    // Ensure we have access to the Firestore functions in this scope
    const _addDoc = addDoc; 
    const _updateDoc = updateDoc;
    const _doc = doc;
    const _collection = collection;

    try {
        const btn = document.querySelector('.btn-mark-all');
        if (btn) {
            btn.disabled = true;
            btn.innerText = 'Acknowledging...';
        }

        const promises = unreadAlerts.map(n => 
            _updateDoc(_doc(db, n.source, n.id), {
                status: 'acknowledged',
                acknowledged_at: serverTimestamp(),
                acknowledged_by: auth.currentUser?.email || 'admin'
            })
        );

        await Promise.all(promises);

        // Log the bulk action
        await _addDoc(_collection(db, "activity"), {
            type: 'system',
            title: 'Bulk Acknowledgment',
            message: `Admin acknowledged ${unreadAlerts.length} alerts at once.`,
            timestamp: serverTimestamp()
        });

        if (btn) {
            btn.innerText = 'Marked All as Read';
            setTimeout(() => { btn.disabled = false; btn.innerText = 'Mark All as Read'; }, 2000);
        }
    } catch (e) {
        console.error("Bulk Ack error:", e);
        alert("Failed to acknowledge some alerts: " + e.message);
    }
};
