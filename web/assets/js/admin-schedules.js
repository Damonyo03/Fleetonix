import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot, doc, getDoc, updateDoc, deleteDoc, orderBy, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { initLayout, showModal, hideModal } from "./modules/ui.js";

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
    initPublishFeature();
});



function initPublishFeature() {
    const btn = document.getElementById('publishAllBtn');
    if (btn) {
        btn.onclick = async () => {
            const unpublished = allSchedules.filter(d => d.data().is_published === false);
            if (unpublished.length === 0) {
                alert("No draft schedules to publish.");
                return;
            }

            if (!confirm(`Are you sure you want to publish ${unpublished.length} draft schedules? This will make them visible to drivers immediately.`)) return;

            try {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publishing...';

                const batchPromises = unpublished.map(d => 
                    updateDoc(doc(db, "schedules", d.id), {
                        is_published: true,
                        updated_at: serverTimestamp()
                    })
                );

                await Promise.all(batchPromises);
                alert(`${unpublished.length} schedules published successfully!`);
            } catch (error) {
                console.error("Publish error:", error);
                alert("Failed to publish schedules: " + error.message);
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-paper-plane"></i> Post All Schedules';
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
        scheduleTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">No active schedules found.</td></tr>';
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

        if (sched.is_published === false) {
            statusHtml = `<span class="status-badge" style="background: rgba(255, 171, 0, 0.1); color: #ffab00; border: 1px solid #ffab00;">DRAFT</span> ${statusHtml}`;
        }

        const isTrackingAvailable = sched.status !== 'completed' && sched.status !== 'cancelled';

        return `
            <tr>
                <td><div style="font-weight:700;">${sched.driver_name || 'N/A'}</div></td>
                <td>${sched.passenger_name || sched.client_name || (sched.is_published ? 'Published' : 'Draft Assignment')}</td>
                <td><div style="font-size:0.85rem; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${sched.pickup_location?.address || 'N/A'}">${sched.pickup_location?.address || (Array.isArray(sched.pickup_location) ? sched.pickup_location[0]?.address : sched.pickup_location) || 'N/A'}</div></td>
                <td>${sched.schedule_time || 'N/A'}</td>
                <td>${statusHtml}</td>
                <td class="table-actions" style="text-align: right;">
                    <button class="btn-icon" title="Share Tracking Link" onclick="window.shareTrackingLink('${id}')" style="background: rgba(16, 185, 129, 0.1); color: var(--accent-green); display: ${isTrackingAvailable ? 'inline-block' : 'none'};">
                        <i class="fas fa-share-alt"></i>
                    </button>
                    <button class="btn-icon edit" title="Update Status" onclick="window.updateScheduleStatus('${id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon delete" title="Cancel Trip" onclick="window.deleteSchedule('${id}')"><i class="fas fa-times"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

window.shareTrackingLink = (id) => {
    const trackingUrl = `${window.location.origin}/tracking.html?tripId=${id}`;
    navigator.clipboard.writeText(trackingUrl).then(() => {
        alert("Tracking link copied to clipboard!\n\nYou can now send this to the passenger.");
    }).catch(err => {
        console.error("Copy failed:", err);
        prompt("Could not copy automatically. Copy this URL manually:", trackingUrl);
    });
};


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
            }
        }

        // Add to audit trail
        await addDoc(collection(db, "activity"), {
            type: 'system',
            title: 'Trip Status Updated',
            message: `Admin manually updated Trip #${id} to ${newStatus}`,
            timestamp: serverTimestamp()
        });
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

        // Audit log
        await addDoc(collection(db, "activity"), {
            type: 'security',
            title: 'Trip Discarded',
            message: `Admin cancelled & deleted Dispatch #${id}`,
            timestamp: serverTimestamp()
        });

        alert("Schedule deleted successfully.");
    } catch (error) {
        console.error("Delete schedule error:", error);
        alert("Failed to delete schedule: " + error.message);
    }
};
