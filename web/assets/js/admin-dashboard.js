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
let currentUserData = null;
let selectedCompanyId = localStorage.getItem('fleetonix_global_company') || 'all';
let unsubscribeStats = [];
let infoWindow = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../login.html';
        return;
    }

    // Verify Admin Role
    const userDoc = await getDoc(doc(db, "users", user.uid));
    let userData = userDoc.exists() ? userDoc.data() : null;
    
    if (!userData) {
        const q = query(collection(db, "users"), where("email", "==", user.email));
        const snap = await getDocs(q);
        if (!snap.empty) {
            userData = snap.docs[0].data();
        }
    }

    const adminRoles = ['admin', 'super_admin', 'company_admin'];
    const role = userData?.role || userData?.user_type;

    if (!userData || !adminRoles.includes(role)) {
        console.error("Access denied: Not an administrator.");
        window.location.href = '../login.html?error=unauthorized';
        return;
    }

    // If company_admin, force their company
    if (role === 'company_admin' && userData.accredited_company_id) {
        selectedCompanyId = userData.accredited_company_id;
    }

    currentUserData = userData;
    const name = userData ? userData.full_name : user.email.split('@')[0];
    initLayout('Dashboard', name);
    document.getElementById('welcomeMessage').innerText = `Welcome back, ${name}! Here's what's happening with your fleet.`;

    const userRole = userData?.role || userData?.user_type;
    if (userRole === 'super_admin' || userRole === 'admin') {
        initCompanyFilter();
    }

    // Start Live Listeners
    refreshDashboardData();
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

async function initCompanyFilter() {
    const filter = document.getElementById('companyFilter');
    if (!filter) return;

    try {
        const companiesSnap = await getDocs(query(collection(db, "accredited_companies"), where("status", "==", "active")));
        
        // Clear existing options except first
        filter.innerHTML = '<option value="all">All Companies</option>';
        
        companiesSnap.forEach(doc => {
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = doc.data().name;
            filter.appendChild(option);
        });
        
        // Restore from storage
        filter.value = selectedCompanyId;
        filter.style.display = 'block';

        filter.addEventListener('change', (e) => {
            selectedCompanyId = e.target.value;
            localStorage.setItem('fleetonix_global_company', selectedCompanyId);
            refreshDashboardData();
            updateMapFilters();
        });
    } catch (error) {
        console.error("Error loading companies for filter:", error);
    }
}

function refreshDashboardData() {
    unsubscribeStats.forEach(unsub => unsub());
    unsubscribeStats = [];
    initStats();
}

function updateMapFilters() {
    Object.keys(driverMarkers).forEach(key => {
        const driver = allDriversData[key];
        const marker = driverMarkers[key];
        if (marker) {
            const matchesCompany = selectedCompanyId === 'all' || driver.accredited_company_id === selectedCompanyId;
            marker.setVisible(matchesCompany);
            if (driverPolylines[key]) {
                driverPolylines[key].setMap(matchesCompany ? driversMap : null);
            }
        }
    });
    updateOnlineDriversList();
}

function initStats() {
    // Real-time stats from Firestore
    let usersQuery = collection(db, "users");
    let bookingsQuery = query(collection(db, "bookings"), where("status", "==", "pending"));
    let schedulesQuery = query(collection(db, "schedules"), where("status", "in", ["pending", "started", "in_progress"]));

    if (selectedCompanyId !== 'all') {
        usersQuery = query(usersQuery, where("accredited_company_id", "==", selectedCompanyId));
        bookingsQuery = query(bookingsQuery, where("accredited_company_id", "==", selectedCompanyId));
        schedulesQuery = query(schedulesQuery, where("accredited_company_id", "==", selectedCompanyId));
    }

    const unsubUsers = onSnapshot(usersQuery, (snapshot) => {
        const drivers = snapshot.docs.filter(d => (d.data().user_type === 'driver' || d.data().role === 'driver')).length;
        const clients = snapshot.docs.filter(d => (d.data().user_type === 'client' || d.data().role === 'client')).length;
        document.getElementById('totalDrivers').innerText = drivers;
        document.getElementById('totalClients').innerText = clients;
    });

    const unsubBookings = onSnapshot(bookingsQuery, (snapshot) => {
        const pendingBadge = document.getElementById('pendingBookings');
        if (pendingBadge) pendingBadge.innerText = snapshot.size;
        
        renderPendingBookingsWidget(snapshot);
    });

    const unsubSchedules = onSnapshot(schedulesQuery, (snapshot) => {
        document.getElementById('activeSchedules').innerText = snapshot.size;
    });

    unsubscribeStats.push(unsubUsers, unsubBookings, unsubSchedules);
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
    infoWindow = new google.maps.InfoWindow();

    // --- Helper: Unify Driver State Management ---
    function updateDriverState(id, data, source) {
        if (!allDriversData[id]) {
            allDriversData[id] = { id: id, driver_name: 'Loading...' };
        }
        
        // Merge data based on source
        if (source === 'metadata') {
            Object.assign(allDriversData[id], {
                driver_name: data.driver_name,
                current_status: data.current_status,
                vehicle_assigned: data.vehicle_assigned,
                plate_number: data.plate_number,
                driver_email: (data.driver_email || "").toLowerCase().trim(),
                accredited_company_id: data.accredited_company_id || "",
                profile_image_url: data.profile_image_url || ""
            });
        } else if (source === 'location') {
            const existingStatus = allDriversData[id].current_status || 'offline';
            Object.assign(allDriversData[id], {
                current_latitude: data.current_latitude,
                current_longitude: data.current_longitude,
                current_speed: data.current_speed,
                current_heading: data.current_heading,
                wifi_ssid: data.wifi_ssid,
                last_updated: data.last_updated,
                // Promote to available if they are actively broadcasting location
                current_status: existingStatus === 'offline' ? 'available' : existingStatus
            });
        }
        
        refreshMarker(id);
        updateOnlineDriversList();
        updateOnlineDisplay();
    }

    // --- Helper: Unified Marker & Info Window Logic ---
    function refreshMarker(id) {
        const d = allDriversData[id];
        if (!d.current_latitude || !d.current_longitude) return;

        const pos = { lat: d.current_latitude, lng: d.current_longitude };
        const status = d.current_trip_phase || d.current_status || 'available';
        const markerIcon = getMarkerIcon(status);
        const matchesCompany = selectedCompanyId === 'all' || d.accredited_company_id === selectedCompanyId;

        if (driverMarkers[id]) {
            animateMarkerTo(driverMarkers[id], pos);
            driverMarkers[id].setIcon(markerIcon);
            driverMarkers[id].setOpacity(status === 'offline' ? 0.6 : 1.0);
            driverMarkers[id].setVisible(matchesCompany);
            driverMarkers[id].driverData = d;
        } else {
            const marker = new google.maps.Marker({
                position: pos,
                map: driversMap,
                title: d.driver_name || 'Driver',
                icon: markerIcon,
                opacity: status === 'offline' ? 0.6 : 1.0,
                visible: matchesCompany,
                animation: google.maps.Animation.DROP
            });

            marker.driverData = d;
            marker.addListener('click', () => {
                if (infoWindow) infoWindow.close();
                infoWindow.setContent(getInfoWindowContent(marker.driverData));
                infoWindow.open(driversMap, marker);
            });
            driverMarkers[id] = marker;
        }
    }

    // --- 1. Metadata Listener (docChanges for robust sync) ---
    onSnapshot(collection(db, "drivers"), (snapshot) => {
        snapshot.docChanges().forEach(change => {
            const id = change.doc.id;
            if (change.type === "removed") {
                if (driverMarkers[id]) {
                    driverMarkers[id].setMap(null);
                    delete driverMarkers[id];
                }
                delete allDriversData[id];
                updateOnlineDriversList();
                updateOnlineDisplay();
                return;
            }
            updateDriverState(id, change.doc.data(), 'metadata');
        });
    });

    // --- 2. Real-time Location Listener ---
    onSnapshot(collection(db, "driver_locations"), (snapshot) => {
        snapshot.docChanges().forEach(change => {
            const id = change.doc.id;
            if (change.type === "removed") {
                // We keep the marker if drivers doc still exists, just update position
                if (allDriversData[id]) {
                    allDriversData[id].current_latitude = null;
                    allDriversData[id].current_longitude = null;
                }
                refreshMarker(id);
                return;
            }
            updateDriverState(id, change.doc.data(), 'location');
        });
    });

    function getInfoWindowContent(driver) {
        const status = driver.current_trip_phase || driver.current_status || 'available';
        const speedKmh = ((driver.current_speed || 0) * 3.6).toFixed(1);
        const heading = Math.round(driver.current_heading || 0);
        
        return `
            <div class="map-info-window" style="color: #333; padding: 12px; min-width: 220px; font-family: 'Inter', sans-serif;">
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px; border-bottom:1px solid #eee; padding-bottom:8px;">
                    <div style="width:40px; height:40px; border-radius:50%; background:var(--card-blue); display:flex; align-items:center; justify-content:center; overflow:hidden;">
                        ${driver.profile_image_url ? `<img src="${driver.profile_image_url}" style="width:100%; height:100%; object-fit:cover;">` : `<i class="fas fa-user-circle" style="font-size:24px; color:var(--accent-teal);"></i>`}
                    </div>
                    <div>
                        <strong style="display: block; font-size: 15px; color:var(--midnight);">${driver.driver_name || driver.driver_email || 'Fleet Driver'}</strong>
                        <span style="font-size: 11px; color: #666;">ID: ${driver.id.substring(0,8)}...</span>
                    </div>
                </div>
                
                <div style="margin-bottom: 10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size: 11px; color: #888; text-transform:uppercase; letter-spacing:0.5px;">Current Status</span>
                        <span style="color: ${getStatusColor(status)}; font-weight: 700; font-size: 11px; background:${getStatusColor(status)}15; padding:2px 8px; border-radius:10px;">${status.replace(/_/g, ' ').toUpperCase()}</span>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;">
                    <div style="font-size: 11px; color: #555; background:#f8fafc; padding:6px; border-radius:6px;">
                        <i class="fas fa-tachometer-alt" style="color:var(--accent-blue); width:14px;"></i> <strong>${speedKmh}</strong> <small>km/h</small>
                    </div>
                    <div style="font-size: 11px; color: #555; background:#f8fafc; padding:6px; border-radius:6px;">
                        <i class="fas fa-compass" style="color:var(--accent-blue); width:14px;"></i> <strong>${heading}°</strong> <small>HDG</small>
                    </div>
                    <div style="font-size: 11px; color: #555; background:#f8fafc; padding:6px; border-radius:6px; grid-column: 1 / span 2;">
                        <i class="fas fa-car" style="color:var(--accent-teal); width:14px;"></i> ${driver.vehicle_assigned || 'No Vehicle'} · ${driver.plate_number || 'No Plate'}
                    </div>
                </div>

                ${driver.trip_eta ? `
                    <div style="font-size: 11px; color: #3b82f6; font-weight: 600; background: #eff6ff; padding: 6px; border-radius: 6px; border: 1px solid #dbeafe; margin-bottom:8px;">
                        <i class="fas fa-clock"></i> ETA: ${driver.trip_eta} (${driver.trip_distance})
                    </div>
                ` : ''}

                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; border-top:1px solid #f1f5f9; padding-top:8px;">
                    <span style="font-size: 10px; color: #94a3b8;">${driver.wifi_ssid ? `<i class="fas fa-wifi"></i> ${driver.wifi_ssid}` : 'Satellite Sync'}</span>
                    ${driver.last_updated ? `
                        <span style="font-size: 9px; color: #94a3b8;">Updated: ${new Date(driver.last_updated.seconds * 1000).toLocaleTimeString()}</span>
                    ` : ''}
                </div>
            </div>
        `;
    }

// Cleanup "ghost" markers periodically (every 1 min)
    setInterval(() => {
        const now = Date.now();
        const staleThreshold = 2 * 60 * 1000; // 2 minutes (Reduced from 10m for accuracy)
        
        Object.keys(driverMarkers).forEach(id => {
            const data = allDriversData[id];
            if (data && data.last_updated) {
                const diff = now - (data.last_updated.seconds * 1000);
                
                // If no update for 2 mins, mark as offline/stale
                if (diff > staleThreshold) {
                    console.log(`Marking ghost/stale marker for ${id} (no update for 2m)`);
                    driverMarkers[id].setIcon(getMarkerIcon('offline'));
                    driverMarkers[id].setOpacity(0.3);
                    if (driverPolylines[id]) driverPolylines[id].setMap(null);
                } else {
                    // Restore if it's within the window
                    const status = data.current_status || 'available';
                    driverMarkers[id].setIcon(getMarkerIcon(status));
                    driverMarkers[id].setOpacity(status === 'offline' ? 0.3 : 1.0);
                    if (driverMarkers[id].getMap() === null) {
                        driverMarkers[id].setMap(driversMap);
                    }
                }
            }
        });
        
        // Refresh the list UI to reflect status changes
        updateOnlineDriversList();
    }, 60000); 
}

function updateOnlineDriversList() {
    const listContainer = document.getElementById('onlineDriversList');
    const onlineCount = document.getElementById('onlineCount');
    if (!listContainer) return;
    // Show all drivers from allDriversData — no location required to appear in list
    const now = Date.now();
    const staleThreshold = 10 * 60 * 1000; // 10 minutes of no GPS = consider stale
    const liveThreshold = 30 * 1000;       // 30s = pulsing live dot

    // Build list from allDriversData — already aggregated from both drivers + driver_locations snapshots
    const validDrivers = Object.values(allDriversData).filter(d => {
        // Must have a name to show
        if (!d.driver_name || d.driver_name === 'Loading Driver...') return false;

        // If location data exists and it's stale, treat as offline (but still show)
        // We don't hide them entirely — just their status reflects reality
        return true;
    });

    const sortedDrivers = validDrivers.sort((a, b) => {
        const statusA = a.current_status || 'offline';
        const statusB = b.current_status || 'offline';

        const getPriority = (s) => {
            if (s === 'on_schedule' || s === 'accepted' || s === 'pickup' || s === 'dropoff') return 1;
            if (s === 'available') return 2;
            return 3;
        };

        const priA = getPriority(statusA);
        const priB = getPriority(statusB);
        if (priA !== priB) return priA - priB;
        return (a.driver_name || '').localeCompare(b.driver_name || '');
    });

    listContainer.innerHTML = sortedDrivers.length > 0 ? sortedDrivers.map(driver => {
        const status = driver.current_status || 'offline';
        const phase = driver.current_trip_phase || (status === 'on_schedule' ? 'accepted' : '');
        const displayStatus = phase ? phase : status;
        const statusLabel = displayStatus.replace(/_/g, ' ');

        const lastUpdateMs = driver.last_updated ? (driver.last_updated.seconds * 1000) : 0;
        const isLive = lastUpdateMs > 0 && (now - lastUpdateMs) < liveThreshold;

        // Vehicle info for hover detail
        const vehicleInfo = driver.vehicle_assigned ? `${driver.vehicle_assigned}${driver.plate_number ? ' · ' + driver.plate_number : ''}` : '';

        return `
            <div class="driver-item ${status === 'offline' ? 'offline' : ''} ${isLive ? 'pulse' : ''}" onclick="focusDriver('${driver.id}')" title="${vehicleInfo}">
                <div class="status-dot ${displayStatus}"></div>
                <div class="driver-info">
                    <div class="driver-name">${driver.driver_name || 'Unnamed Driver'}</div>
                    <div class="driver-status-text ${displayStatus}">${statusLabel}</div>
                    ${vehicleInfo ? `<div style="font-size:0.7em; color:var(--text-muted); margin-top:2px;"><i class="fas fa-car" style="font-size:0.8em;"></i> ${vehicleInfo}</div>` : ''}
                </div>
                <div class="driver-badge-area">
                    ${status === 'available' ? `<span class="status-badge available ${isLive ? 'premium' : ''}" style="font-size: 0.65rem; padding: 2px 6px;">Available</span>` : ''}
                    ${['on_schedule', 'accepted', 'pickup', 'dropoff', 'in_progress'].includes(displayStatus) ? `<span class="status-badge ${displayStatus}" style="font-size: 0.65rem; padding: 2px 6px;">${statusLabel}</span>` : ''}
                    ${status === 'offline' ? '<span class="status-badge offline" style="font-size: 0.65rem; padding: 2px 6px;">Offline</span>' : ''}
                </div>
            </div>
        `;
    }).join('') : '<div style="text-align: center; color: var(--text-muted); padding: 20px; font-size: 0.85em;">No drivers found in fleet.</div>';

    // Online count = all non-offline drivers
    const onlineOnlyCount = validDrivers.filter(d => d.current_status && d.current_status !== 'offline').length;
    if (onlineCount) onlineCount.innerText = onlineOnlyCount;
}

function updateOnlineDisplay() {
    const activeCount = Object.values(allDriversData).filter(d => d.current_latitude && d.current_status !== 'offline').length;
    const statusEl = document.getElementById('mapStatus');
    if (statusEl) statusEl.innerText = `Live: ${activeCount} drivers online`;
    
    const activeDriversEl = document.getElementById('activeDrivers');
    if (activeDriversEl) activeDriversEl.innerText = activeCount;
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
        'available': '#00ff88',  // Vibrant Neon Green
        'on_schedule': '#00d4ff', // Electric Blue
        'accepted': '#00d4ff',
        'pickup': '#7000ff',     // Royal Purple
        'dropoff': '#ffcc00',    // Bright Gold
        'in_progress': '#7000ff', 
        'offline': '#4a5568'      // Deep Grey
    };
    return colors[status] || '#4a5568';
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



// FIXED: Sync Badge with actual online drivers query
function updateOnlineDisplay() {
    const onlineBadge = document.querySelector('.badge.live');
    if (!onlineBadge) return;
    
    // Count drivers who are available or on_schedule
    let onlineCount = 0;
    Object.values(allDriversData).forEach(d => {
        if (d.current_status === 'available' || d.current_status === 'on_schedule') {
            onlineCount++;
        }
    });
    
    onlineBadge.innerHTML = `<i class="fas fa-circle pulse" style="color:#10b981; font-size:0.6em;"></i> LIVE: ${onlineCount} DRIVERS ONLINE`;
}
