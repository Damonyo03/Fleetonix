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
    listenToVehicleIssues();
    listenToAccidents();
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
function listenToTrips() {
    const q = query(collection(db, "schedules"), orderBy("updated_at", "desc"));
    onSnapshot(q, (snapshot) => {
        const trips = snapshot.docs.map(d => {
            const s = d.data();
            return {
                id: d.id, source: 'trips', type: 'trip',
                title: `Trip Update: Schedule #${s.schedule_id}`,
                message: `Status: ${s.trip_phase || s.status} | Driver: ${s.driver_name || 'N/A'}`,
                driver: s.driver_name,
                created_at: s.updated_at || s.created_at,
                is_read: true
            };
        });
        mergeAndRender('trips', trips);
    }, (err) => {
        onSnapshot(collection(db, "schedules"), (snapshot) => {
            const trips = snapshot.docs.map(d => {
                const s = d.data();
                return {
                    id: d.id, source: 'trips', type: 'trip',
                    title: `Trip Update: Schedule #${s.schedule_id}`,
                    message: `Status: ${s.trip_phase || s.status} | Driver: ${s.driver_name || 'N/A'}`,
                    driver: s.driver_name,
                    created_at: s.updated_at || s.created_at,
                    is_read: true
                };
            });
            mergeAndRender('trips', trips);
        });
    });
}

/** Listens to vehicle issues from mobile app */
function listenToVehicleIssues() {
    const q = query(collection(db, "vehicle_issues"), orderBy("reported_at", "desc"));
    onSnapshot(q, (snapshot) => {
        const issues = snapshot.docs.map(d => {
            const data = d.data();
            return {
                id: d.id, source: 'vehicle_issues', type: 'vehicle_issue',
                title: `Vehicle Issue: ${data.issue_type || 'Reported'}`,
                message: data.description || 'No description provided',
                driver: data.driver_email,
                coords: data.latitude && data.longitude ? `${data.latitude}, ${data.longitude}` : null,
                created_at: data.reported_at,
                is_read: false
            };
        });
        mergeAndRender('issues', issues);
    }, (err) => {
        onSnapshot(collection(db, "vehicle_issues"), (snapshot) => {
            const issues = snapshot.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id, source: 'vehicle_issues', type: 'vehicle_issue',
                    title: `Vehicle Issue: ${data.issue_type || 'Reported'}`,
                    message: data.description || 'No description provided',
                    driver: data.driver_email,
                    coords: data.latitude && data.longitude ? `${data.latitude}, ${data.longitude}` : null,
                    created_at: data.reported_at,
                    is_read: false
                };
            });
            mergeAndRender('issues', issues);
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
        const isAlert = n.type === 'accident' || n.type === 'vehicle_issue';
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
        issue: allNotifs.filter(n => n.type === 'vehicle_issue' && n.status !== 'acknowledged').length,
        accident: allNotifs.filter(n => n.type === 'accident' && n.status !== 'acknowledged').length,
        total: allNotifs.length,
        unreadAlerts: allNotifs.filter(n => (n.type === 'accident' || n.type === 'vehicle_issue') && n.status !== 'acknowledged').length
    };

    if (document.getElementById('totalCount')) document.getElementById('totalCount').textContent = counts.total;
    if (document.getElementById('tripCount')) document.getElementById('tripCount').textContent = counts.trip;
    if (document.getElementById('issueCount')) document.getElementById('issueCount').textContent = counts.issue;
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
            if (currentFilter === 'trip') return n.type === 'trip';
            if (currentFilter === 'vehicle_issue') return n.type === 'vehicle_issue';
            if (currentFilter === 'accident') return n.type === 'accident';
            if (currentFilter === 'system') return n.type === 'system';
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
            'accident': { icon: 'fa-car-crash', cls: 'danger' },
            'vehicle_issue': { icon: 'fa-tools', cls: 'warning' },
            'system': { icon: 'fa-cog', cls: 'success' },
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
                        ${!isRead && (type === 'accident' || type === 'vehicle_issue') ? 
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
    const unreadAlerts = allNotifs.filter(n => (n.type === 'accident' || n.type === 'vehicle_issue') && n.status !== 'acknowledged');
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
