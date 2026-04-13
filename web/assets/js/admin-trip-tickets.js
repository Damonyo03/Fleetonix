import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    getFirestore, collection, query, where, onSnapshot, orderBy,
    doc, getDoc, getDocs, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { initLayout } from "./modules/ui.js";
import { exportGCRTripTicket, mapTicketsForExport } from "./modules/export_utils.js";

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);

// --- Normalization Helpers ---
function getNormalizedId(id) {
    if (!id) return '';
    return id.toString().replace(/^(TKT_|SCHED_|booking_)/, '').replace(/^#/, '').trim();
}

function getNormalizedDriverName(name) {
    if (!name) return '—';
    // Remove status tags like [ONLINE], [OFFLINE], 🟢, ⚪ and common formatting glitches
    return name.replace(/\[ONLINE\]|\[OFFLINE\]|🟢|⚪/g, '').replace(/^\s+/, '').replace(/\s+$/, '').trim();
}

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


let unsubTripTickets = null;
let unsubSchedules = null;
let rawTripTickets = [];
let rawSchedTickets = [];

function loadTickets() {
    if (!currentUserData) {
        console.warn("User data not loaded yet.");
        return;
    }

    const role = currentUserData.role || currentUserData.user_type;

    // Detach existing listeners if any
    if (unsubTripTickets) unsubTripTickets();
    if (unsubSchedules) unsubSchedules();

    // 1. Listen to trip_tickets (Real-time storage)
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

    unsubTripTickets = onSnapshot(tripTicketsQuery, (snapshot) => {
        rawTripTickets = snapshot.docs.map(d => {
            const data = d.data();
            const driverId = data.driver_id || data.driver_uid || '';
            const rawName = data.driver_name || data.driverName || '—';
            return {
                id: d.id,
                _source: 'trip_tickets',
                schedule_id: data.schedule_id || '',
                driver_name: getNormalizedDriverName(rawName),
                driver_id: driverId,
                driver_uid: driverId,
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
                route_polyline: data.recommended_route_polyline || data.route_polyline || '',
                actual_route_polyline: data.actual_route_polyline || '',
                odometer_start: data.odometer_start || 0,
                odometer_end: data.odometer_end || 0,
                completed_at: data.created_at || data.completed_at,
                schedule_date: data.schedule_date || '',
                schedule_time: data.schedule_time || '',
                ...data,
                // Override with normalized name if properties overlap
                driver_name: getNormalizedDriverName(rawName)
            };
        });
        mergeAndRender();
    });


    // 2. Listen to completed schedules (Metadata registry)
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

    unsubSchedules = onSnapshot(schedulesQuery, (snapshot) => {
        rawSchedTickets = snapshot.docs.map(d => ({
            id: d.id,
            schedule_id: d.id,
            _source: 'schedules',
            ...d.data()
        }));
        mergeAndRender();
    });
}

function mergeAndRender() {
    const existingTrips = new Map();

    // First pass: add trip_tickets (Real-time data from Android)
    rawTripTickets.forEach(t => {
        // Normalize IDs to prevent "TKT_..." and "..." from being treated as different trips
        const key = getNormalizedId(t.schedule_id || t.id);
        existingTrips.set(key, t);
    });

    // Second pass: add schedules if not already represented/enrich existing
    rawSchedTickets.forEach(s => {
        const key = getNormalizedId(s.schedule_id || s.id);

        // Normalize name from schedules too
        if (s.driver_name) s.driver_name = getNormalizedDriverName(s.driver_name);

        if (!existingTrips.has(key)) {
            existingTrips.set(key, s);
        } else {
            const existing = existingTrips.get(key);
            // Deep merge: schedule metadata fills gaps in trip_tickets
            existingTrips.set(key, { ...s, ...existing });
        }
    });


    allTickets = Array.from(existingTrips.values());

    // Sort by primary time indicator
    allTickets.sort((a, b) => {
        const getTime = (val) => {
            if (!val) return 0;
            if (val.toMillis) return val.toMillis();
            if (val.seconds) return val.seconds * 1000;
            const d = new Date(val);
            return isNaN(d.getTime()) ? 0 : d.getTime();
        };
        return getTime(b.completed_at) - getTime(a.completed_at);
    });

    populateDriverFilter();
    renderTickets(allTickets);
    updateSummaryStats(allTickets);

    // Focus on specific trip if requested via URL
    setTimeout(checkTripFocus, 800);
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

function calculateTripKm(t) {
    if (t.odometer_start > 0 && t.odometer_end > t.odometer_start) {
        return parseFloat((t.odometer_end - t.odometer_start).toFixed(2));
    }
    return parseFloat(t.total_km || t.total_km_travelled || t.totalKmTravelled || 0);
}

function updateSummaryStats(tickets) {
    const totalTrips = tickets.length;
    let totalKm = 0;
    tickets.forEach(t => { totalKm += calculateTripKm(t); });
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
        const startTime = (ticket.time_of_departure && ticket.time_of_departure !== '—') ? ticket.time_of_departure : (ticket.accepted_at || '—');
        const arrivalAt = ticket.time_of_arrival || ticket.timeOfArrival || '—';

        const totalKmVal = calculateTripKm(ticket);
        const totalKm = totalKmVal.toFixed(2);
        const vehicleType = ticket.vehicle_type || ticket.vehicle_assigned || '—';
        const plateNumber = ticket.plate_number || '—';
        const userRole = currentUserData?.role || currentUserData?.user_type;

        let routeHtml = `
            <div class="ticket-route" style="display: flex; align-items: center; gap: 12px; color: var(--text-secondary); margin: 15px 0; font-size: 0.9rem;">
                <i class="fas fa-map-marker-alt" style="color:var(--accent-blue);"></i>
                <a href="https://www.google.com/maps?q=${encodeURIComponent(ticket.pickup_location || '')}" target="_blank" style="color: inherit; text-decoration: none; border-bottom: 1px dotted var(--text-muted);">${ticket.pickup_location || '—'}</a>
                <span class="route-arrow" style="color: var(--text-muted);"><i class="fas fa-long-arrow-alt-right"></i></span>
                <i class="fas fa-flag-checkered" style="color:var(--accent-green);"></i>
                <a href="https://www.google.com/maps?q=${encodeURIComponent(ticket.dropoff_location || '')}" target="_blank" style="color: inherit; text-decoration: none; border-bottom: 1px dotted var(--text-muted);">${ticket.dropoff_location || '—'}</a>
            </div>
        `;



        return `
            <div class="ticket-card" id="ticket-${ticket.id}">
                <div class="ticket-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 15px;">
                    <div>
                        <div class="ticket-id" style="font-size: 0.7rem; color: var(--text-muted); font-weight: 600; margin-bottom: 4px;"><i class="fas fa-hashtag"></i> Schedule ID: ${ticket.id.substring(0, 12).toUpperCase()}</div>
                        <div class="ticket-driver" style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary);"><i class="fas fa-user-circle"></i> ${ticket.driver_name || '—'}</div>
                        <div class="ticket-vehicle" style="font-size: 0.8rem; color: var(--accent-blue); margin-top: 2px;"><i class="fas fa-car-side"></i> ${vehicleType} &nbsp;·&nbsp; <i class="fas fa-id-card"></i> ${plateNumber}</div>
                    </div>
                    <div style="text-align: right;">
                        <span class="status-badge completed">Completed</span>
                        ${ticket.isValidated ?
                `<div class="status-badge verified"><i class="fas fa-check-double"></i> VERIFIED & LOCKED</div>` :
                ''
            }
                        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:8px;">
                            <i class="fas fa-calendar-check"></i> ${completedAt}
                        </div>
                    </div>
                </div>

                <div class="ticket-metrics" style="display: flex; gap: 12px; margin-bottom: 24px;">
                    <div class="metric-box" style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); flex: 1; text-align: center;">
                        <div class="metric-label" style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;"><i class="fas fa-flag-checkered"></i> Start Time</div>
                        <div class="metric-value" style="font-size: 1rem; color: var(--accent-blue); font-weight: 700;">${startTime}</div>
                    </div>
                    <div class="metric-box" style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); flex: 1; text-align: center;">
                        <div class="metric-label" style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;"><i class="fas fa-flag"></i> Arrival</div>
                        <div class="metric-value" style="font-size: 1rem; color: var(--accent-green); font-weight: 700;">${arrivalAt}</div>
                    </div>
                    <div class="metric-box" style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); flex: 1; text-align: center;">
                        <div class="metric-label" style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;"><i class="fas fa-road"></i> Distance</div>
                        <div class="metric-value" style="font-size: 1rem; color: var(--accent-teal); font-weight: 700;">${totalKm} km</div>
                    </div>
                </div>

                ${routeHtml}

                <div class="ticket-client" style="margin-top: 15px; font-size: 0.85rem; color: var(--text-muted); border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <span><i class="fas fa-user-tie"></i> Client: ${ticket.client_name || '—'}</span>
                    <span><i class="fas fa-bullseye"></i> Purpose: <b style="color:var(--accent-blue);">${ticket.trip_purpose || (ticket.isOfficial ? 'OFFICIAL' : 'PERSONAL')}</b></span>
                    ${ticket.schedule_date ? `<span style="grid-column: span 2;"><i class="fas fa-calendar"></i> Requested: ${ticket.schedule_date} ${ticket.schedule_time || ''}</span>` : ''}
                </div>

                ${(ticket.route_polyline || ticket.actual_route_polyline) ? `
                    <button class="btn-view-route" onclick="viewTripRoute('${ticket.id}')" style="width: 100%; margin-top: 15px; background: rgba(20, 184, 166, 0.1); border: 1px solid rgba(20, 184, 166, 0.3); color: var(--accent-teal); padding: 10px; border-radius: 6px; cursor: pointer; transition: all 0.3s ease;">
                        <i class="fas fa-map-marked-alt"></i> View Trip Transparency Map
                    </button>
                    <div style="display: flex; justify-content: space-between; margin-top: 5px; font-size: 0.7rem; color: var(--text-muted); padding: 0 4px;">
                        <span><i class="fas fa-tachometer-alt"></i> Odo Start: ${ticket.odometer_start}</span>
                        <span>Odo End: ${ticket.odometer_end} <i class="fas fa-flag-checkered"></i></span>
                    </div>
                ` : ''}

                ${(!ticket.isValidated && (userRole === 'admin' || userRole === 'super_admin' || userRole === 'company_admin')) ? `
                    <button class="btn-verify-lock" onclick="verifyAndLockTrip('${ticket.id}', '${ticket._source}')" style="width: 100%; margin-top: 10px; background: rgba(0, 212, 255, 0.1); border: 1px solid rgba(0, 212, 255, 0.3); color: var(--accent-blue); padding: 10px; border-radius: 6px; cursor: pointer; font-weight: 700; transition: all 0.3s ease;">
                        <i class="fas fa-lock"></i> Verify & Lock for Payroll
                    </button>
                ` : ''}
            </div>
        `;
    }).join('');
}

window.verifyAndLockTrip = async (id, source) => {
    if (!confirm("Are you sure you want to verify and lock this trip? This will mark it as official for payroll audit and it cannot be reverted.")) return;

    try {
        const docRef = doc(db, source === 'trip_tickets' ? 'trip_tickets' : 'schedules', id);
        await updateDoc(docRef, {
            isValidated: true,
            verified_by: currentUserData.full_name || currentUserData.email,
            verified_at: serverTimestamp()
        });
        alert("Trip verified and locked successfully.");
    } catch (e) {
        console.error("Verification error:", e);
        alert("Verification failed: " + e.message);
    }
};

function formatTimestamp(ts) {
    if (!ts) return '—';
    try {
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true
        });
    } catch {
        return '—';
    }
}

/**
 * Focus and highlight a specific trip ticket from the URL
 */
function checkTripFocus() {
    const urlParams = new URLSearchParams(window.location.search);
    const tripId = urlParams.get('tripId');
    if (!tripId) return;

    const target = document.getElementById(`ticket-${tripId}`);
    if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.style.transition = 'all 0.5s ease';
        target.style.border = '2px solid var(--accent-blue)';
        target.style.boxShadow = '0 0 30px rgba(0, 212, 255, 0.4)';

        // Pulse effect
        setTimeout(() => {
            target.style.transform = 'scale(1.02)';
            setTimeout(() => {
                target.style.transform = 'scale(1)';
            }, 300);
        }, 500);
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


window.exportTripTickets = function () {
    const fromDate = document.getElementById('filterDateFrom').value;
    const toDate = document.getElementById('filterDateTo').value;
    const selectedDriverName = document.getElementById('filterDriver').value;

    if (!selectedDriverName) {
        alert("Please select a specific driver to generate a formatted Trip Ticket ledger.");
        return;
    }

    let filtered = allTickets.filter(t => t.driver_name === selectedDriverName);

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

    if (filtered.length === 0) {
        alert("No records found for this driver in the selected date range.");
        return;
    }

    // Get context from the first ticket or a lookup
    const firstTicket = filtered[0];
    const vehicle = firstTicket.vehicle_assigned || firstTicket.vehicle_type || 'N/A';
    const plate = firstTicket.plate_number || 'N/A';

    // Extract month and year parts for specific template cells
    let monthName = "—";
    let yearStr = "—";
    if (fromDate) {
        const d = new Date(fromDate);
        monthName = d.toLocaleString('default', { month: 'long' }).toUpperCase();
        yearStr = d.getFullYear().toString();
    }

    const exportData = mapTicketsForExport(filtered);

    exportGCRTripTicket(exportData, {
        vehicle: vehicle,
        plate: plate,
        driverName: selectedDriverName,
        month: monthName,
        year: yearStr
    });
};


// Route Map Modal Management
let routeMap = null;
let currentPolyline = null;

window.viewTripRoute = function (id) {
    const t = allTickets.find(ticket => ticket.id === id);
    if (!t) return;

    const modal = document.getElementById('routeModal');
    if (!modal) return;

    modal.style.display = 'flex';

    const recommendedPolyline = t.recommended_route_polyline || t.route_polyline || '';
    const actualPolyline = t.actual_route_polyline || '';

    // Constants for consistency with Android app
    const ACCENT_TEAL = '#00C9A7';
    const ACCENT_BLUE = '#4E6BFF';
    const ACCENT_ORANGE = '#FFA24C';
    const ACCENT_YELLOW = '#F9D423';

    // Initialize map if not already done
    if (!routeMap) {
        routeMap = new google.maps.Map(document.getElementById('routeMap'), {
            zoom: 13,
            center: { lat: 14.5995, lng: 120.9842 },
            styles: [
                { "elementType": "geometry", "stylers": [{ "color": "#242f3e" }] },
                { "elementType": "labels.text.stroke", "stylers": [{ "color": "#242f3e" }] },
                { "elementType": "labels.text.fill", "stylers": [{ "color": "#746855" }] },
                { "featureType": "administrative.locality", "elementType": "labels.text.fill", "stylers": [{ "color": "#d59563" }] },
                { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [{ "color": "#d59563" }] },
                { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#38414e" }] },
                { "featureType": "road", "elementType": "geometry.stroke", "stylers": [{ "color": "#212a37" }] },
                { "featureType": "road", "elementType": "labels.text.fill", "stylers": [{ "color": "#9ca5b3" }] },
                { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#17263c" }] }
            ]
        });
    }

    // Clear existing elements
    if (window._recommendedPath) window._recommendedPath.setMap(null);
    if (window._actualPath) window._actualPath.setMap(null);
    if (window._startMarker) window._startMarker.setMap(null);
    if (window._pickupMarker) window._pickupMarker.setMap(null);
    if (window._dropoffMarker) window._dropoffMarker.setMap(null);

    const bounds = new google.maps.LatLngBounds();

    // 1. Draw Recommended path
    if (recommendedPolyline && recommendedPolyline !== 'undefined') {
        const path = google.maps.geometry.encoding.decodePath(recommendedPolyline);
        window._recommendedPath = new google.maps.Polyline({
            path: path,
            strokeColor: '#64748b',
            strokeOpacity: actualPolyline ? 0.2 : 0.6,
            strokeWeight: 4,
            map: routeMap,
            icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 2 }, offset: '0', repeat: '10px' }]
        });
        path.forEach(p => bounds.extend(p));
    }

    // 2. Draw Actual path (The "Source of Truth")
    if (actualPolyline && actualPolyline !== 'undefined') {
        const path = google.maps.geometry.encoding.decodePath(actualPolyline);
        window._actualPath = new google.maps.Polyline({
            path: path,
            strokeColor: ACCENT_TEAL,
            strokeOpacity: 1.0,
            strokeWeight: 10,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            map: routeMap
        });
        path.forEach(p => bounds.extend(p));
    }

    // 3. Add 3-Point Markers (Telemetry Verification)

    // A. Start Trip
    if (t.start_latitude && t.start_longitude) {
        const startPos = { lat: t.start_latitude, lng: t.start_longitude };
        window._startMarker = new google.maps.Marker({
            position: startPos,
            map: routeMap,
            title: "Start Trip",
            label: { text: "S", color: "white", fontWeight: "bold" },
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                fillColor: ACCENT_BLUE,
                fillOpacity: 1,
                strokeWeight: 2,
                strokeColor: 'white',
                scale: 12
            }
        });
        bounds.extend(startPos);
    }

    // B. Actual Pickup
    if (t.pickup_latitude && t.pickup_longitude) {
        const pickupPos = { lat: t.pickup_latitude, lng: t.pickup_longitude };
        window._pickupMarker = new google.maps.Marker({
            position: pickupPos,
            map: routeMap,
            title: "Passenger Picked Up",
            label: { text: "P", color: "black", fontWeight: "bold" },
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                fillColor: ACCENT_YELLOW,
                fillOpacity: 1,
                strokeWeight: 2,
                strokeColor: 'white',
                scale: 12
            }
        });
        bounds.extend(pickupPos);
    }

    // C. Actual Drop-off
    if (t.dropoff_latitude && t.dropoff_longitude) {
        const dropoffPos = { lat: t.dropoff_latitude, lng: t.dropoff_longitude };
        window._dropoffMarker = new google.maps.Marker({
            position: dropoffPos,
            map: routeMap,
            title: "Dropped Off",
            label: { text: "D", color: "white", fontWeight: "bold" },
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                fillColor: ACCENT_ORANGE,
                fillOpacity: 1,
                strokeWeight: 2,
                strokeColor: 'white',
                scale: 12
            }
        });
        bounds.extend(dropoffPos);
    }

    if (!bounds.isEmpty()) {
        routeMap.fitBounds(bounds);
    }
}


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