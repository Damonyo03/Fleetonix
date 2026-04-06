import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, query, where, onSnapshot, getDocs, doc, getDoc, updateDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { initLayout } from "./modules/ui.js";
import { sanitizeFirestoreData, generateNumericId } from "./modules/data.js";

// Map Configuration
let driversMap = null;
let driverMarkers = {};
let driverPolylines = {};
let allDriversData = {}; // Stores combined metadata + live location
let emailToUidMap = {}; // Maps driver_email -> UID for fast lookup
let pendingBookingsMap = new Map();
let currentDispatchBookingId = null;
let currentUserData = null;
let selectedContractorId = 'Jettsan'; // Defaulting to Jettsan for NSCRP
let unsubscribeStats = [];
let infoWindow = null;
let driverDTRStatus = {}; // email -> { action: 'time_in'|'time_out', timestamp: JS Date }

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

    // Force single-tenant logic
    selectedContractorId = 'Jettsan';

    currentUserData = userData;
    const name = userData ? userData.full_name : user.email.split('@')[0];
    initLayout('Dashboard', name);
    document.getElementById('welcomeMessage').innerText = `Welcome back, ${name}! Here's what's happening with your fleet.`;

    // Restricted access logic for Jettsan
    if (userRole === 'super_admin' || userRole === 'admin') {
        // initCompanyFilter(); - Removed for single-tenant
    }

    // Start Live Listeners
    refreshDashboardData();
    
    // Guarded Map Initialization
    const tryInitMap = () => {
        if (typeof google !== 'undefined' && google.maps) {
            initMap();
        } else {
            console.warn("Google Maps not ready, retrying in 500ms...");
            setTimeout(tryInitMap, 500);
        }
    };
    tryInitMap();
    
    initDashboardUI();
    initPostingFeature();
});

function initPostingFeature() {
    const postBtn = document.getElementById('postScheduleBtn');
    if (!postBtn) return;

    // Time Check Loop
    const updateBtnStatus = () => {
        const now = new Date();
        const hrs = now.getHours();
        const mins = now.getMinutes();
        const totalMins = hrs * 60 + mins;
        
        // 5:30 PM = 17:30 = 1050 mins
        // 6:00 PM = 18:00 = 1080 mins
        const isWindowOpen = totalMins >= 1050 && totalMins <= 1080;
        
        if (isWindowOpen) {
            postBtn.disabled = false;
            postBtn.classList.add('premium-pulsing');
            postBtn.title = "Ready to publish tomorrow's mission schedule.";
        } else {
            postBtn.disabled = true;
            postBtn.classList.remove('premium-pulsing');
            postBtn.title = "Schedule posting is only available between 5:30 PM and 6:00 PM.";
        }
    };

    updateBtnStatus();
    setInterval(updateBtnStatus, 60000);

    postBtn.onclick = async () => {
        if (!confirm("Are you sure you want to OFFICIALIZE tomorrow's schedules for Jettsan? This will make them visible to all assigned drivers.")) return;
        
        try {
            postBtn.disabled = true;
            postBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting...';

            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const dateStr = tomorrow.toISOString().split('T')[0];

            const q = query(collection(db, "schedules"), 
                where("schedule_date", "==", dateStr),
                where("isOfficial", "==", false)
            );
            
            const snap = await getDocs(q);
            if (snap.empty) {
                alert("No tomorrow's schedules found to post.");
                postBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Post Schedule';
                return;
            }

            const batchCount = snap.size;
            let updated = 0;
            
            const promises = snap.docs.map(d => updateDoc(d.ref, { 
                isOfficial: true,
                posted_at: serverTimestamp()
            }));
            
            await Promise.all(promises);
            
            alert(`SUCCESS: ${batchCount} schedules have been posted and are now LIVE for drivers.`);
            postBtn.innerHTML = '<i class="fas fa-check-circle"></i> Official Posted';
            postBtn.style.background = 'var(--accent-green)';
        } catch (err) {
            console.error("Posting error:", err);
            alert("Error posting schedules: " + err.message);
            postBtn.disabled = false;
            postBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Post Schedule';
        }
    };
}

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
        filter.innerHTML = '<option value="all">Global View (All Partners)</option>';
        
        companiesSnap.forEach(doc => {
            const data = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = data.name || data.company_name || 'Unnamed Partner';
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
    initDTRStatusSync();
}

/**
 * Tracks real-time availability based on DTR (Time In / Time Out) logs for today.
 */
function initDTRStatusSync() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dtrQuery = query(collection(db, "dtr_logs"), where("timestamp", ">=", today));
    
    onSnapshot(dtrQuery, (snapshot) => {
        snapshot.docChanges().forEach(change => {
            const data = change.doc.data();
            const email = data.driver_email?.toLowerCase()?.trim();
            if (!email) return;

            const logTime = data.timestamp?.toDate() || new Date();
            
            // Only update if this log is newer than what we have
            if (!driverDTRStatus[email] || logTime > driverDTRStatus[email].timestamp) {
                driverDTRStatus[email] = {
                    action: data.action, // 'time_in' or 'time_out'
                    name: data.driver_name,
                    companyId: data.accredited_company_id,
                    timestamp: logTime
                };
            }
        });

        // Trigger UI updates to reflect new availability
        updateOnlineDriversList();
        updateOnlineDisplay();
        Object.keys(driverMarkers).forEach(id => {
            if (allDriversData[id]) refreshMarker(id, allDriversData[id]);
        });
    });
}

function updateMapFilters() {
    Object.keys(driverMarkers).forEach(key => {
        refreshMarker(key);
    });
    updateOnlineDriversList();
}

function initStats() {
    // Real-time stats from Firestore
    let usersQuery = collection(db, "users");
    let bookingsQuery = query(collection(db, "bookings"), where("status", "==", "pending"));
    let schedulesQuery = collection(db, "schedules");
    let completedSchedulesQuery = query(collection(db, "schedules"), where("status", "==", "completed"));

    if (selectedCompanyId !== 'all') {
        usersQuery = query(usersQuery, where("accredited_company_id", "==", selectedCompanyId));
        bookingsQuery = query(bookingsQuery, where("accredited_company_id", "==", selectedCompanyId));
        schedulesQuery = query(schedulesQuery, where("accredited_company_id", "==", selectedCompanyId));
        completedSchedulesQuery = query(completedSchedulesQuery, where("accredited_company_id", "==", selectedCompanyId));
    }

    const unsubUsers = onSnapshot(usersQuery, (snapshot) => {
        const drivers = snapshot.docs.filter(d => (d.data().user_type === 'driver' || d.data().role === 'driver')).length;
        const totalDriversEl = document.getElementById('totalDrivers');
        if (totalDriversEl) totalDriversEl.innerText = drivers;
    });

    const unsubPartners = onSnapshot(collection(db, "accredited_companies"), (snapshot) => {
        const partnersCount = snapshot.docs.filter(d => d.data().status === 'active').length;
        const totalPartnersEl = document.getElementById('totalClients');
        if (totalPartnersEl) totalPartnersEl.innerText = partnersCount;
    });
    
    // Listen for new accidents
    const accidentsQuery = query(collection(db, "accidents"), where("status", "==", "pending"));
    const unsubAccidents = onSnapshot(accidentsQuery, (snapshot) => {
        if (!snapshot.empty) {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    triggerAccidentAlert(change.doc.data(), change.doc.id);
                }
            });
        }
    });

    const unsubBookings = onSnapshot(bookingsQuery, (snapshot) => {
        const pendingBadge = document.getElementById('pendingBookings');
        if (pendingBadge) pendingBadge.innerText = snapshot.size;
    });

    // Active Trips: status in ['started', 'in_progress']
    const activeTripsQuery = query(schedulesQuery, where("status", "in", ["started", "in_progress"]));
    const unsubSchedules = onSnapshot(activeTripsQuery, (snapshot) => {
        const activeSchedulesEl = document.getElementById('activeSchedules');
        if (activeSchedulesEl) activeSchedulesEl.innerText = snapshot.size;
    });

    // Extended Insights & Recent Completed Bookings
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const unsubCompleted = onSnapshot(completedSchedulesQuery, (snapshot) => {
        renderRecentCompletedBookings(snapshot);
        
        let totalDuration = 0;
        let todayCount = 0;
        let monthCount = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            const completedAt = data.updated_at?.toDate?.() || data.created_at?.toDate?.();
            if (!completedAt) return;
            
            if (completedAt >= today) todayCount++;
            if (completedAt >= startOfMonth) monthCount++;

            // Calculate duration if start/end times exist
            if (data.start_time && data.end_time) {
                const start = data.start_time.toDate ? data.start_time.toDate() : new Date(data.start_time);
                const end = data.end_time.toDate ? data.end_time.toDate() : new Date(data.end_time);
                if (!isNaN(start) && !isNaN(end)) {
                    totalDuration += (end - start) / (1000 * 60); // duration in minutes
                }
            }
        });

        const avgDuration = todayCount > 0 ? Math.round(totalDuration / todayCount) : 0;
        const avgDurationEl = document.getElementById('avgTripDuration');
        if (avgDurationEl) avgDurationEl.innerHTML = `${avgDuration} <small style="font-size:0.8rem; font-weight:400;">mins</small>`;
        
        const monthlyBookingsEl = document.getElementById('monthlyBookings');
        if (monthlyBookingsEl) monthlyBookingsEl.innerText = monthCount;
    });

    unsubscribeStats.push(unsubUsers, unsubPartners, unsubAccidents, unsubBookings, unsubSchedules, unsubCompleted);
}

function animateMarkerTo(marker, newPos) {
    if (!marker) return;
    const startPos = marker.getPosition();
    const startTime = performance.now();
    const duration = 4500; 

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

function initMap() {
    const mapOptions = {
        center: { lat: 14.5995, lng: 120.9842 },
        zoom: 11,
        disableDefaultUI: false,
        fullscreenControl: true
    };

    const mapElement = document.getElementById('drivers-map');
    if (!mapElement) return;
    
    driversMap = new google.maps.Map(mapElement, mapOptions);
    infoWindow = new google.maps.InfoWindow();

    onSnapshot(collection(db, "drivers"), (snapshot) => {
        snapshot.docChanges().forEach(change => {
            const id = change.doc.id; // UID
            const data = change.doc.data();
            const email = data.driver_email?.toLowerCase()?.trim();
            
            if (email) {
                const oldEmailEntry = allDriversData[email];
                emailToUidMap[email] = id;
                
                // If we already have location under the email key, MOVE it to the UID key
                if (oldEmailEntry && oldEmailEntry.current_latitude && !allDriversData[id]) {
                    console.log(`Merging Email-based location for ${email} into UID-based profile ${id}`);
                    allDriversData[id] = { ...oldEmailEntry, id: id };
                    delete allDriversData[email];
                    if (driverMarkers[email]) {
                        driverMarkers[id] = driverMarkers[email];
                        delete driverMarkers[email];
                    }
                }
            }
            
            if (change.type === "removed") {
                delete allDriversData[id];
                if (email) delete emailToUidMap[email];
                if (driverMarkers[id]) {
                    driverMarkers[id].setMap(null);
                    delete driverMarkers[id];
                }
                return;
            }
            updateDriverState(id, data, 'metadata');
        });
    });

    onSnapshot(collection(db, "driver_locations"), (snapshot) => {
        snapshot.docChanges().forEach(change => {
            const docId = change.doc.id; // Email
            const data = change.doc.data();
            const emailKey = docId.toLowerCase().trim();
            
            // Resolve to UID if possible
            const resolvedId = emailToUidMap[emailKey] || emailKey;
            
            if (change.type === "removed") {
                if (allDriversData[resolvedId]) {
                    allDriversData[resolvedId].current_latitude = null;
                    allDriversData[resolvedId].current_longitude = null;
                }
                refreshMarker(resolvedId);
                return;
            }
            updateDriverState(resolvedId, data, 'location');
        });
    });

    setInterval(() => {
        updateOnlineDriversList();
        updateOnlineDisplay();
    }, 60000);
}

function updateDriverState(id, data, source) {
    if (!allDriversData[id]) {
        allDriversData[id] = { id: id, driver_name: 'Loading...' };
    }
    
    if (source === 'metadata') {
        Object.assign(allDriversData[id], {
            driver_name: data.driver_name || existing.driver_name || 'Loading Driver...',
            current_status: data.current_status,
            vehicle_assigned: data.vehicle_assigned,
            plate_number: data.plate_number,
            driver_email: data.driver_email?.toLowerCase()?.trim() || existing.driver_email,
            accredited_company_id: data.accredited_company_id || "",
            profile_image_url: data.profile_image_url || existing.profile_image_url
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
            current_status: existingStatus === 'offline' ? 'available' : existingStatus
        });
    }
    
    refreshMarker(id);
    updateOnlineDriversList();
    updateOnlineDisplay();
}

function refreshMarker(id) {
    const d = allDriversData[id];
    if (!d || !d.current_latitude || !d.current_longitude) return;

    const pos = { lat: d.current_latitude, lng: d.current_longitude };
    const status = d.current_trip_phase || d.current_status || 'available';
    
    // Traffic Color Coding (NSCRP Rule)
    // Green > 40kmh, Orange 10-40kmh, Red < 10kmh
    const speedKmh = (d.current_speed || 0) * 3.6;
    let trafficColor = '#10b981'; // Default Green (Normal)
    if (speedKmh < 10) trafficColor = '#ef4444'; // Red (Heavy Traffic)
    else if (speedKmh < 40) trafficColor = '#f59e0b'; // Orange (Light Traffic)

    const markerIcon = getMarkerIcon(status, trafficColor);

    const now = Date.now();
    const tenMins = 10 * 60 * 1000;
    const lastActive = d.last_updated ? (d.last_updated.toMillis ? d.last_updated.toMillis() : (d.last_updated.seconds ? d.last_updated.seconds * 1000 : Number(d.last_updated))) : 0;
    
    // Availability Logic: Heartbeat + DTR Status
    const email = d.driver_email?.toLowerCase()?.trim();
    const dtr = driverDTRStatus[email];
    const isOnDuty = dtr ? dtr.action === 'time_in' : false;
    
    const isRecentlyActive = !isNaN(lastActive) && (now - lastActive) < (5 * 60 * 1000);
    const isOnline = isRecentlyActive || ( !isNaN(lastActive) && (now - lastActive) < tenMins && isOnDuty );
    const isAccident = d.current_status === 'accident' || d.is_accident === true;

    if (driverMarkers[id]) {
        animateMarkerTo(driverMarkers[id], pos);
        driverMarkers[id].setIcon(markerIcon);
        driverMarkers[id].setOpacity(status === 'offline' ? 0.6 : 1.0);
        driverMarkers[id].setVisible(isOnline);
        
        // Accident Blinking (using BOUNCE as a visual cue)
        if (isAccident) {
            if (!driverMarkers[id].isBlinking) {
                driverMarkers[id].setAnimation(google.maps.Animation.BOUNCE);
                driverMarkers[id].isBlinking = true;
            }
        } else {
            driverMarkers[id].setAnimation(null);
            driverMarkers[id].isBlinking = false;
        }

        driverMarkers[id].driverData = d;
    } else {
        const marker = new google.maps.Marker({
            position: pos,
            map: driversMap,
            title: d.driver_name || 'Driver',
            icon: markerIcon,
            opacity: status === 'offline' ? 0.6 : 1.0,
            visible: isOnline,
            animation: isAccident ? google.maps.Animation.BOUNCE : google.maps.Animation.DROP
        });

        marker.isBlinking = isAccident;
        marker.driverData = d;
        marker.addListener('click', () => {
            if (infoWindow) infoWindow.close();
            infoWindow.setContent(getInfoWindowContent(marker.driverData));
            infoWindow.open(driversMap, marker);
        });
        driverMarkers[id] = marker;
    }
}

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
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; border-top:1px solid #f1f5f9; padding-top:8px;">
                <span style="font-size: 10px; color: #94a3b8;">${driver.wifi_ssid ? `<i class="fas fa-wifi"></i> ${driver.wifi_ssid}` : 'Satellite Sync'}</span>
                ${driver.last_updated ? `<span style="font-size: 9px; color: #94a3b8;">Updated: ${new Date(driver.last_updated.seconds ? driver.last_updated.seconds * 1000 : (driver.toMillis ? driver.toMillis() : Number(driver.last_updated))).toLocaleTimeString()}</span>` : ''}
            </div>
        </div>
    `;
}

function updateOnlineDriversList() {
    const listContainer = document.getElementById('onlineDriversList');
    const onlineCount = document.getElementById('onlineCount');
    if (!listContainer) return;

    const now = Date.now();
    const liveThreshold = 30 * 1000;
    const onlineThreshold = 10 * 60 * 1000;
    
    const validDrivers = Object.values(allDriversData).filter(d => {
        if (!d.driver_name || d.driver_name === 'Loading Driver...') return false;
        // Company Filter Removed
        
        const email = d.driver_email?.toLowerCase()?.trim();
        if (!email || !driverDTRStatus[email] || driverDTRStatus[email].action !== 'time_in') return false;

        const lastUpdateMs = d.last_updated ? (d.last_updated.toMillis ? d.last_updated.toMillis() : (d.last_updated.seconds ? d.last_updated.seconds * 1000 : Number(d.last_updated))) : 0;
        return !isNaN(lastUpdateMs) && (now - lastUpdateMs) < onlineThreshold;
    });

    const sortedDrivers = validDrivers.sort((a, b) => {
        const getPriority = (s) => {
            if (['on_schedule', 'accepted', 'pickup', 'dropoff', 'in_progress'].includes(s)) return 1;
            if (s === 'available') return 2;
            return 3;
        };
        const priA = getPriority(a.current_status);
        const priB = getPriority(b.current_status);
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
        const vehicleInfo = driver.vehicle_assigned ? `${driver.vehicle_assigned}${driver.plate_number ? ' · ' + driver.plate_number : ''}` : '';
        const email = driver.driver_email?.toLowerCase()?.trim();

        const displayName = (driver.driver_name && driver.driver_name !== 'Loading...' && driver.driver_name !== 'Loading Driver...') 
            ? driver.driver_name 
            : (driverDTRStatus[email]?.name || 'Unnamed Driver');

        return `
            <div class="driver-item ${status === 'offline' ? 'offline' : ''} ${isLive ? 'pulse' : ''}" onclick="focusDriver('${driver.id}')" title="${vehicleInfo}">
                <div class="status-dot ${displayStatus}"></div>
                <div class="driver-info">
                    <div class="driver-name">${displayName}</div>
                    <div class="driver-status-text ${displayStatus}">${statusLabel}</div>
                    ${vehicleInfo ? `<div style="font-size:0.7em; color:var(--text-muted); margin-top:2px;"><i class="fas fa-car" style="font-size:0.8em;"></i> ${vehicleInfo}</div>` : ''}
                </div>
                <div class="driver-badge-area">
                    ${status === 'available' ? `<span class="status-badge available ${isLive ? 'premium' : ''}" style="font-size: 0.65rem; padding: 2px 6px;">Available</span>` : ''}
                    ${['on_schedule', 'accepted', 'pickup', 'dropoff', 'in_progress'].includes(displayStatus) ? `<span class="status-badge ${displayStatus}" style="font-size: 0.65rem; padding: 2px 6px;">${statusLabel}</span>` : ''}
                </div>
            </div>
        `;
    }).join('') : '<div style="text-align: center; color: var(--text-muted); padding: 20px; font-size: 0.85em;">No online drivers found.</div>';

    if (onlineCount) onlineCount.innerText = validDrivers.length;
}

function updateOnlineDisplay() {
    const onlineBadge = document.querySelector('.badge.live');
    const activeDriversEl = document.getElementById('activeDrivers');
    const mapStatusEl = document.getElementById('mapStatus');
    
    const now = Date.now();
    const tenMins = 10 * 60 * 1000;
    
    let onlineCount = 0;
    Object.values(allDriversData).forEach(d => {
        // Company Filter Removed
        const lastUpdateMs = d.last_updated ? (d.last_updated.toMillis ? d.last_updated.toMillis() : (d.last_updated.seconds ? d.last_updated.seconds * 1000 : Number(d.last_updated))) : 0;
        if (!isNaN(lastUpdateMs) && (now - lastUpdateMs) < tenMins) {
            onlineCount++;
        }
    });
    
    if (onlineBadge) {
        onlineBadge.innerHTML = `<i class="fas fa-circle pulse" style="color:#10b981; font-size:0.6em;"></i> LIVE: ${onlineCount} ONLINE`;
    }
    
    if (activeDriversEl) {
        activeDriversEl.innerText = onlineCount;
    }

    if (mapStatusEl) {
        mapStatusEl.innerText = `Live: ${onlineCount} drivers online`;
    }
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
    const color = getStatusColor(status).substring(1); 
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
        'pickup': '#3b82f6',     
        'dropoff': '#3b82f6',    
        'in_progress': '#3b82f6', 
        'offline': '#94a3b8'      
    };
    return colors[status] || '#94a3b8';
}

function renderRecentCompletedBookings(snapshot) {
    const widget = document.getElementById('completedBookingsWidget');
    if (!widget) return;

    if (snapshot.empty) {
        widget.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px; font-size: 0.85em;">No recently completed trips.</div>';
        return;
    }

    const docs = snapshot.docs.sort((a, b) => {
        const timeA = a.data().updated_at?.toMillis ? a.data().updated_at.toMillis() : (a.data().updated_at?.seconds ? a.data().updated_at.seconds * 1000 : 0);
        const timeB = b.data().updated_at?.toMillis ? b.data().updated_at.toMillis() : (b.data().updated_at?.seconds ? b.data().updated_at.seconds * 1000 : 0);
        return timeB - timeA;
    }).slice(0, 5);

    let html = '';
    docs.forEach(docSnap => {
        const data = docSnap.data();
        const id = docSnap.id;
        
        const getLocText = (loc) => {
            if (!loc) return 'Unknown';
            if (typeof loc === 'string') return loc;
            return loc.text || loc.address || 'Unknown';
        };

        const pickupStr = getLocText(data.pickup_location);
        const dropoffStr = getLocText(data.dropoff_location);
        const driverName = data.driver_name || 'Fleet Driver';
        const updatedTime = data.updated_at?.toDate ? data.updated_at.toDate() : (data.updated_at?.seconds ? new Date(data.updated_at.seconds * 1000) : new Date());
        const completedTime = updatedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        html += `
            <div class="widget-row">
                <div class="widget-info">
                    <div class="widget-title" style="display:flex; align-items:center; gap:8px;">
                        <span>Trip #${id.substring(0, 6).toUpperCase()}</span>
                        <span class="badge badge-success" style="font-size:0.6rem; padding:1px 6px;">COMPLETED</span>
                    </div>
                    <div class="widget-route" style="font-size:0.8rem; margin:4px 0;">
                        <i class="fas fa-map-marker-alt" style="color:var(--accent-teal);"></i> ${pickupStr} 
                        <i class="fas fa-long-arrow-alt-right" style="color: var(--text-muted); margin: 0 4px;"></i> 
                        ${dropoffStr}
                    </div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">
                        <i class="fas fa-user-check"></i> ${driverName} · Arrived at ${completedTime}
                    </div>
                </div>
                <button class="btn btn-secondary btn-sm" onclick="window.location.href='trip-tickets.html?id=${id}'" style="padding: 6px 12px; font-size: 0.75rem;">
                    View Ticket
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

    try {
        const bookingDoc = await getDoc(doc(db, "bookings", bookingId));
        const bookingData = bookingDoc.data();
        const driverDoc = await getDoc(doc(db, "drivers", driverId));
        const driverData = driverDoc.exists() ? driverDoc.data() : {};
        const driverEmail = driverData.driver_email || "";

        await updateDoc(doc(db, "bookings", bookingId), {
            status: "scheduled",
            driver_id: driverId,
            updated_at: serverTimestamp()
        });

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

        if (btn) {
            btn.innerHTML = "✅ Done";
            btn.style.background = "var(--accent-green)";
        }
    } catch (error) {
        console.error("Instant dispatch error:", error);
        alert("Failed to assign driver.");
    }
};

window.openDispatchModal = async function(bookingId) {
    currentDispatchBookingId = bookingId;
    const modal = document.getElementById('dispatchModal');
    const select = document.getElementById('driverSelect');
    if (!modal) return;
    select.innerHTML = '<option value="">Loading drivers...</option>';
    modal.classList.add('active');
    
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

    const sortedDrivers = Array.from(driverMap.values()).sort((a, b) => {
        if (a.isOnline === b.isOnline) return a.name.localeCompare(b.name);
        return a.isOnline ? -1 : 1;
    });
    
    if (sortedDrivers.length === 0) {
        select.innerHTML = '<option value="">No available drivers found</option>';
        return;
    }
    
    let optionsHtml = '<option value="">-- Select a Driver --</option>';
    sortedDrivers.forEach(d => {
        const icon = d.isOnline ? '🟢' : '⚪';
        optionsHtml += `<option value="${d.id}">${icon} ${d.name} - ${d.vehicle} (${d.plate})</option>`;
    });
    select.innerHTML = optionsHtml;
};

window.closeDispatchModal = function() {
    currentDispatchBookingId = null;
    const modal = document.getElementById('dispatchModal');
    if (modal) modal.classList.remove('active');
};

document.addEventListener('DOMContentLoaded', () => {
    const confirmBtn = document.getElementById('confirmDispatchBtn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            if (!currentDispatchBookingId) return;
            const select = document.getElementById('driverSelect');
            const driverId = select.value;
            if (!driverId) return alert("Select a driver.");

            confirmBtn.disabled = true;
            confirmBtn.innerText = "Dispatching...";

            try {
                const bookingDoc = await getDoc(doc(db, "bookings", currentDispatchBookingId));
                const bookingData = bookingDoc.data();
                const driverDoc = await getDoc(doc(db, "drivers", driverId));
                const driverData = driverDoc.data();
                const driverEmail = driverData.driver_email || "";

                await updateDoc(doc(db, "bookings", currentDispatchBookingId), {
                    status: "scheduled",
                    driver_id: driverId,
                    updated_at: serverTimestamp()
                });

                const scheduleData = sanitizeFirestoreData({
                    booking_id: currentDispatchBookingId,
                    numeric_booking_id: bookingData.numeric_booking_id || generateNumericId(),
                    schedule_id: generateNumericId(),
                    client_id: bookingData.client_id,
                    client_name: bookingData.client_name || "",
                    driver_id: driverId,
                    driver_email: driverEmail.toLowerCase().trim(),
                    driver_name: driverData.driver_name,
                    trip_phase: "pending",
                    status: "pending",
                    pickup_location: bookingData.pickup_location?.text || bookingData.pickup_location || "",
                    dropoff_location: bookingData.dropoff_location?.text || bookingData.dropoff_location || "",
                    schedule_date: bookingData.pickup_date || "",
                    schedule_time: bookingData.pickup_time || "",
                    created_at: serverTimestamp(),
                    updated_at: serverTimestamp()
                });

                await addDoc(collection(db, "schedules"), scheduleData);
                window.closeDispatchModal();
            } catch (error) {
                console.error(error);
                alert("Failed to assign driver.");
            } finally {
                confirmBtn.disabled = false;
                confirmBtn.innerText = "Confirm Dispatch";
            }
        });
    }
});
