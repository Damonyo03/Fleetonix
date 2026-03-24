import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot, doc, getDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { initLayout } from "./modules/ui.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentEmail = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../login.html';
        return;
    }

    currentEmail = user.email;

    // Verify User Data
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const userData = userDoc.exists() ? userDoc.data() : null;
    const name = userData ? userData.full_name : user.email.split('@')[0];

    // Initialize Layout
    initLayout("Active Schedules", name);
    setupLogout();
    
    // Initial Load
    loadSchedules('all');
    
    // Filter Listener
    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) {
        statusFilter.addEventListener('change', (e) => {
            loadSchedules(e.target.value);
        });
    }
});

function loadSchedules(status) {
    let q = query(collection(db, "schedules"), 
        where("client_email", "==", currentEmail), 
        orderBy("scheduled_date", "desc"));
    
    if (status !== 'all') {
        q = query(collection(db, "schedules"), 
            where("client_email", "==", currentEmail), 
            where("status", "==", status),
            orderBy("scheduled_date", "desc"));
    }

    const tableBody = document.getElementById('schedulesTableBody');
    
    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">No schedules found.</td></tr>';
            return;
        }

        tableBody.innerHTML = snapshot.docs.map(doc => {
            const data = doc.data();
            const scheduleId = doc.id;
            const currentStatus = data.status || 'pending';
            const phase = data.trip_phase || 'N/A';
            
            return `
                <tr>
                    <td>
                        <strong>${data.driver_name || 'Unassigned'}</strong>
                        ${data.driver_phone ? `<br><small style="color: var(--text-muted);">${data.driver_phone}</small>` : ''}
                    </td>
                    <td>
                        ${data.vehicle_assigned || 'N/A'}
                        ${data.plate_number ? `<br><small style="color: var(--text-muted);">${data.plate_number}</small>` : ''}
                    </td>
                    <td>
                        <div style="max-width: 200px; font-size: 0.85em;">
                            <i class="fas fa-circle-dot" style="color: #00ff88; font-size: 0.7em;"></i> ${data.pickup_location || 'N/A'}<br>
                            <i class="fas fa-location-dot" style="color: #ff6b6b; font-size: 0.7em;"></i> ${data.dropoff_location || 'N/A'}
                        </div>
                    </td>
                    <td>
                        <div>${data.scheduled_date || 'N/A'}</div>
                        <small style="color: var(--text-muted);">${data.scheduled_time || ''}</small>
                    </td>
                    <td>
                        <span class="status-badge ${currentStatus}">
                            ${currentStatus.replace('_', ' ')}
                        </span>
                        <br>
                        <span class="status-badge ${data.trip_phase || 'pending'}" style="margin-top: 4px; font-size: 0.65em; opacity: 0.9;">
                            ${(data.trip_phase || 'Preparing').replace('_', ' ')}
                        </span>
                    </td>
                    <td>
                        <div class="action-buttons">
                            <a href="schedule_view.html?id=${scheduleId}" class="btn-icon view" title="Track Live"><i class="fas fa-location-arrow"></i></a>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    });

    // Real-time text counter for Notifications
    onSnapshot(query(collection(db, "notifications"), 
        where("user_email", "==", currentEmail),
        where("status", "==", "unread")), (snapshot) => {
        const counters = document.querySelectorAll('.notif-count');
        counters.forEach(counter => {
            counter.innerText = snapshot.size;
        });
    });
}


