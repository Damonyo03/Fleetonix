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
        where("trip_phase", "in", ["accepted", "pickup", "dropoff", "ready_to_complete"])
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
        
        // Render the Active Trip Card for the most recent trip
        if (snapshot.docs.length > 0) {
            renderActiveTripOverlay(snapshot.docs[0].data());
        } else {
            renderActiveTripOverlay(null);
        }

        // If we have active drivers, start listening to their locations
        if (activeDriverEmails.size > 0) {
            setupLocationListener();
        } else {
            document.getElementById('mapStatus').innerText = "No active trips to track";
        }
    });
}

function animateMarkerTo(marker, newPos) {
    if (!marker) return;
    const startPos = marker.getPosition();
    const startTime = performance.now();
    const duration = 2500; // Animate over 2.5 seconds

    if (marker.animationId) {
        cancelAnimationFrame(marker.animationId);
    }

    function step(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const lat = startPos.lat() + (newPos.lat - startPos.lat()) * progress;
        const lng = startPos.lng() + (newPos.lng - startPos.lng()) * progress;
        
        marker.setPosition({ lat, lng });

        if (progress < 1) {
            marker.animationId = requestAnimationFrame(step);
        } else {
            marker.animationId = null;
        }
    }
    marker.animationId = requestAnimationFrame(step);
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
                    animateMarkerTo(markers[email], pos);
                    // Update icon color if phase changed
                    const phase = data.current_trip_phase || "pickup";
                    const phaseColors = {
                        'accepted': '#3b82f6',
                        'pickup': '#8b5cf6',
                        'dropoff': '#f97316',
                        'ready_to_complete': '#f97316'
                    };
                    const icon = getVehicleIcon(data.vehicle_type || 'Executive Sedan', phaseColors[phase] || "#3b82f6");
                    markers[email].setIcon(icon);
                } else {
                    const phase = data.current_trip_phase || "pickup";
                    const phaseColors = {
                        'accepted': '#3b82f6',
                        'pickup': '#8b5cf6',
                        'dropoff': '#f97316',
                        'ready_to_complete': '#f97316'
                    };
                    const phaseLabels = {
                        'accepted': 'Accepted & Preparing',
                        'pickup': 'En Route to Pickup',
                        'dropoff': 'Passenger on Board',
                        'ready_to_complete': 'Arrived at Destination'
                    };

                    markers[email] = new google.maps.Marker({
                        position: pos,
                        map: clientMap,
                        icon: getVehicleIcon(data.vehicle_type || 'Executive Sedan', phaseColors[phase] || "#3b82f6"),
                        title: data.driver_name || "Your Driver"
                    });

                    const infoWindow = new google.maps.InfoWindow({
                        content: `
                            <div style="color: #333; padding: 5px;">
                                <strong style="display: block; margin-bottom: 5px;">${data.driver_name || 'Your Driver'}</strong>
                                <span style="font-size: 12px; color: #666;">Status: <span style="color: ${phaseColors[phase] || '#3b82f6'}; font-weight: bold;">${phaseLabels[phase] || 'In Progress'}</span></span><br>
                                <span style="font-size: 11px; color: #888;">Vehicle: ${data.vehicle_assigned || 'Fleet Vehicle'}</span>
                            </div>
                        `
                    });

                    markers[email].addListener('click', () => {
                        infoWindow.open(clientMap, markers[email]);
                    });
                }
            }
        });

        // Also update the active trip card if any location changes
        // (This ensures status labels are consistent)
        const activeTripQuery = query(
            collection(db, "schedules"),
            where("client_email", "==", auth.currentUser.email),
            where("trip_phase", "in", ["accepted", "pickup", "dropoff", "ready_to_complete"]),
            limit(1)
        );
        getDocs(activeTripQuery).then(snap => {
            if (!snap.empty) {
                renderActiveTripOverlay(snap.docs[0].data());
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

/**
 * Returns a Google Maps Symbol for various vehicle types.
 */
function getVehicleIcon(type, color) {
    const paths = {
        'Executive Sedan': "M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99z",
        'Luxury Van': "M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4z",
        'SUV': "M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99z",
        'Bus': "M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10z"
    };

    return {
        path: paths[type] || paths['Executive Sedan'],
        fillColor: color,
        fillOpacity: 1,
        strokeWeight: 1,
        strokeColor: "#ffffff",
        scale: 1.5,
        anchor: new google.maps.Point(12, 12)
    };
}

/**
 * Renders the floating "Active Trip" card on the dashboard.
 */
function renderActiveTripOverlay(schedule) {
    let overlay = document.getElementById('activeTripOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'activeTripOverlay';
        overlay.className = 'active-trip-card';
        // Append to body to avoid clipping issues
        document.body.appendChild(overlay);
    }

    if (!schedule) {
        overlay.style.display = 'none';
        return;
    }

    const phaseLabels = {
        'accepted': 'Accepted & Preparing',
        'pickup': 'Driver En Route',
        'dropoff': 'Passenger on Board',
        'ready_to_complete': 'Arrived at Destination'
    };

    const phaseColors = {
        'accepted': 'var(--accent-blue)',
        'pickup': '#8b5cf6',
        'dropoff': 'var(--accent-orange)',
        'ready_to_complete': 'var(--accent-green)'
    };

    overlay.innerHTML = `
        <div class="active-trip-header">
            <span class="live-indicator"><span class="dot"></span> LIVE TRACKING</span>
            <span class="trip-status" style="background: ${phaseColors[schedule.trip_phase] || 'var(--accent-blue)'}">
                ${phaseLabels[schedule.trip_phase] || 'In Progress'}
            </span>
        </div>
        <div class="active-trip-body" style="margin-top: 15px;">
            <div class="driver-info" style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px;">
                <div class="driver-avatar" style="width: 45px; height: 45px; background: var(--accent-blue); border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">
                    ${(schedule.driver_name || 'D').charAt(0)}
                </div>
                <div>
                    <h4 style="margin: 0; font-size: 0.95rem; color: white;">${schedule.driver_name || 'Professional Driver'}</h4>
                    <p style="margin: 2px 0 0; font-size: 0.75rem; color: var(--text-muted);">${schedule.vehicle_assigned || 'Fleet Vehicle'} • ${schedule.plate_number || 'N/A'}</p>
                </div>
            </div>
            <div class="trip-locations" style="display: flex; flex-direction: column; gap: 8px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px;">
                <div style="display: flex; align-items: flex-start; gap: 10px; font-size: 0.8rem; color: var(--text-muted);">
                    <i class="fas fa-circle-dot" style="color: var(--accent-green); margin-top: 2px;"></i>
                    <span>${schedule.pickup_location}</span>
                </div>
                <div style="display: flex; align-items: flex-start; gap: 10px; font-size: 0.8rem; color: var(--text-muted);">
                    <i class="fas fa-location-dot" style="color: #ff6b6b; margin-top: 2px;"></i>
                    <span>${schedule.dropoff_location}</span>
                </div>
            </div>
        </div>
        <div class="active-trip-footer" style="margin-top: 15px;">
            <a href="tel:${schedule.driver_phone || ''}" class="btn btn-primary" style="width: 100%; font-size: 0.85rem; padding: 10px; border-radius: 10px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                <i class="fas fa-phone"></i> CALL DRIVER
            </a>
        </div>
    `;
    overlay.style.display = 'block';
}

// Add CSS for the overlay dynamically
if (!document.getElementById('modern-client-styles')) {
    const style = document.createElement('style');
    style.id = 'modern-client-styles';
    style.textContent = `
        .active-trip-card {
            position: fixed;
            bottom: 30px;
            right: 30px;
            width: 320px;
            background: rgba(26, 31, 46, 0.95);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 18px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            z-index: 10000;
            animation: slideUpModern 0.5s cubic-bezier(0.19, 1, 0.22, 1);
        }
        @keyframes slideUpModern {
            from { transform: translateY(50px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
        .live-indicator { font-size: 0.7rem; color: #00d4ff; font-weight: 700; display: flex; align-items: center; gap: 5px; }
        .live-indicator .dot { width: 5px; height: 5px; background: #00d4ff; border-radius: 50%; animation: pulse 1.5s infinite; }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }
        .trip-status { font-size: 0.65rem; padding: 3px 8px; border-radius: 10px; color: white; font-weight: 600; }
    `;
    document.head.appendChild(style);
}
