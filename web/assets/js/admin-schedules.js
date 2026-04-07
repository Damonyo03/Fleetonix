import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot, doc, getDoc, updateDoc, deleteDoc, orderBy, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { initLayout, showModal, hideModal } from "./modules/ui.js";
import { exportToExcel } from "./modules/export_utils.js";

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

const scheduleTableBody = document.getElementById('scheduleTableBody');

let allSchedules = [];

let currentUserData = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        if (!window.location.pathname.includes('login.html')) {
            window.location.href = '../login.html';
        }
        return;
    }

    const userDoc = await getDoc(doc(db, "users", user.uid));
    let userData = userDoc.exists() ? userDoc.data() : null;

    if (!userData) {
        const q = query(collection(db, "users"), where("email", "==", user.email));
        const snap = await getDocs(q);
        if (!snap.empty) {
            userData = snap.docs[0].data();
        }
    }

    const adminRoles = ['admin', 'super_admin'];
    const userRoleType = userData?.user_type || userData?.role;

    if (!userData || !adminRoles.includes(userRoleType)) {
        console.error("Access Denied: Not an administrator.");
        window.location.href = '../login.html?error=unauthorized';
        return;
    }

    currentUserData = userData;
    const name = userData.full_name || user.email.split('@')[0];
    initLayout('Trip Schedules', name);

    initScheduleList();

    initScheduleList();
    initClearDataFeature();
    initExportFeature();
});


function initExportFeature() {
    const btn = document.getElementById('exportAllBtn');
    if (btn) {
        btn.onclick = () => {
            if (allSchedules.length === 0) {
                alert("No schedules found to export.");
                return;
            }
            
            const data = allSchedules.map(d => {
                const s = d.data();
                return {
                    "Trip ID": d.id,
                    "Driver": s.driver_name || 'N/A',
                    "Client": s.client_name || 'N/A',
                    "Pickup": s.pickup_location || 'N/A',
                    "Time": s.schedule_time || 'N/A',
                    "Status": s.status || 'scheduled',
                    "Phase": s.trip_phase || 'pending',
                    "Created": s.created_at ? new Date(s.created_at.seconds * 1000).toLocaleString() : 'N/A'
                };
            });
            
            const dateStr = new Date().toISOString().split('T')[0];
            exportToExcel(data, `Fleetonix_All_Trips_${dateStr}.xlsx`, 'Active Schedules');
        };
    }
}

function initClearDataFeature() {
    const btn = document.getElementById('clearDataBtn');
    if (btn) {
        const role = currentUserData?.role || currentUserData?.user_type;
        // Only super_admin and admin can clear data
        if (role !== 'super_admin' && role !== 'admin') {
            btn.style.display = 'none';
        }
        btn.onclick = async () => {
            if (!confirm("⚠️ WARNING: This will permanently delete all schedules, bookings, activity logs, and reports. A backup will be downloaded first. Proceed?")) return;

            try {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Clearing...';

                const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
                const functionUrl = isLocal 
                    ? "http://localhost:5001/appfleetonix/us-central1/adminClearData"
                    : "https://us-central1-appfleetonix.cloudfunctions.net/adminClearData";

                const response = await fetch(functionUrl, { method: "POST" });
                const result = await response.json();

                if (result.success) {
                    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(result.backup, null, 2));
                    const downloadAnchorNode = document.createElement('a');
                    downloadAnchorNode.setAttribute("href", dataStr);
                    downloadAnchorNode.setAttribute("download", `fleetonix_backup_${new Date().toISOString().split('T')[0]}.json`);
                    document.body.appendChild(downloadAnchorNode);
                    downloadAnchorNode.click();
                    downloadAnchorNode.remove();

                    alert("Data cleared successfully! Backup downloaded.");
                    window.location.reload();
                } else {
                    throw new Error(result.message);
                }
            } catch (error) {
                console.error("Clear data error:", error);
                alert("Failed to clear data: " + error.message);
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-trash-alt"></i> Clear All Data';
            }
        };
    }
}

function initScheduleList() {
    const q = query(collection(db, "schedules"), orderBy("created_at", "desc"));
    onSnapshot(q, (snapshot) => {
        allSchedules = snapshot.docs;
        renderSchedules(allSchedules);
    });
}

function renderSchedules(docs) {
    if (docs.length === 0) {
        scheduleTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">No schedules found.</td></tr>';
        return;
    }

    scheduleTableBody.innerHTML = docs.map(d => {
        const sched = d.data();
        const id = d.id;
        
        let statusHtml = '';
        if (sched.status === 'completed') {
            statusHtml = '<span class="status-badge completed">Completed</span>';
        } else if (sched.status === 'cancelled') {
            statusHtml = '<span class="status-badge cancelled">Cancelled</span>';
        } else {
            const phase = sched.trip_phase || 'pending';
            const phaseMap = {
                'pending': { label: 'Scheduled', cls: 'scheduled' },
                'pickup': { label: 'OTW to Pickup', cls: 'in-transit' },
                'dropoff': { label: 'Picked Up', cls: 'success' },
                'return_pickup': { label: 'Returning', cls: 'warning' },
                'ready_to_complete': { label: 'Dropped Off', cls: 'success' }
            };
            const p = phaseMap[phase] || { label: phase, cls: 'info' };
            statusHtml = `<span class="status-badge ${p.cls}">${p.label}</span>`;
        }

        return `
            <tr>
                <td>${sched.driver_name || 'N/A'}</td>
                <td>${sched.isOfficial ? '<span class="status-badge available">Official</span>' : '<span class="status-badge info">Fleet Assign</span>'}</td>
                <td>${sched.pickup_location?.address || (Array.isArray(sched.pickup_location) ? sched.pickup_location[0]?.address : sched.pickup_location) || 'N/A'}</td>
                <td>${sched.schedule_time || 'N/A'}</td>
                <td>${statusHtml}</td>
                <td class="table-actions">
                    <button class="btn-icon edit" title="Update Status" onclick="window.updateScheduleStatus('${id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon delete" title="Cancel Trip" onclick="window.deleteSchedule('${id}')"><i class="fas fa-times"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

window.updateScheduleStatus = async (id) => {
    const snap = await getDoc(doc(db, "schedules", id));
    if (!snap.exists()) return;
    const sched = snap.data();

    const content = `
        <div class="form-group">
            <label>Current Status</label>
            <select id="modal_status" class="form-input">
                <option value="scheduled" ${sched.status === 'scheduled' ? 'selected' : ''}>Scheduled</option>
                <option value="in-transit" ${sched.status === 'in-transit' ? 'selected' : ''}>In Transit</option>
                <option value="completed" ${sched.status === 'completed' ? 'selected' : ''}>Completed</option>
                <option value="cancelled" ${sched.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
            </select>
        </div>
    `;

    showModal('schedule-modal', 'Update Schedule', content, async () => {
        const newStatus = document.getElementById('modal_status').value;
        await updateDoc(doc(db, "schedules", id), {
            status: newStatus,
            updated_at: serverTimestamp()
        });

        if (newStatus === 'completed' || newStatus === 'cancelled') {
            if (sched.driver_id) {
                await updateDoc(doc(db, "drivers", sched.driver_id), {
                    current_status: 'available',
                    updated_at: serverTimestamp()
                });
            }
        }
    });
};

window.deleteSchedule = async (id) => {
    if (!confirm("Are you sure you want to cancel and delete this schedule?")) return;
    try {
        const snap = await getDoc(doc(db, "schedules", id));
        if (snap.exists()) {
            const data = snap.data();
            if (data.driver_id) {
                await updateDoc(doc(db, "drivers", data.driver_id), {
                    current_status: 'available',
                    updated_at: serverTimestamp()
                });
            }
            if (data.booking_id) {
                await updateDoc(doc(db, "bookings", data.booking_id), {
                    status: 'pending',
                    updated_at: serverTimestamp()
                });
            }
        }
        await deleteDoc(doc(db, "schedules", id));
        alert("Schedule deleted successfully.");
    } catch (error) {
        console.error("Delete schedule error:", error);
        alert("Failed to delete schedule: " + error.message);
    }
};
