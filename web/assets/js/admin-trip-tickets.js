import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    getFirestore, collection, query, where, onSnapshot, orderBy,
    doc, getDoc, getDocs
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { initLayout } from "./modules/ui.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let allTickets = [];
let uniqueDrivers = new Set();

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../login.html';
        return;
    }

    const userDoc = await getDoc(doc(db, "users", user.uid));
    const name = userDoc.exists() ? (userDoc.data().full_name || user.email.split('@')[0]) : user.email.split('@')[0];
    initLayout('Trip Tickets', name);

    loadTickets();
});

function loadTickets() {
    // Listen real-time to completed schedules
    const q = query(
        collection(db, "schedules"),
        where("status", "==", "completed"),
        orderBy("completed_at", "desc")
    );

    // Fallback: also catch trips where trip_phase is completed
    onSnapshot(q, (snapshot) => {
        allTickets = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        populateDriverFilter();
        renderTickets(allTickets);
        updateSummaryStats(allTickets);
    }, async (error) => {
        // Fallback if index not ready - fetch without orderBy
        console.warn("Primary query failed, trying fallback:", error.message);
        const q2 = query(collection(db, "schedules"), where("status", "==", "completed"));
        onSnapshot(q2, (snapshot) => {
            allTickets = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            // Sort client-side
            allTickets.sort((a, b) => {
                const aTime = a.completed_at?.toMillis?.() || 0;
                const bTime = b.completed_at?.toMillis?.() || 0;
                return bTime - aTime;
            });
            populateDriverFilter();
            renderTickets(allTickets);
            updateSummaryStats(allTickets);
        });
    });
}

function populateDriverFilter() {
    const select = document.getElementById('filterDriver');
    if (!select) return;

    const currentVal = select.value;
    uniqueDrivers.clear();
    allTickets.forEach(t => { if (t.driver_name) uniqueDrivers.add(t.driver_name); });

    select.innerHTML = '<option value="">All Drivers</option>' +
        [...uniqueDrivers].sort().map(name => `<option value="${name}" ${name === currentVal ? 'selected' : ''}>${name}</option>`).join('');
}

function updateSummaryStats(tickets) {
    const totalTrips = tickets.length;
    const totalKm = tickets.reduce((sum, t) => {
        const km = parseFloat(t.total_km_travelled || t.totalKmTravelled || 0);
        return sum + km;
    }, 0);
    const drivers = new Set(tickets.map(t => t.driver_id).filter(Boolean)).size;

    document.getElementById('totalTrips').textContent = totalTrips;
    document.getElementById('totalKm').textContent = totalKm.toFixed(1);
    document.getElementById('totalDrivers').textContent = drivers;
}

function renderTickets(tickets) {
    const container = document.getElementById('ticketsList');
    if (!container) return;

    if (tickets.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-ticket-alt"></i>
                <p>No completed trip tickets found.</p>
                <small>Tickets appear here automatically when a driver completes a trip.</small>
            </div>
        `;
        return;
    }

    container.innerHTML = tickets.map(ticket => {
        const completedAt = formatTimestamp(ticket.completed_at);
        const acceptedAt = ticket.accepted_at || ticket.time_of_departure || '—';
        const pickedUpAt = ticket.picked_up_at || ticket.timeOfDeparture || '—';
        const arrivalAt = ticket.time_of_arrival || ticket.timeOfArrival || '—';
        const totalKm = parseFloat(ticket.total_km_travelled || ticket.totalKmTravelled || 0).toFixed(2);
        const vehicleType = ticket.vehicle_type || ticket.vehicle_assigned || '—';
        const plateNumber = ticket.plate_number || '—';

        return `
            <div class="ticket-card" id="ticket-${ticket.id}">
                <div class="ticket-header">
                    <div>
                        <div class="ticket-id"><i class="fas fa-hashtag"></i> Schedule ID: ${ticket.id.substring(0, 12).toUpperCase()}</div>
                        <div class="ticket-driver"><i class="fas fa-user"></i> ${ticket.driver_name || '—'}</div>
                        <div class="ticket-vehicle"><i class="fas fa-car"></i> ${vehicleType} &nbsp;·&nbsp; <i class="fas fa-id-card"></i> ${plateNumber}</div>
                    </div>
                    <div style="text-align: right;">
                        <span class="status-badge completed">Completed</span>
                        <div style="font-size:0.78em; color:var(--text-muted); margin-top:6px;">
                            <i class="fas fa-calendar-check"></i> ${completedAt}
                        </div>
                    </div>
                </div>

                <div class="ticket-metrics">
                    <div class="metric-box">
                        <div class="metric-label"><i class="fas fa-flag-checkered"></i> Start Time</div>
                        <div class="metric-value">${acceptedAt}</div>
                    </div>
                    <div class="metric-box">
                        <div class="metric-label"><i class="fas fa-map-marker-alt"></i> Departure</div>
                        <div class="metric-value">${pickedUpAt}</div>
                    </div>
                    <div class="metric-box">
                        <div class="metric-label"><i class="fas fa-flag"></i> Arrival</div>
                        <div class="metric-value">${arrivalAt}</div>
                    </div>
                    <div class="metric-box">
                        <div class="metric-label"><i class="fas fa-road"></i> Distance</div>
                        <div class="metric-value">${totalKm} km</div>
                    </div>
                </div>

                <div class="ticket-route">
                    <i class="fas fa-map-marker-alt" style="color:var(--accent-blue);"></i>
                    <span>${ticket.pickup_location || '—'}</span>
                    <span class="route-arrow"><i class="fas fa-long-arrow-alt-right"></i></span>
                    <i class="fas fa-flag-checkered" style="color:var(--accent-green);"></i>
                    <span>${ticket.dropoff_location || '—'}</span>
                </div>
                <div class="ticket-client">
                    <i class="fas fa-user-tie"></i> Client: ${ticket.client_name || '—'} &nbsp;
                    ${ticket.schedule_date ? `· <i class="fas fa-calendar"></i> ${ticket.schedule_date} ${ticket.schedule_time || ''}` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function formatTimestamp(ts) {
    if (!ts) return '—';
    try {
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleString('en-PH', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch {
        return '—';
    }
}

window.applyFilters = function() {
    const fromDate = document.getElementById('filterDateFrom').value;
    const toDate = document.getElementById('filterDateTo').value;
    const driver = document.getElementById('filterDriver').value;

    let filtered = [...allTickets];

    if (driver) {
        filtered = filtered.filter(t => t.driver_name === driver);
    }

    if (fromDate) {
        const from = new Date(fromDate);
        filtered = filtered.filter(t => {
            const d = t.completed_at?.toDate ? t.completed_at.toDate() : new Date(t.completed_at || 0);
            return d >= from;
        });
    }

    if (toDate) {
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        filtered = filtered.filter(t => {
            const d = t.completed_at?.toDate ? t.completed_at.toDate() : new Date(t.completed_at || 0);
            return d <= to;
        });
    }

    renderTickets(filtered);
    updateSummaryStats(filtered);
};

window.clearFilters = function() {
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    document.getElementById('filterDriver').value = '';
    renderTickets(allTickets);
    updateSummaryStats(allTickets);
};
