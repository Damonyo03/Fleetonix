import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    getFirestore, collection, query, where, onSnapshot, orderBy,
    doc, getDoc, getDocs
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { initLayout } from "./modules/ui.js";
import { exportToExcel, mapTicketsForExport } from "./modules/export_utils.js";

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

let allTickets = [];
let uniqueDrivers = new Set();
let currentUserData = null; // Store admin user data for RBAC

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../login.html';
        return;
    }

    const userDoc = await getDoc(doc(db, "users", user.uid));
    const userData = userDoc.exists() ? userDoc.data() : {};
    currentUserData = userData;
    currentUserData.uid = user.uid;
    const name = userData.full_name || user.email.split('@')[0];
    initLayout('Trip Tickets', name);

    const role = userData?.role || userData?.user_type;
    
    loadTickets();
});


function loadTickets() {
    if (!currentUserData) {
        console.warn("User data not loaded yet.");
        return;
    }

    const role = currentUserData.role || currentUserData.user_type;

    // --- Real-time listener on trip_tickets (primary source from Android app) ---
    let tripTicketsQuery;
    if (role === 'driver') {
        tripTicketsQuery = query(
            collection(db, "trip_tickets"),
            where("driver_id", "==", currentUserData.uid),
            orderBy("created_at", "desc")
        );
    } else {
        tripTicketsQuery = query(
            collection(db, "trip_tickets"),
            orderBy("created_at", "desc")
        );
    }

    onSnapshot(tripTicketsQuery, (snapshot) => {
        // Map trip_tickets into a uniform structure
        const tripTickets = snapshot.docs.map(d => {
            const data = d.data();
            return {
                id: d.id,
                _source: 'trip_tickets',
                driver_name: data.driver_name || data.driverName || '—',
                driver_uid: data.driver_uid || '',
                driver_email: data.driver_email || '',
                vehicle_assigned: data.vehicle_assigned || data.vehicle_type || '—',
                plate_number: data.plate_number || data.vehicle_plate || '—',
                client_name: data.client_name || '—',
                pickup_location: data.pickup_location || '—',
                dropoff_location: data.dropoff_location || '—',
                time_of_departure: data.time_of_departure || data.accepted_at || '—',
                picked_up_at: data.picked_up_at || '—',
                time_of_arrival: data.time_of_arrival || '—',
                total_km_travelled: data.total_km || data.total_km_travelled || 0,
                route_polyline: data.route_polyline || '',
                completed_at: data.created_at,
                schedule_date: data.schedule_date || '',
                schedule_time: data.schedule_time || '',
                ...data
            };
        });

        // --- Also listen to completed schedules (legacy source) ---
        let schedulesQuery;
        if (role === 'driver') {
            schedulesQuery = query(
                collection(db, "schedules"),
                where("status", "==", "completed"),
                where("driver_id", "==", currentUserData.uid)
            );
        } else {
            schedulesQuery = query(
                collection(db, "schedules"),
                where("status", "==", "completed")
            );
        }

        onSnapshot(schedulesQuery, (schedSnap) => {
            const schedTickets = schedSnap.docs.map(d => ({ id: d.id, _source: 'schedules', ...d.data() }));

            // Merge: trip_tickets takes priority; add schedules not already covered
            const tripTicketIds = new Set(tripTickets.map(t => t.id));
            const mergedSchedules = schedTickets.filter(s => !tripTicketIds.has(s.id));

            allTickets = [...tripTickets, ...mergedSchedules];
            // Sort by completed_at descending
            allTickets.sort((a, b) => {
                const at = a.completed_at?.toMillis?.() || a.completed_at?.seconds * 1000 || 0;
                const bt = b.completed_at?.toMillis?.() || b.completed_at?.seconds * 1000 || 0;
                return bt - at;
            });

            populateDriverFilter();
            renderTickets(allTickets);
            updateSummaryStats(allTickets);
        }, (err) => {
            console.warn("Schedules listener error:", err.message);
            // Just use trip_tickets if schedules fails
            allTickets = tripTickets;
            populateDriverFilter();
            renderTickets(allTickets);
            updateSummaryStats(allTickets);
        });
    }, (error) => {
        console.error("trip_tickets listener failed:", error.message);
        // Fallback: listen to completed schedules only
        const q = query(collection(db, "schedules"), where("status", "==", "completed"));
        onSnapshot(q, (snapshot) => {
            allTickets = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            allTickets.sort((a, b) => {
                const at = a.completed_at?.toMillis?.() || 0;
                const bt = b.completed_at?.toMillis?.() || 0;
                return bt - at;
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

                ${ticket.route_polyline ? `
                    <button class="btn-view-route" onclick="viewTripRoute('${ticket.id}', '${ticket.route_polyline}', '${ticket.driver_name}')">
                        <i class="fas fa-map-marked-alt"></i> View Traveled Route Map
                    </button>
                ` : ''}
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

window.applyFilters = function () {
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

window.clearFilters = function () {
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    document.getElementById('filterDriver').value = '';
    renderTickets(allTickets);
    updateSummaryStats(allTickets);
};

window.exportTripTickets = function () {
    const fromDate = document.getElementById('filterDateFrom').value;
    const toDate = document.getElementById('filterDateTo').value;
    const driver = document.getElementById('filterDriver').value;

    // Use the currently filtered list if any, otherwise all tickets
    // Actually, it's better to just apply current filters to allTickets
    let filtered = [...allTickets];
    if (driver) filtered = filtered.filter(t => t.driver_name === driver);
    // ... we could use same logic as applyFilters but let's just use a global `currentFilteredTickets`

    // For simplicity, let's just export what's currently being shown or re-filter
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

    const exportData = mapTicketsForExport(filtered);
    const dateStr = new Date().toISOString().split('T')[0];
    exportToExcel(exportData, `Fleetonix_Trip_Report_${dateStr}.xlsx`, 'Completed Trips');
};

// Route Map Modal Management
let routeMap = null;
let currentPolyline = null;

window.viewTripRoute = function (id, polyline, driverName) {
    const modal = document.getElementById('routeModal');
    if (!modal) return;

    modal.style.display = 'flex';

    // Initialize map if not already done
    if (!routeMap) {
        routeMap = new google.maps.Map(document.getElementById('routeMap'), {
            zoom: 13,
            center: { lat: 0, lng: 0 },
            styles: [
                { "elementType": "geometry", "stylers": [{ "color": "#242f3e" }] },
                { "elementType": "labels.text.stroke", "stylers": [{ "color": "#242f3e" }] },
                { "elementType": "labels.text.fill", "stylers": [{ "color": "#746855" }] },
                { "featureType": "administrative.locality", "elementType": "labels.text.fill", "stylers": [{ "color": "#d59563" }] },
                { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [{ "color": "#d59563" }] },
                { "featureType": "poi.park", "elementType": "geometry", "stylers": [{ "color": "#263c3f" }] },
                { "featureType": "poi.park", "elementType": "labels.text.fill", "stylers": [{ "color": "#6b9a76" }] },
                { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#38414e" }] },
                { "featureType": "road", "elementType": "geometry.stroke", "stylers": [{ "color": "#212a37" }] },
                { "featureType": "road", "elementType": "labels.text.fill", "stylers": [{ "color": "#9ca5b3" }] },
                { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "color": "#746855" }] },
                { "featureType": "road.highway", "elementType": "geometry.stroke", "stylers": [{ "color": "#1f2835" }] },
                { "featureType": "road.highway", "elementType": "labels.text.fill", "stylers": [{ "color": "#f3d19c" }] },
                { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#17263c" }] },
                { "featureType": "water", "elementType": "labels.text.fill", "stylers": [{ "color": "#515c6d" }] },
                { "featureType": "water", "elementType": "labels.text.stroke", "stylers": [{ "color": "#17263c" }] }
            ]
        });
    }

    // Clear existing polyline
    if (currentPolyline) {
        currentPolyline.setMap(null);
    }

    try {
        const decodedPath = google.maps.geometry.encoding.decodePath(polyline);

        currentPolyline = new google.maps.Polyline({
            path: decodedPath,
            geodesic: true,
            strokeColor: '#14b8a6',
            strokeOpacity: 1.0,
            strokeWeight: 5,
            map: routeMap
        });

        // Fit bounds
        const bounds = new google.maps.LatLngBounds();
        decodedPath.forEach(p => bounds.extend(p));
        routeMap.fitBounds(bounds);
    } catch (e) {
        console.error("Error decoding polyline:", e);
    }
};

// Close modal logic
document.addEventListener('DOMContentLoaded', () => {
    const routeModal = document.getElementById('routeModal');
    const closeBtn = document.getElementById('closeRouteModal');
    const closeBtnFooter = document.getElementById('closeRouteModalBtn');

    if (closeBtn) closeBtn.onclick = () => routeModal.style.display = 'none';
    if (closeBtnFooter) closeBtnFooter.onclick = () => routeModal.style.display = 'none';

    window.onclick = (event) => {
        if (event.target == routeModal) {
            routeModal.style.display = 'none';
        }
    };
});
