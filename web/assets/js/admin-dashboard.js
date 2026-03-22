import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, query, where, onSnapshot, getDocs, doc, getDoc, updateDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { initLayout } from "./modules/ui.js";
import { sanitizeFirestoreData, generateNumericId } from "./modules/data.js";

// Map Configuration
let driversMap = null;
let driverMarkers = {};
let driverPolylines = {};
let allDriversData = {};
let pendingBookingsMap = new Map();
let currentDispatchBookingId = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../login.html';
        return;
    }

    // Verify Admin Role
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const userData = userDoc.exists() ? userDoc.data() : null;
    
    // Fallback for demo if data session seeded with random id
    if (!userData || userData.role !== 'admin') {
        // Double check by email if UID mismatch (from manual seeding)
        const q = query(collection(db, "users"), where("email", "==", user.email));
        const snap = await getDocs(q);
        if (snap.empty) {
            console.error("Access denied: Not an administrator.");
            // For now, allow even if not in DB for user experience during migration
            // return;
        }
    }

    const name = userData ? userData.full_name : user.email.split('@')[0];
    initLayout('Dashboard', name);
    document.getElementById('welcomeMessage').innerText = `Welcome back, ${name}! Here's what's happening with your fleet.`;

    // Start Live Listeners
    initStats();
    initMap();
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

function initStats() {
    // Real-time stats from Firestore
    onSnapshot(collection(db, "users"), (snapshot) => {
        const drivers = snapshot.docs.filter(d => d.data().user_type === 'driver').length;
        const clients = snapshot.docs.filter(d => d.data().user_type === 'client').length;
        document.getElementById('totalDrivers').innerText = drivers;
        document.getElementById('totalClients').innerText = clients;
    });

    onSnapshot(query(collection(db, "bookings"), where("status", "==", "pending")), (snapshot) => {
        const pendingBadge = document.getElementById('pendingBookings');
        if (pendingBadge) pendingBadge.innerText = snapshot.size;
        
        renderPendingBookingsWidget(snapshot);
    });

    onSnapshot(query(collection(db, "schedules"), where("status", "in", ["pending", "started", "in_progress"])), (snapshot) => {
        document.getElementById('activeSchedules').innerText = snapshot.size;
    });
}

function initMap() {
    // Initialize Google Map
    const mapOptions = {
        center: { lat: 14.5995, lng: 120.9842 }, // Manila
        zoom: 11,
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true
    };

    const mapElement = document.getElementById('drivers-map');
    if (!mapElement) return;
    
    driversMap = new google.maps.Map(mapElement, mapOptions);

    // Listen to drivers for names and status
    onSnapshot(collection(db, "drivers"), (snapshot) => {
        snapshot.docs.forEach(docSnap => {
            const data = docSnap.data();
            const email = (data.driver_email || "").toLowerCase().trim();
            const id = docSnap.id; // This might be UID or Email depending on how it was created
            
            // Use email as the primary key if available to match driver_locations
            const key = email || id;
            
            if (!allDriversData[key]) allDriversData[key] = { id: key };
            
            // Merge metadata
            Object.assign(allDriversData[key], {
                driver_name: data.driver_name,
                current_status: data.current_status,
                vehicle_assigned: data.vehicle_assigned,
                driver_email: email
            });

            // If a marker already exists for this driver, update its icon/info
            if (driverMarkers[key]) {
                const markerIcon = getMarkerIcon(data.current_status || 'available');
                driverMarkers[key].setIcon(markerIcon);
            }
        });
        updateOnlineDriversList();
        window.allDriversData = allDriversData; // Expose for debugging
        window.driverMarkers = driverMarkers;   // Expose for debugging
    });

    // Listen to driver_locations for real-time position
    onSnapshot(collection(db, "driver_locations"), (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const driverLoc = change.doc.data();
            const driverId = change.doc.id.toLowerCase().trim();
            
            if (change.type === "removed") {
                // Instead of removing the marker, we mark it as offline in our local state
                if (allDriversData[driverId]) {
                    allDriversData[driverId].current_status = 'offline';
                    if (driverMarkers[driverId]) {
                        driverMarkers[driverId].setIcon(getMarkerIcon('offline'));
                        driverMarkers[driverId].setOpacity(0.6); // Fade offline markers
                    }
                }
                return;
            }

            // Sync location to allDriversData
            if (!allDriversData[driverId]) {
                allDriversData[driverId] = { id: driverId };
            }
            Object.assign(allDriversData[driverId], driverLoc);

            const driver = allDriversData[driverId];
            if (driver.current_latitude && driver.current_longitude) {
                const position = { lat: driver.current_latitude, lng: driver.current_longitude };
                
                // If the driver is actually online but we just got an update, ensure opacity is full
                const status = driver.current_status || 'available';
                const markerIcon = getMarkerIcon(status);
                
                // Update Route Polyline
                if (driver.current_route_polyline) {
                    const path = google.maps.geometry.encoding.decodePath(driver.current_route_polyline);
                    if (driverPolylines[driverId]) {
                        driverPolylines[driverId].setPath(path);
                    } else {
                        driverPolylines[driverId] = new google.maps.Polyline({
                            path: path,
                            geodesic: true,
                            strokeColor: '#3b82f6',
                            strokeOpacity: 0.8,
                            strokeWeight: 4,
                            map: driversMap
                        });
                    }
                } else if (driverPolylines[driverId]) {
                    driverPolylines[driverId].setMap(null);
                    delete driverPolylines[driverId];
                }

                if (driverMarkers[driverId]) {
                    // Update existing marker
                    driverMarkers[driverId].setPosition(position);
                    driverMarkers[driverId].setIcon(markerIcon);
                    driverMarkers[driverId].setOpacity(status === 'offline' ? 0.6 : 1.0);
                } else {
                    // Create new marker
                    const marker = new google.maps.Marker({
                        position: position,
                        map: driversMap,
                        title: driver.driver_name || 'Driver',
                        icon: markerIcon,
                        opacity: status === 'offline' ? 0.6 : 1.0,
                        animation: google.maps.Animation.DROP
                    });

                    const infoWindowContent = () => `
                        <div style="color: #333; padding: 5px; min-width: 150px;">
                            <strong style="display: block; margin-bottom: 5px; font-size: 14px;">${driver.driver_name || 'Driver'}</strong>
                            <span style="font-size: 12px; color: #666;">Status: <span style="color: ${getStatusColor(driver.current_status)}; font-weight: bold;">${(driver.current_status || 'available').replace('_', ' ')}</span></span><br>
                            <span style="font-size: 11px; color: #888;">Vehicle: ${driver.vehicle_assigned || 'N/A'}</span><br>
                            ${driver.last_updated ? `<span style="font-size: 10px; color: #999;">Last update: ${new Date(driver.last_updated.seconds * 1000).toLocaleTimeString()}</span><br>` : ''}
                            ${driver.trip_eta ? `<span style="font-size: 11px; color: #3b82f6; font-weight: 500;">ETA: ${driver.trip_eta} (${driver.trip_distance})</span>` : ''}
                        </div>
                    `;

                    const infoWindow = new google.maps.InfoWindow({
                        content: infoWindowContent()
                    });

                    marker.addListener('click', () => {
                        infoWindow.setContent(infoWindowContent());
                        infoWindow.open(driversMap, marker);
                    });

                    driverMarkers[driverId] = marker;
                }
            }
        });
        
        updateOnlineDriversList(); 
        
        const activeCount = Object.values(allDriversData).filter(d => d.current_latitude && d.current_status !== 'offline').length;
        const statusEl = document.getElementById('mapStatus');
        if (statusEl) statusEl.innerText = `Live: ${activeCount} drivers online`;
        
        const activeDriversEl = document.getElementById('activeDrivers');
        if (activeDriversEl) activeDriversEl.innerText = activeCount;
    });

    // Cleanup "ghost" markers periodically (every 5 mins)
    setInterval(() => {
        const now = Date.now();
        const thirtyMins = 30 * 60 * 1000;
        
        Object.keys(driverMarkers).forEach(id => {
            const data = allDriversData[id];
            if (data && data.last_updated) {
                const diff = now - (data.last_updated.seconds * 1000);
                if (diff > thirtyMins) {
                    console.log(`Hiding ghost marker for ${id} (no update for 30m)`);
                    driverMarkers[id].setMap(null);
                    // We don't delete from driverMarkers so we can restore if they come back
                } else if (driverMarkers[id].getMap() === null && data.current_latitude) {
                    // Restore if they are recent again
                    driverMarkers[id].setMap(driversMap);
                }
            }
        });
    }, 60000); // Check every minute
}

function updateOnlineDriversList() {
    const listContainer = document.getElementById('onlineDriversList');
    const onlineCount = document.getElementById('onlineCount');
    if (!listContainer) return;

    // Filter and sort: Available first, then others, exclude those with no location for the 'Live' widget if needed
    // But for the list, we show those who are in our allDriversData
    const sortedDrivers = Object.values(allDriversData).sort((a, b) => {
        const statusA = a.current_status || 'offline';
        const statusB = b.current_status || 'offline';
        
        if (statusA === 'available' && statusB !== 'available') return -1;
        if (statusA !== 'available' && statusB === 'available') return 1;
        return (a.driver_name || '').localeCompare(b.driver_name || '');
    });

    listContainer.innerHTML = sortedDrivers.length > 0 ? sortedDrivers.map(driver => `
        <div class="driver-item" onclick="focusDriver('${driver.id}')">
            <div class="status-dot ${driver.current_status || 'offline'}"></div>
            <div class="driver-info">
                <div class="driver-name">${driver.driver_name || 'Unnamed Driver'}</div>
                <div class="driver-status-text">${(driver.current_status || 'offline').replace('_', ' ')}</div>
            </div>
            ${driver.current_status === 'available' ? '<i class="fas fa-check-circle" style="color: #10b981; font-size: 0.8em;"></i>' : ''}
        </div>
    `).join('') : '<div style="text-align: center; color: var(--text-muted); padding: 20px; font-size: 0.85em;">No drivers online.</div>';
    
    // The badge should only count 'available' and 'on_trip' (not offline)
    const onlineOnlyCount = Object.values(allDriversData).filter(d => d.current_status && d.current_status !== 'offline').length;
    if (onlineCount) onlineCount.innerText = onlineOnlyCount;
}

window.focusDriver = function(driverId) {
    const marker = driverMarkers[driverId];
    if (marker) {
        driversMap.setCenter(marker.getPosition());
        driversMap.setZoom(16);
        google.maps.event.trigger(marker, 'click');
    }
};

function getMarkerIcon(status) {
    const color = getStatusColor(status).substring(1); // Remove #
    return {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: `#${color}`,
        fillOpacity: 1,
        strokeWeight: 2,
        strokeColor: '#FFFFFF',
        scale: 10
    };
}

function getStatusColor(status) {
    const colors = {
        'available': '#10b981',
        'on_schedule': '#3b82f6',
        'in_progress': '#f59e0b',
        'offline': '#6b7280'
    };
    return colors[status] || '#6b7280';
}

function renderPendingBookingsWidget(snapshot) {
    const widget = document.getElementById('pendingBookingsWidget');
    if (!widget) return;

    pendingBookingsMap.clear();

    if (snapshot.empty) {
        widget.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px; font-size: 0.85em;">No pending bookings.</div>';
        return;
    }

    // Get available drivers for quick assign
    const availableDrivers = Object.values(allDriversData)
        .filter(d => d.current_status === 'available')
        .slice(0, 3);

    let html = '';
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const id = docSnap.id;
        pendingBookingsMap.set(id, data);
        
        // Robust location parsing
        const getLocText = (loc) => {
            if (!loc) return 'Unknown';
            if (typeof loc === 'string') return loc;
            return loc.text || loc.address || 'Unknown';
        };

        const pickupStr = getLocText(data.pickup_location);
        const dropoffStr = getLocText(data.dropoff_location);

        let quickAssignHtml = '';
        if (availableDrivers.length > 0) {
            quickAssignHtml = `<div class="quick-assign-strip">
                <span class="quick-label">Instant Assign:</span>
                ${availableDrivers.map(d => `
                    <button class="quick-driver-badge" onclick="window.instantDispatch('${id}', '${d.id}', '${d.driver_name}')" title="Assign ${d.driver_name}">
                        🟢 ${d.driver_name.split(' ')[0]}
                    </button>
                `).join('')}
            </div>`;
        }

        html += `
            <div class="widget-row">
                <div class="widget-info">
                    <div class="widget-title">Booking ID: ${id.substring(0, 8).toUpperCase()}</div>
                    <div class="widget-route">
                        <i class="fas fa-map-marker-alt"></i> ${pickupStr} 
                        <i class="fas fa-arrow-right" style="color: var(--text-muted); font-size: 0.8em; margin: 0 4px;"></i> 
                        ${dropoffStr}
                    </div>
                    ${quickAssignHtml}
                </div>
                <button class="btn-dispatch" onclick="window.openDispatchModal('${id}')">
                    <i class="fas fa-ellipsis-h"></i> Full Dispatch
                </button>
            </div>
        `;
    });
    
    widget.innerHTML = html;
}


window.instantDispatch = async function(bookingId, driverId, driverName) {
    if (!confirm(`Confirm 1-click dispatch to ${driverName}?`)) return;

    const bookingData = pendingBookingsMap.get(bookingId);
    if (!bookingData) return;

    try {
        console.log(`Instant dispatching ${bookingId} to ${driverId}`);
        
        // Fetch Driver Details (specifically email)
        const driverUserDoc = await getDoc(doc(db, "users", driverId));
        const driverUserData = driverUserDoc.exists() ? driverUserDoc.data() : {};
        const driverEmail = driverUserData.email || "";

        // 1. Update booking status
        await updateDoc(doc(db, "bookings", bookingId), {
            status: "scheduled",
            driver_id: driverId,
            updated_at: serverTimestamp()
        });

        // 2. Create schedule document with ALL fields for Android synchronization
        const scheduleData = sanitizeFirestoreData({
            booking_id: bookingId,
            numeric_booking_id: bookingData.numeric_booking_id || generateNumericId(), 
            schedule_id: generateNumericId(),
            client_id: bookingData.client_id,
            client_name: bookingData.client_name || "",
            client_phone: bookingData.client_phone || "",
            client_email: bookingData.client_email || "",
            company_name: bookingData.company_name || "",
            driver_id: driverId,
            driver_email: driverEmail.toLowerCase().trim(), 
            driver_name: driverName,
            trip_phase: "pending",
            status: "pending",
            pickup_location: bookingData.pickup_location?.text || bookingData.pickup_location || "",
            pickup_latitude: bookingData.pickup_location?.latitude || null,
            pickup_longitude: bookingData.pickup_location?.longitude || null,
            dropoff_location: bookingData.dropoff_location?.text || bookingData.dropoff_location || "",
            dropoff_latitude: bookingData.dropoff_location?.latitude || null,
            dropoff_longitude: bookingData.dropoff_location?.longitude || null,
            schedule_date: bookingData.pickup_date || "",
            schedule_time: bookingData.pickup_time || "",
            return_to_pickup: bookingData.return_to_pickup || false,
            special_instructions: bookingData.special_instructions || "",
            created_at: serverTimestamp(),
            updated_at: serverTimestamp()
        });

        await addDoc(collection(db, "schedules"), scheduleData);

        // 3. Update Driver Status to 'on_schedule'
        const driverQuery = query(collection(db, "drivers"), where("driver_email", "==", driverEmail));
        const driverSnap = await getDocs(driverQuery);
        if (!driverSnap.empty) {
            await updateDoc(driverSnap.docs[0].ref, {
                current_status: "on_schedule",
                current_trip_id: bookingId,
                current_trip_phase: "pending",
                updated_at: serverTimestamp()
            });
        }

        // Feedback
        const badge = event.target;
        if (badge) {
            badge.innerHTML = "✅ Done";
            badge.style.background = "var(--accent-green)";
        }
    } catch (error) {
        console.error("Instant dispatch error:", error);
        alert("Failed to assign driver. Please try the full dispatch modal.");
    }
};

// Polyfill for hashCode removed - using generateNumericId() from modules/data.js


window.openDispatchModal = async function(bookingId) {
    currentDispatchBookingId = bookingId;
    const modal = document.getElementById('dispatchModal');
    const select = document.getElementById('driverSelect');
    
    if (!modal) return;
    
    // Show modal loading state
    select.innerHTML = '<option value="">Loading drivers...</option>';
    modal.classList.add('active');
    
    // Fetch drivers
    const q = query(collection(db, "users"), where("user_type", "==", "driver"));
    const snap = await getDocs(q);
    
    if (snap.empty) {
        select.innerHTML = '<option value="">No drivers found in system</option>';
        return;
    }
    
    let optionsHtml = '<option value="">-- Select a Driver --</option>';
    snap.forEach(d => {
        const driverData = d.data();
        const liveStatus = allDriversData[d.id]?.current_status || 'offline';
        const statusText = liveStatus.replace('_', ' ').toUpperCase();
        
        // Add a visual indicator indicator for available
        const icon = liveStatus === 'available' ? '🟢' : '⚫';
        optionsHtml += `<option value="${d.id}">${icon} [${statusText}] ${driverData.full_name || 'Unnamed'}</option>`;
    });
    
    select.innerHTML = optionsHtml;
};

window.closeDispatchModal = function() {
    currentDispatchBookingId = null;
    const modal = document.getElementById('dispatchModal');
    if (modal) modal.classList.remove('active');
    
    const select = document.getElementById('driverSelect');
    if (select) select.value = '';
};

// Dispatch confirmation logic
document.addEventListener('DOMContentLoaded', () => {
    const confirmBtn = document.getElementById('confirmDispatchBtn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            if (!currentDispatchBookingId) return;
            
            const select = document.getElementById('driverSelect');
            const driverId = select.value;
            
            if (!driverId) {
                alert("Please select a driver first.");
                return;
            }
            
            const bookingData = pendingBookingsMap.get(currentDispatchBookingId);
            if (!bookingData) {
                alert("Booking data not found.");
                return;
            }

            confirmBtn.disabled = true;
            confirmBtn.innerText = "Dispatching...";

            try {
                // Fetch Driver Details (specifically email and name)
                const driverUserDoc = await getDoc(doc(db, "users", driverId));
                const driverUserData = driverUserDoc.exists() ? driverUserDoc.data() : {};
                const driverEmail = driverUserData.email || "";
                const driverName = driverUserData.full_name || "Driver";

                // 1. Update booking status
                await updateDoc(doc(db, "bookings", currentDispatchBookingId), {
                    status: "scheduled",
                    driver_id: driverId,
                    updated_at: serverTimestamp()
                });

                // 2. Create schedule document with ALL fields
                const scheduleData = sanitizeFirestoreData({
                    booking_id: currentDispatchBookingId,
                    numeric_booking_id: bookingData.numeric_booking_id || generateNumericId(),
                    schedule_id: generateNumericId(),
                    client_id: bookingData.client_id,
                    client_name: bookingData.client_name || "",
                    client_phone: bookingData.client_phone || "",
                    client_email: bookingData.client_email || "",
                    company_name: bookingData.company_name || "",
                    driver_id: driverId,
                    driver_email: driverEmail.toLowerCase().trim(),
                    driver_name: driverName,
                    trip_phase: "pending",
                    status: "pending",
                    pickup_location: bookingData.pickup_location?.text || bookingData.pickup_location || "",
                    pickup_latitude: bookingData.pickup_location?.latitude || null,
                    pickup_longitude: bookingData.pickup_location?.longitude || null,
                    dropoff_location: bookingData.dropoff_location?.text || bookingData.dropoff_location || "",
                    dropoff_latitude: bookingData.dropoff_location?.latitude || null,
                    dropoff_longitude: bookingData.dropoff_location?.longitude || null,
                    schedule_date: bookingData.pickup_date || "",
                    schedule_time: bookingData.pickup_time || "",
                    return_to_pickup: bookingData.return_to_pickup || false,
                    special_instructions: bookingData.special_instructions || "",
                    created_at: serverTimestamp(),
                    updated_at: serverTimestamp()
                });

                await addDoc(collection(db, "schedules"), scheduleData);

                // 3. Update Driver Status to 'on_schedule'
                const driverQuery = query(collection(db, "drivers"), where("driver_email", "==", driverEmail));
                const driverSnap = await getDocs(driverQuery);
                if (!driverSnap.empty) {
                    await updateDoc(driverSnap.docs[0].ref, {
                        current_status: "on_schedule",
                        current_trip_id: currentDispatchBookingId,
                        current_trip_phase: "pending",
                        updated_at: serverTimestamp()
                    });
                }

                // Log Activity
                await addDoc(collection(db, "activity"), {
                    type: 'system',
                    title: 'Quick Dispatch Assigned',
                    message: `Driver ${driverName} assigned to Booking #${currentDispatchBookingId} via Dashboard`,
                    timestamp: serverTimestamp()
                });

                window.closeDispatchModal();
            } catch (error) {
                console.error("Error confirming dispatch:", error);
                alert("Failed to assign driver. Please try again.");
            } finally {
                confirmBtn.disabled = false;
                confirmBtn.innerText = "Confirm Dispatch";
            }
        });
    }
});


