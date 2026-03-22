import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, query, where, onSnapshot, getDocs, limit, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { initLayout } from "./modules/ui.js";

let clientMap;
let markers = {};
let polylines = {};
let activeDriverEmails = new Set();

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../login.html';
        return;
    }

    // Dashboard UI Init
    initLayout('Dashboard', null); 
    initMap();
    initStats();
    initRecentBookings();
    initActiveSchedules();
});

function initMap() {
    const mapEl = document.getElementById('driversMap');
    if (!mapEl) return;

    clientMap = new google.maps.Map(mapEl, {
        center: { lat: 14.5995, lng: 120.9842 }, // Manila default
        zoom: 12,
        styles: [
            { "featureType": "all", "elementType": "labels.text.fill", "stylers": [{ "color": "#ffffff" }] },
            { "featureType": "all", "elementType": "labels.text.stroke", "stylers": [{ "color": "#000000" }, { "lightness": 13 }] },
            { "featureType": "administrative", "elementType": "geometry.fill", "stylers": [{ "color": "#000000" }] },
            { "featureType": "landscape", "elementType": "geometry", "stylers": [{ "color": "#2c2c2c" }] },
            { "featureType": "poi", "elementType": "geometry", "stylers": [{ "color": "#2c2c2c" }] },
            { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#3c3c3c" }] },
            { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#1c1c1c" }] }
        ],
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true
    });

    // Listen to driver locations for active trips
    syncDriverTracking();
}

/**
 * Monitors the client's active schedules and tracks the assigned drivers in real-time.
 */
function syncDriverTracking() {
    const userEmail = auth.currentUser.email;

    // 1. Listen to active schedules to get driver emails
    const schedulesQuery = query(
        collection(db, "schedules"),
        where("client_email", "==", userEmail),
        where("trip_phase", "in", ["pickup", "dropoff", "ready_to_complete"])
    );

    onSnapshot(schedulesQuery, (snapshot) => {
        const newActiveDrivers = new Set();
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.driver_email) {
                newActiveDrivers.add(data.driver_email.toLowerCase().trim());
            }
        });

        // Detect drivers who are no longer active and remove their markers
        activeDriverEmails.forEach(email => {
            if (!newActiveDrivers.has(email)) {
                if (markers[email]) {
                    markers[email].setMap(null);
                    delete markers[email];
                }
                if (polylines[email]) {
                    polylines[email].setMap(null);
                    delete polylines[email];
                }
            }
        });

        activeDriverEmails = newActiveDrivers;
        
        // If we have active drivers, start listening to their locations
        if (activeDriverEmails.size > 0) {
            setupLocationListener();
        } else {
            document.getElementById('mapStatus').innerText = "No active trips to track";
        }
    });
}

let locationUnsubscribe = null;
function setupLocationListener() {
    if (locationUnsubscribe) return; // Only one listener needed

    // We listen to the whole collection but filter locally for security/simplicity 
    // (Ideally we'd use where("id", "in", [...emailList]) but that's limited to 10)
    locationUnsubscribe = onSnapshot(collection(db, "driver_locations"), (snapshot) => {
        let trackedCount = 0;
        
        snapshot.docChanges().forEach(change => {
            const email = change.doc.id.toLowerCase().trim();
            if (!activeDriverEmails.has(email)) return;

            const data = change.doc.data();
            if (change.type === "removed") {
                if (markers[email]) { markers[email].setMap(null); delete markers[email]; }
                return;
            }

            if (data.current_latitude && data.current_longitude) {
                trackedCount++;
                const pos = { lat: data.current_latitude, lng: data.current_longitude };
                
                // Polyline
                if (data.current_route_polyline) {
                    const path = google.maps.geometry.encoding.decodePath(data.current_route_polyline);
                    if (polylines[email]) {
                        polylines[email].setPath(path);
                    } else {
                        polylines[email] = new google.maps.Polyline({
                            path, map: clientMap, strokeColor: '#3b82f6', strokeWeight: 4
                        });
                    }
                }

                // Marker
                if (markers[email]) {
                    markers[email].setPosition(pos);
                } else {
                    markers[email] = new google.maps.Marker({
                        position: pos,
                        map: clientMap,
                        icon: {
                            path: google.maps.SymbolPath.CIRCLE,
                            scale: 8,
                            fillColor: "#3b82f6",
                            fillOpacity: 1,
                            strokeWeight: 2,
                            strokeColor: "#ffffff"
                        },
                        title: "Your Driver"
                    });
                }
            }
        });

        const statusEl = document.getElementById('mapStatus');
        if (statusEl) {
            statusEl.innerText = trackedCount > 0 
                ? `Tracking ${trackedCount} active driver(s)` 
                : "Waiting for driver GPS...";
        }
    });
}

function initStats() {
    const userEmail = auth.currentUser.email;
    
    // Pending Bookings
    onSnapshot(query(collection(db, "bookings"), where("client_email", "==", userEmail), where("status", "==", "pending")), (snap) => {
        document.getElementById('pendingBookings').innerText = snap.size;
    });

    // Active Schedules
    onSnapshot(query(collection(db, "schedules"), where("client_email", "==", userEmail), where("trip_phase", "!=", "completed")), (snap) => {
        document.getElementById('activeSchedules').innerText = snap.size;
    });

    // Total Bookings
    onSnapshot(query(collection(db, "bookings"), where("client_email", "==", userEmail)), (snap) => {
        document.getElementById('totalBookings').innerText = snap.size;
    });
    
    // Completed Trips
    onSnapshot(query(collection(db, "bookings"), where("client_email", "==", userEmail), where("status", "==", "completed")), (snap) => {
        document.getElementById('completedBookings').innerText = snap.size;
    });

    // Toggle Stats
    const toggleBtn = document.getElementById('toggleStatsBtn');
    const secondaryStats = document.getElementById('secondaryStats');
    if (toggleBtn && secondaryStats) {
        toggleBtn.onclick = () => {
            const isShowing = secondaryStats.classList.toggle('show');
            toggleBtn.innerHTML = isShowing 
                ? '<i class="fas fa-chevron-up"></i> Less Insights' 
                : '<i class="fas fa-chevron-down"></i> More Insights';
        };
    }
}

function initRecentBookings() {
    const userEmail = auth.currentUser.email;
    const q = query(collection(db, "bookings"), where("client_email", "==", userEmail), orderBy("created_at", "desc"), limit(5));

    onSnapshot(q, (snapshot) => {
        const table = document.getElementById('recentBookingsTable');
        if (!table) return;

        if (snapshot.empty) {
            table.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px;">No bookings found.</td></tr>';
            return;
        }

        table.innerHTML = snapshot.docs.map(doc => {
            const b = doc.data();
            const statusClass = b.status === 'pending' ? 'status-pending' : (b.status === 'confirmed' ? 'status-confirmed' : 'status-completed');
            return `
                <tr>
                    <td>${b.pickup_address || 'N/A'}</td>
                    <td>${b.scheduled_date || 'N/A'}</td>
                    <td><span class="status-badge ${statusClass}">${b.status}</span></td>
                </tr>
            `;
        }).join('');
    }, (error) => {
        console.error("Recent bookings error:", error);
        const table = document.getElementById('recentBookingsTable');
        if (table) table.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px; color: var(--accent-red);">Error loading bookings.</td></tr>';
    });
}

function initActiveSchedules() {
    const userEmail = auth.currentUser.email;
    const q = query(collection(db, "schedules"), where("client_email", "==", userEmail), where("trip_phase", "!=", "completed"), limit(5));

    onSnapshot(q, (snapshot) => {
        const table = document.getElementById('activeSchedulesTable');
        if (!table) return;

        if (snapshot.empty) {
            table.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px;">No active trips.</td></tr>';
            return;
        }

        table.innerHTML = snapshot.docs.map(doc => {
            const s = doc.data();
            return `
                <tr>
                    <td>${s.driver_name || 'Assigned'}</td>
                    <td><span class="status-badge status-confirmed">${(s.trip_phase || 'Scheduled').replace('_', ' ')}</span></td>
                    <td><a href="schedule_view.html?id=${doc.id}" class="btn-icon"><i class="fas fa-external-link-alt"></i></a></td>
                </tr>
            `;
        }).join('');
    }, (error) => {
        console.error("Active schedules error:", error);
        const table = document.getElementById('activeSchedulesTable');
        if (table) table.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px; color: var(--accent-red);">Error loading schedules.</td></tr>';
    });
}
