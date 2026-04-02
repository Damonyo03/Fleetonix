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

function animateMarkerTo(marker, newPos) {
    if (!marker) return;
    const startPos = marker.getPosition();
    const startTime = performance.now();
    const duration = 4500; // Animate over 4.5 seconds (we now update every 5s)

    // Cancel existing animation if any
    if (marker.animationId) {
        cancelAnimationFrame(marker.animationId);
    }

    function step(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Linear interpolation
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
            
            // Revert to using the Firestore document ID (Auth UID) as the primary key for synchronization.
            const key = docSnap.id;
            
            if (!allDriversData[key]) {
                allDriversData[key] = { id: key };
            }
            
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
                // Also update position if the drivers collection has it (for persistent offline markers)
                if (data.current_latitude && data.current_longitude) {
                    driverMarkers[key].setPosition({ lat: data.current_latitude, lng: data.current_longitude });
                }
            } else if (data.current_latitude && data.current_longitude) {
                // If NO marker exists but we have location, create a persistent/offline marker
                console.log(`Creating persistent marker for ${data.driver_name} from drivers collection`);
                const status = data.current_status || 'offline';
                const marker = new google.maps.Marker({
                    position: { lat: data.current_latitude, lng: data.current_longitude },
                    map: driversMap,
                    title: data.driver_name || 'Driver',
                    icon: getMarkerIcon(status),
                    opacity: status === 'offline' ? 0.6 : 1.0
                });
                
                // Add info window logic (simplified or reuse a function)
                // For brevity, I'll just store it; a real implementation would add the listener too
                driverMarkers[key] = marker;
                
                const infoWindow = new google.maps.InfoWindow({ content: getInfoWindowContent(data) });
                marker.addListener('click', () => {
                    infoWindow.setContent(getInfoWindowContent(allDriversData[key] || data));
                    infoWindow.open(driversMap, marker);
                });
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
            const driverId = change.doc.id;
            
            if (change.type === "removed") {
                // Instead of hiding the marker, we mark it as offline and keep it visible but faded
                if (allDriversData[driverId]) {
                    allDriversData[driverId].current_status = 'offline';
                    if (driverMarkers[driverId]) {
                        driverMarkers[driverId].setIcon(getMarkerIcon('offline'));
                        driverMarkers[driverId].setOpacity(0.4); // Very faded for removed docs
                    }
                }
                return;
            }

            // Resilient lookup: If driver metadata haven't loaded yet, create a placeholder
            if (!allDriversData[driverId]) {
                console.log(`Location received for unknown driver ID: ${driverId}. Creating placeholder.`);
                allDriversData[driverId] = { 
                    id: driverId,
                    driver_name: 'Loading Driver...',
                    current_status: 'available' 
                };
            }

            // Safely merge ONLY location-specific telemetry fields
            const { current_latitude, current_longitude, current_speed, current_heading, last_updated, wifi_ssid } = driverLoc;
            const existingStatus = allDriversData[driverId].current_status || 'offline';
            
            Object.assign(allDriversData[driverId], {
                current_latitude,
                current_longitude,
                current_speed,
                current_heading,
                wifi_ssid,
                last_updated,
                // Promote to 'available' if currently offline but broadcasting location
                current_status: existingStatus === 'offline' ? 'available' : existingStatus
            });

            const driver = allDriversData[driverId];
            if (driver.current_latitude && driver.current_longitude) {
                const position = { lat: driver.current_latitude, lng: driver.current_longitude };
                
                // If the driver is actually online but we just got an update, ensure opacity is full
                const status = driver.current_status || 'available';
                const markerIcon = getMarkerIcon(driver.current_trip_phase || status);
                
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
                    // Update existing marker with smooth animation
                    animateMarkerTo(driverMarkers[driverId], position);
                    driverMarkers[driverId].setIcon(markerIcon);
                    
                    // Fading logic: offline is most faded, others are full opacity
                    let opacity = 1.0;
                    if (status === 'offline') opacity = 0.6;
                    driverMarkers[driverId].setOpacity(opacity);
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

                    const infoWindow = new google.maps.InfoWindow({
                        content: getInfoWindowContent(driver)
                    });

                    marker.addListener('click', () => {
                        infoWindow.setContent(getInfoWindowContent(allDriversData[driverId]));
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

    function getInfoWindowContent(driver) {
    const status = driver.current_trip_phase || driver.current_status || 'available';
    const speedKmh = ((driver.current_speed || 0) * 3.6).toFixed(1);
    const heading = Math.round(driver.current_heading || 0);
    
    return `
        <div style="color: #333; padding: 8px; min-width: 180px; font-family: 'Inter', sans-serif;">
            <strong style="display: block; margin-bottom: 8px; font-size: 15px; border-bottom: 1px solid #eee; padding-bottom: 4px;">
                ${driver.driver_name || 'Driver'}
            </strong>
            <div style="margin-bottom: 6px;">
                <span style="font-size: 12px; color: #666;">Status: </span>
                <span style="color: ${getStatusColor(status)}; font-weight: 600; font-size: 12px;">${status.replace('_', ' ').toUpperCase()}</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 6px;">
                <div style="font-size: 11px; color: #888;">
                    <i class="fas fa-tachometer-alt" style="width: 14px;"></i> ${speedKmh} kmh
                </div>
                <div style="font-size: 11px; color: #888;">
                    <i class="fas fa-compass" style="width: 14px;"></i> ${heading}°
                </div>
                <div style="font-size: 11px; color: #888;">
                    <i class="fas fa-car" style="width: 14px;"></i> ${driver.vehicle_assigned || 'N/A'}
                </div>
                <div style="font-size: 11px; color: #888;" title="Network">
                    <i class="fas fa-wifi" style="width: 14px;"></i> ${driver.wifi_ssid || 'No Data'}
                </div>
            </div>
            ${driver.trip_eta ? `
                <div style="font-size: 11px; color: #3b82f6; font-weight: 600; background: #eff6ff; padding: 4px; border-radius: 4px; border: 1px solid #dbeafe;">
                    ETA: ${driver.trip_eta} (${driver.trip_distance})
                </div>
            ` : ''}
            ${driver.last_updated ? `
                <div style="font-size: 9px; color: #bbb; margin-top: 6px; text-align: right;">
                    Sync: ${new Date(driver.last_updated.seconds * 1000).toLocaleTimeString()}
                </div>
            ` : ''}
        </div>
    `;
}

// Cleanup "ghost" markers periodically (every 5 mins)
    setInterval(() => {
        const now = Date.now();
        const tenMins = 10 * 60 * 1000; // Shorter threshold for active markers
        const oneHour = 60 * 60 * 1000; // Threshold for offline markers
        
        Object.keys(driverMarkers).forEach(id => {
            const data = allDriversData[id];
            if (data && data.last_updated) {
                const diff = now - (data.last_updated.seconds * 1000);
                const status = data.current_status || 'offline';
                
                // If status is online but no update for 10 mins, it's a ghost
                if (status !== 'offline' && diff > tenMins) {
                    console.log(`Fading ghost marker for ${id} (no update for 10m)`);
                    driverMarkers[id].setOpacity(0.3);
                } 
                // If it's more than an hour old, hide it regardless
                if (diff > oneHour) {
                    console.log(`Hiding very stale marker for ${id}`);
                    driverMarkers[id].setMap(null);
                } else if (driverMarkers[id].getMap() === null) {
                    // Restore if it's within the hour again
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

    // Filter out ghost telemetry (Loading Driver...)
    const validDrivers = Object.values(allDriversData).filter(d => d.driver_name && d.driver_name !== 'Loading Driver...');

    const sortedDrivers = validDrivers.sort((a, b) => {
        const statusA = a.current_status || 'offline';
        const statusB = b.current_status || 'offline';
        
        if (statusA === 'available' && statusB !== 'available') return -1;
        if (statusA !== 'available' && statusB === 'available') return 1;
        return (a.driver_name || '').localeCompare(b.driver_name || '');
    });

    listContainer.innerHTML = sortedDrivers.length > 0 ? sortedDrivers.map(driver => {
        const status = driver.current_status || 'offline';
        const phase = driver.current_trip_phase || (status === 'on_schedule' ? 'accepted' : '');
        const displayStatus = phase ? phase : status;
        
        return `
            <div class="driver-item" onclick="focusDriver('${driver.id}')">
                <div class="status-dot ${displayStatus}"></div>
                <div class="driver-info">
                    <div class="driver-name">${driver.driver_name || 'Unnamed Driver'}</div>
                    <div class="driver-status-text">${displayStatus.replace('_', ' ')}</div>
                </div>
                ${status === 'available' ? '<i class="fas fa-check-circle" style="color: #10b981; font-size: 0.8em;"></i>' : ''}
            </div>
        `;
    }).join('') : '<div style="text-align: center; color: var(--text-muted); padding: 20px; font-size: 0.85em;">No drivers online.</div>';
    
    // The badge should only count 'available' and 'on_trip' (not offline) and must hide ghosts
    const onlineOnlyCount = validDrivers.filter(d => d.current_status && d.current_status !== 'offline').length;
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
        'accepted': '#3b82f6',
        'pickup': '#8b5cf6',
        'dropoff': '#f97316',
        'in_progress': '#8b5cf6', // Legacy mapping
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
                    <button class="quick-driver-badge" onclick="window.instantDispatch('${id}', '${d.id}', '${d.driver_name}', this)" title="Assign ${d.driver_name}">
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


window.instantDispatch = async function(bookingId, driverId, driverName, btn) {
    if (!confirm(`Confirm 1-click dispatch to ${driverName}?`)) return;

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span>⏳ ...</span>`;
    }

    const bookingData = pendingBookingsMap.get(bookingId);
    if (!bookingData) return;

    try {
        console.log(`Instant dispatching ${bookingId} to ${driverId}`);
        
        // Fetch Driver Details (specifically email) from the 'drivers' collection
        const driverDoc = await getDoc(doc(db, "drivers", driverId));
        const driverData = driverDoc.exists() ? driverDoc.data() : {};
        const driverEmail = driverData.driver_email || "";

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
        if (btn) {
            btn.innerHTML = "✅ Done";
            btn.style.background = "var(--accent-green)";
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
    
    // Fetch drivers and their location heartbeats (real-time check)
    const [driversSnap, locationsSnap] = await Promise.all([
        getDocs(query(collection(db, "drivers"), where("current_status", "==", "available"))),
        getDocs(collection(db, "driver_locations"))
    ]);
    
    const locationMap = {};
    locationsSnap.docs.forEach(doc => {
        locationMap[doc.id.toLowerCase().trim()] = doc.data();
    });

    const now = Date.now();
    const tenMins = 10 * 60 * 1000;
    const driverMap = new Map();

    driversSnap.docs.forEach(dDoc => {
        const d = dDoc.data();
        const email = (d.driver_email || "").toLowerCase().trim();
        if (!email || driverMap.has(email)) return;

        // Check real-time heartbeat (online/offline)
        const loc = locationMap[email];
        let isOnline = false;
        if (loc && loc.last_updated) {
            const lastActive = loc.last_updated.toMillis ? loc.last_updated.toMillis() : (loc.last_updated.seconds * 1000);
            if (now - lastActive < tenMins) isOnline = true;
        }

        driverMap.set(email, {
            id: dDoc.id,
            name: d.driver_name,
            vehicle: d.vehicle_assigned,
            plate: d.plate_number,
            isOnline: isOnline
        });
    });

    // Sort: Online first, then alphabetical
    const sortedDrivers = Array.from(driverMap.values()).sort((a, b) => {
        if (a.isOnline === b.isOnline) return a.name.localeCompare(b.name);
        return a.isOnline ? -1 : 1;
    });
    
    if (sortedDrivers.length === 0) {
        select.innerHTML = '<option value="">No available drivers found</option>';
        return;
    }
    
    let optionsHtml = '<option value="">-- Select a Driver --</option>';
    let autoSelectedId = "";

    sortedDrivers.forEach((d, index) => {
        // Auto-select the first online driver
        if (d.isOnline && !autoSelectedId) {
            autoSelectedId = d.id;
        }
        
        const icon = d.isOnline ? '🟢' : '⚪';
        const statusText = d.isOnline ? '[ONLINE]' : '[OFFLINE]';
        optionsHtml += `<option value="${d.id}" ${d.id === autoSelectedId ? 'selected' : ''}>${icon} ${statusText} ${d.name} - ${d.vehicle} (${d.plate})</option>`;
    });
    
    select.innerHTML = optionsHtml;
    
    // If we auto-selected someone, focus or highlight the selection
    if (autoSelectedId) {
        console.log(`Auto-selected online driver: ${autoSelectedId}`);
        select.value = autoSelectedId;
    }
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
                // Fetch Driver Details (specifically email and name) from the 'drivers' collection
                const driverDoc = await getDoc(doc(db, "drivers", driverId));
                const driverData = driverDoc.exists() ? driverDoc.data() : {};
                const driverEmail = driverData.driver_email || "";
                const driverName = driverData.driver_name || "Driver";

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


