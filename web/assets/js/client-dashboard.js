import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot, getDocs, doc, getDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { initLayout } from "./modules/ui.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentClientData = null;
let activeTripMap = null;
let driverLocationMarker = null;
let pickupData = null;
let dropoffData = null;

// Authentication Listener
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../login.html';
        return;
    }

    // Verify Client Role
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const userData = userDoc.exists() ? userDoc.data() : null;
    
    currentUser = user;
    currentClientData = userData || { full_name: user.email.split('@')[0], email: user.email };
    
    const name = currentClientData.full_name || user.email.split('@')[0];
    // Use initLayout so the name is cached in localStorage for consistent display across all pages
    initLayout('Dashboard', name);

    // Initialize Dashboard Data
    listenForDashboardData();
    initDashboardUI();
});

function initDashboardUI() {
    const toggleBtn = document.getElementById('toggleStatsBtn');
    const secondaryStats = document.getElementById('secondaryStats');
    
    if (toggleBtn && secondaryStats) {
        toggleBtn.addEventListener('click', () => {
            const isShowing = secondaryStats.classList.toggle('show');
            toggleBtn.innerHTML = isShowing ? 
                '<i class="fas fa-chevron-up"></i> Less Insights' : 
                '<i class="fas fa-chevron-down"></i> More Insights';
        });
    }
}

// Implementation of Status-First Dashboard Logic
function listenForDashboardData() {
    if (!currentUser) return;

    // 1. Aggregates & Recent Bookings
    const bookingQuery = query(
        collection(db, "bookings"),
        where("client_id", "==", currentUser.uid)
    );

    onSnapshot(bookingQuery, (snapshot) => {
        let total = 0;
        let pending = 0;
        let completed = 0;
        const bookings = [];

        snapshot.forEach((doc) => {
            const data = doc.data();
            total++;
            if (data.status === 'pending') pending++;
            if (data.status === 'completed') completed++;
            bookings.push({ id: doc.id, ...data });
        });

        // Update Stats
        document.getElementById('totalBookings').innerText = total;
        document.getElementById('pendingBookings').innerText = pending;
        document.getElementById('completedBookings').innerText = completed;

        // Render Recent Bookings (Last 5)
        const sorted = bookings.sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0));
        renderRecentBookings(sorted.slice(0, 5));
    });

    // 2. Active Schedules
    const activePhases = ['pending', 'started', 'pickup', 'dropoff', 'arrived'];
    const scheduleQuery = query(
        collection(db, "schedules"),
        where("client_id", "==", currentUser.uid),
        where("trip_phase", "in", activePhases)
    );

    onSnapshot(scheduleQuery, async (snapshot) => {
        document.getElementById('activeSchedules').innerText = snapshot.size;
        
        const scheduleList = [];
        for (const d of snapshot.docs) {
            const data = d.data();
            let driverName = "Assigning...";
            
            if (data.driver_id) {
                const driverDoc = await getDoc(doc(db, "users", data.driver_id));
                if (driverDoc.exists()) driverName = driverDoc.data().full_name;
            }
            
            scheduleList.push({ id: d.id, driverName, ...data });
        }
        renderActiveSchedules(scheduleList);
    });
}

function renderRecentBookings(bookings) {
    const tbody = document.getElementById('recentBookingsTable');
    if (bookings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 40px;">No bookings found.</td></tr>';
        return;
    }

    tbody.innerHTML = bookings.map(b => `
        <tr>
            <td style="max-width: 200px;">
                <div style="font-weight: 500; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${b.pickup_location?.text || 'Point A'}</div>
                <div style="font-size: 0.8em; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${b.dropoff_location?.text || 'Point B'}</div>
            </td>
            <td>${b.pickup_date || 'N/A'}</td>
            <td><span class="status-badge ${b.status}">${b.status.toUpperCase()}</span></td>
        </tr>
    `).join('');
}

function renderActiveSchedules(schedules) {
    const tbody = document.getElementById('activeSchedulesTable');
    if (schedules.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 40px;">No active schedules.</td></tr>';
        return;
    }

    tbody.innerHTML = schedules.map(s => `
        <tr>
            <td style="max-width: 200px;">
                <div style="display: flex; align-items: center; gap: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    <div style="width: 32px; height: 32px; flex-shrink: 0; background: var(--bg-input); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.9em; border: 1px solid var(--accent-blue);">
                        ${s.driverName.charAt(0)}
                    </div>
                    <span style="overflow: hidden; text-overflow: ellipsis;">${s.driverName}</span>
                </div>
            </td>
            <td>
                <span style="color: var(--accent-green); font-weight: 600; font-size: 0.9em;">
                    ${s.trip_phase.toUpperCase()}
                </span>
            </td>
            <td>
                <a href="schedule_view.html?id=${s.id}" class="btn-icon" title="View Trip" style="color: var(--accent-blue);"><i class="fas fa-external-link-alt"></i></a>
            </td>
        </tr>
    `).join('');
}



