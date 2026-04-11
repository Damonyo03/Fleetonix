import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, query, where, onSnapshot, getDocs, doc, getDoc, updateDoc, addDoc, setDoc, serverTimestamp, writeBatch, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { initLayout, clearUserCache, showModal } from "./modules/ui.js";
import { sanitizeFirestoreData, generateNumericId } from "./modules/data.js";

// --- Configuration ---
const HEARTBEAT_EXPIRY_MS = 5 * 60 * 1000;
const MOVING_THRESHOLD_KMH = 5;

let driversMap = null;
let driverMarkers = {}; // UID -> { marker: L.Marker, data: Object }
let allDriversData = {}; // combined metadata + live location
let authorizedDriverIds = new Set(); // Source of truth for authorized assets
let emailToUidMap = {}; 
let currentUserData = null;
let activeQuickInfoDriverId = null;
let heartbeatInterval = null;

// Notification Counts
let accidentCount = 0;

/**
 * ── Authentication & Layout Initialization ──────────────────────────────
 */
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../login.html';
        return;
    }

    // Role Verification
    const userDoc = await getDoc(doc(db, "users", user.uid));
    let userData = userDoc.exists() ? userDoc.data() : null;
    
    if (!userData) {
        const q = query(collection(db, "users"), where("email", "==", user.email));
        const snap = await getDocs(q);
        if (!snap.empty) userData = snap.docs[0].data();
    }

    const adminRoles = ['admin', 'super_admin', 'company_admin'];
    const role = userData?.role || userData?.user_type;

    if (!userData || !adminRoles.includes(role)) {
        window.location.href = '../login.html?error=unauthorized';
        return;
    }

    currentUserData = userData;
    const name = userData.full_name || user.email.split('@')[0];
    initLayout('Dashboard', name);
    
    const welcomeMsg = document.getElementById('welcomeMessage');
    if (welcomeMsg) welcomeMsg.innerText = `Welcome back, ${name}! Here's your fleet overview.`;

    // Map & Tracking Init
    initMap();
    startRealtimeDriverTracking();
    
    // Feature Init
    initGlobalStats();
    initGlobalAdminListeners();
    initDispatchFeature();
    
    // Phase 2: Incident Listener
    startIncidentMonitoring();
});

/**
 * ── Leaflet Map Setup ──────────────────────────────────────────────────
 */
function initMap() {
    if (driversMap) return;

    driversMap = L.map('drivers-map', {
        zoomControl: false,
        attributionControl: false
    }).setView([14.5995, 120.9842], 12);

    // Dark Map Tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
    }).addTo(driversMap);

    L.control.zoom({ position: 'bottomright' }).addTo(driversMap);
    console.log("[Dashboard] Leaflet Map Initialized.");
}

/**
 * ── Real-time Driver Tracking & Data Stream ───────────────────────────
 */
function startRealtimeDriverTracking() {
    console.log("[Dashboard] Tracking drivers...");
    
    // 1. Live Locations
    onSnapshot(collection(db, "driver_locations"), (snapshot) => {
        snapshot.docChanges().forEach(change => {
            const docId = change.doc.id; // Could be email or UID
            const data = change.doc.data();
            
            // AUTHORIZATION SYNC: Skip ghost users not in 'drivers' collection
            if (!authorizedDriverIds.has(docId) && !emailToUidMap[docId.toLowerCase()]) {
                // If it's a ghost, ignore it and ensure its marker is removed
                removeMarker(docId);
                return;
            }

            const id = emailToUidMap[docId.toLowerCase()] || docId;
            
            if (change.type === "added" || change.type === "modified") {
                const lat = data.current_latitude || data.latitude || 0;
                const lng = data.current_longitude || data.longitude || 0;
                if (lat === 0 && lng === 0) return;

                updateDriverState(id, {
                    ...data,
                    current_latitude: lat,
                    current_longitude: lng,
                    last_updated: data.last_updated || data.timestamp || serverTimestamp()
                }, 'realtime');
            } else if (change.type === "removed") {
                removeMarker(id);
                delete allDriversData[id];
            }
        });
    });

    // 2. Authorized Drivers & Metadata
    onSnapshot(collection(db, "drivers"), (snapshot) => {
        authorizedDriverIds.clear();
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            authorizedDriverIds.add(doc.id);
            if (data.driver_email) emailToUidMap[data.driver_email.toLowerCase()] = doc.id;
            
            updateDriverState(doc.id, {
                ...data,
                driver_name: data.driver_name || 'Fleet Driver'
            }, 'metadata');
        });
    });

    // 3. User Metadata Sync (Photos)
    onSnapshot(query(collection(db, "users"), where("role", "==", "driver")), (snapshot) => {
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            updateDriverState(doc.id, {
                profile_image_url: data.profile_image_url
            }, 'metadata');
        });
    });

    // 4. Heartbeat Monitor (Runs every minute)
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(checkHeartbeats, 60000);
}

/**
 * HEARTBEAT MONITOR: Transition stale drivers to offline
 */
function checkHeartbeats() {
    const now = Date.now();
    Object.keys(allDriversData).forEach(id => {
        const d = allDriversData[id];
        if (!d.last_updated) return;
        
        const lastSeen = d.last_updated.toDate ? d.last_updated.toDate() : new Date(d.last_updated);
        if (now - lastSeen.getTime() > HEARTBEAT_EXPIRY_MS) {
            console.log(`[Heartbeat] Driver ${id} is stale. Moving to offline.`);
            refreshMarker(id); // Marker will show stale/offline
            updateOnlineDriversList();
        }
    });
}

/**
 * ── Incident & Accident Monitoring ───────────────────────────
 */
function startIncidentMonitoring() {
    console.log("[Dashboard] Monitoring incidents...");
    onSnapshot(query(collection(db, "incidents"), where("status", "==", "reported"), limit(10)), (snapshot) => {
        snapshot.docChanges().forEach(change => {
            if (change.type === "added") {
                const data = change.doc.data();
                const driverId = data.driver_id;
                
                // Alert Action: Auto-focus and notify
                if (driverMarkers[driverId]) {
                    const marker = driverMarkers[driverId].marker;
                    driversMap.setView(marker.getLatLng(), 18);
                    
                    // Trigger sound indicator or visual toast if needed
                    console.warn(`[ACCIDENT] High Priority Incident for ${data.driver_email}`);
                }
            }
        });
    });
}

function updateDriverState(id, data, source) {
    if (!allDriversData[id]) allDriversData[id] = { id, driver_name: 'Loading...' };
    const d = allDriversData[id];

    Object.assign(d, data);
    
    if (source === 'realtime') refreshMarker(id);
    
    // Throttled Sidebar Update
    if (!window.sidebarUpdateTimer) {
        window.sidebarUpdateTimer = setTimeout(() => {
            updateOnlineDriversList();
            window.sidebarUpdateTimer = null;
        }, 2000);
    }
}

/**
 * ── Marker & Animation Logic ──────────────────────────────────────────
 */
function refreshMarker(id) {
    const d = allDriversData[id];
    if (!d || !d.current_latitude || !d.current_longitude || !driversMap) return;

    const latlng = [d.current_latitude, d.current_longitude];
    const speedKmh = (d.current_speed || 0) * 3.6;
    const isMoving = speedKmh >= MOVING_THRESHOLD_KMH;
    const status = d.current_status || 'available';

    if (driverMarkers[id]) {
        const { marker } = driverMarkers[id];
        animateMarkerTo(marker, L.latLng(latlng));
        marker.setIcon(createDotIcon(d, isMoving));
    } else {
        const marker = L.marker(latlng, {
            icon: createDotIcon(d, isMoving)
        }).addTo(driversMap);
        
        marker.on('click', () => {
            driversMap.setView(latlng, 17);
            showQuickInfoPanel(id, d);
        });
        
        driverMarkers[id] = { marker, data: d };
    }
}

function animateMarkerTo(marker, newLatLng, duration = 1500) {
    const start = marker.getLatLng();
    const startTime = performance.now();

    function step(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const lat = start.lat + (newLatLng.lat - start.lat) * progress;
        const lng = start.lng + (newLatLng.lng - start.lng) * progress;
        marker.setLatLng([lat, lng]);
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

function createDotIcon(d, isMoving) {
    const statusClass = getDriverStatusClass(d, isMoving);
    const pulseHtml = isMoving || statusClass === 'accident' || statusClass === 'available' ? '<div class="dot-pulse"></div>' : '';
    const glowClass = statusClass === 'available' ? 'pulse-glow' : '';
    
    return L.divIcon({
        className: 'custom-driver-marker',
        html: `<div class="driver-dot ${statusClass} ${glowClass}">${pulseHtml}</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11]
    });
}

/**
 * Shared Status Logic for Syncing Map & Sidebar
 */
function getDriverStatusClass(d, isMoving) {
    const lastSeen = d.last_updated?.toDate ? d.last_updated.toDate() : new Date(d.last_updated || Date.now());
    const isStale = (new Date() - lastSeen) > HEARTBEAT_EXPIRY_MS;
    
    if (d.incident_active) return 'accident';
    if (isStale) return 'stale';

    const tripPhase = d.current_trip_phase || 'none';
    const status = d.current_status || 'offline';

    switch(tripPhase) {
        case 'accepted': 
        case 'on_schedule':
            return 'on_schedule';
        case 'en_route_pickup':
        case 'pickup':
            return 'pickup';
        case 'picked_up':
        case 'en_route_dropoff':
            return 'dropoff';
        case 'completed':
        case 'dropped_off':
            return 'completed';
        default:
            if (status === 'busy' || status === 'on_trip') return 'dropoff';
            if (isMoving) return 'pickup';
            return 'available';
    }
}

function removeMarker(id) {
    if (driverMarkers[id]) {
        driversMap.removeLayer(driverMarkers[id].marker);
        delete driverMarkers[id];
    }
}

/**
 * ── Sidebar List Rendering ─────────────────────────────────────────────
 */
function updateOnlineDriversList() {
    const listEl = document.getElementById('onlineDriversList');
    const countEl = document.getElementById('onlineCount');
    if (!listEl) return;

    const now = Date.now();
    const activeDrivers = Object.values(allDriversData).filter(d => {
        if (!authorizedDriverIds.has(d.id)) return false;
        if (!d.current_latitude || !d.current_longitude) return false;
        
        const lastSeen = d.last_updated?.toDate ? d.last_updated.toDate() : new Date(d.last_updated || 0);
        return (now - lastSeen.getTime()) < HEARTBEAT_EXPIRY_MS;
    }).sort((a, b) => a.driver_name.localeCompare(b.driver_name));

    if (countEl) countEl.innerText = activeDrivers.length;

    listEl.innerHTML = activeDrivers.map(d => {
        const speedKmh = ((d.current_speed || 0) * 3.6).toFixed(0);
        const lastSeen = d.last_updated?.toDate ? d.last_updated.toDate() : new Date(d.last_updated || 0);
        const isRecent = (now - lastSeen.getTime()) < 45000;
        const isSelected = activeQuickInfoDriverId === d.id;
        
        return `
            <div class="group relative bg-slate-800/40 hover:bg-slate-700/60 border border-slate-700/50 rounded-2xl p-4 mb-3 cursor-pointer transition-all duration-300 hover:translate-x-1 ${isSelected ? 'ring-2 ring-accent-blue bg-accent-blue/5' : ''}" 
                 onclick="focusDriverOnMap('${d.id}')">
                
                <div class="flex items-center gap-4">
                    <!-- Avatar with Status Ring -->
                    <div class="relative p-0.5">
                        <div class="absolute inset-0 rounded-full ${isRecent ? 'bg-accent-green/30 animate-pulse blur-[2px]' : 'bg-transparent'}"></div>
                        <img src="${d.profile_image_url || '../img/default-avatar.png'}" 
                             class="relative w-12 h-12 rounded-full object-cover border-2 ${isRecent ? 'border-accent-green shadow-[0_0_12px_rgba(0,255,136,0.4)]' : 'border-slate-600'}"
                             onerror="this.src='../img/default-avatar.png'">
                        
                        <!-- Status Badge synced with MAP -->
                        <div class="absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900 status-indicator-${getDriverStatusClass(d, (d.current_speed || 0) > 1.4)}" 
                             title="${getDriverStatusClass(d, (d.current_speed || 0) > 1.4).toUpperCase()}"></div>
                        
                        ${isRecent ? '<div class="absolute bottom-0 right-0 w-3.5 h-3.5 bg-accent-green rounded-full border-2 border-slate-900 animate-pulse shadow-[0_0_8px_#00ff88]"></div>' : ''}
                    </div>

                    <!-- Heart of the Card -->
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-start mb-1">
                            <h4 class="text-sm font-bold text-white truncate pr-2">${d.driver_name}</h4>
                            <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-slate-900/60 text-slate-400">
                                ${d.plate_number || 'N/A'}
                            </span>
                        </div>
                        <div class="flex items-center gap-2 text-[11px] text-slate-400">
                            <i class="fas fa-car text-accent-blue/60"></i>
                            <span class="truncate">${d.vehicle_assigned || 'Private Asset'}</span>
                        </div>
                    </div>
                </div>

                <!-- Secondary Data Row -->
                <div class="mt-4 flex items-center justify-between border-t border-slate-700/30 pt-3">
                    <div class="flex items-center gap-3">
                        <div class="flex items-center gap-1.5">
                            <i class="fas fa-tachometer-alt text-[10px] text-slate-500"></i>
                            <span class="text-[11px] font-bold text-accent-green">${speedKmh} <small class="font-normal opacity-60">km/h</small></span>
                        </div>
                        <div class="flex items-center gap-1.5">
                            <i class="fas fa-compass text-[10px] text-slate-500"></i>
                            <span class="text-[11px] text-slate-400 capitalize">${d.heading !== undefined ? d.heading + '°' : '---'}</span>
                        </div>
                    </div>
                    
                    <div class="flex gap-2">
                         <button class="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-900/40 text-slate-400 hover:text-accent-blue hover:bg-accent-blue/10 transition-colors">
                            <i class="fas fa-phone-alt text-[10px]"></i>
                         </button>
                         <button class="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-900/40 text-slate-400 hover:text-accent-blue hover:bg-accent-blue/10 transition-colors" onclick="window.location.href='trip-tickets.html?driver=${d.id}'">
                            <i class="fas fa-history text-[10px]"></i>
                         </button>
                    </div>
                </div>

                <!-- Glow Connection Bar -->
                <div class="absolute bottom-0 left-4 right-4 h-[1px] ${isRecent ? 'bg-gradient-to-r from-transparent via-accent-blue to-transparent shadow-[0_0_8px_#10b981]' : 'bg-transparent'}"></div>
            </div>
        `;
    }).join('') || '<div class="p-10 text-center flex flex-col items-center gap-3"> <i class="fas fa-radar text-3xl text-slate-700 animate-pulse"></i> <p class="text-slate-500 text-sm">No authorized drivers online.</p></div>';
}

window.focusDriverOnMap = function(id) {
    const d = allDriversData[id];
    if (!d) return;
    driversMap.setView([d.current_latitude, d.current_longitude], 17);
    showQuickInfoPanel(id, d);
};

/**
 * ── Quick Info Panel ──────────────────────────────────────────────────
 */
function showQuickInfoPanel(id, d) {
    activeQuickInfoDriverId = id;
    const panel = document.getElementById('quickInfoPanel');
    if (!panel) return;

    const speedKmh = ((d.current_speed || 0) * 3.6).toFixed(1);
    const status = d.current_status || 'available';
    const lastSeen = d.last_updated?.toDate ? d.last_updated.toDate() : new Date(d.last_updated || Date.now());
    const battery = d.battery_level || '--';
    const network = d.network_status || 'Stable';

    panel.innerHTML = `
        <div class="qip-header">
            <div>
                <div class="qip-name">${d.driver_name}</div>
                <div class="text-[10px] text-slate-500 font-mono mt-1">ID: ${id.slice(-8).toUpperCase()}</div>
            </div>
            <button class="text-slate-500 hover:text-white text-xl" onclick="closeQuickInfoPanel()">&times;</button>
        </div>

        <div class="flex items-center gap-2 mb-6">
            <span class="qip-badge ${status} pulse-glow">${status.replace(/_/g, ' ')}</span>
            <div class="flex gap-1 ml-auto">
                <div class="w-1.5 h-4 rounded-full bg-accent-green opacity-40"></div>
                <div class="w-1.5 h-4 rounded-full bg-accent-green opacity-60"></div>
                <div class="w-1.5 h-4 rounded-full bg-accent-green shadow-[0_0_8px_#00ff88]"></div>
            </div>
            <span class="text-[10px] font-black uppercase text-accent-green tracking-widest">${network}</span>
        </div>

        <div class="qip-grid">
            <div>
                <div class="qip-item-label">Vehicle & Plate</div>
                <div class="qip-item-value">${d.vehicle_assigned || '---'} • ${d.plate_number || '---'}</div>
            </div>
            <div>
                <div class="qip-item-label">Contact Number</div>
                <div class="qip-item-value text-accent-blue">${d.mobile_number || d.driver_phone || '---'}</div>
            </div>
            <div>
                <div class="qip-item-label">Velocity</div>
                <div class="qip-item-value text-accent-green">${speedKmh} km/h</div>
            </div>
            <div>
                <div class="qip-item-label">Current City</div>
                <div class="qip-item-value truncate">${d.current_city || 'Metro Manila'}</div>
            </div>
        </div>

        <div class="mt-6 pt-4 border-t border-slate-700/50 flex items-center justify-between">
            <span class="text-[10px] text-slate-500">Last seen: ${lastSeen.toLocaleTimeString()}</span>
            <button class="bg-accent-blue/10 text-accent-blue text-[10px] font-bold px-4 py-2 rounded-lg border border-accent-blue/20 hover:bg-accent-blue/20 transition-all" onclick="driversMap.panTo([${d.current_latitude}, ${d.current_longitude}])">
                RE-CENTER
            </button>
        </div>
    `;
    panel.style.display = 'block';
    updateOnlineDriversList();
}

window.closeQuickInfoPanel = function() {
    activeQuickInfoDriverId = null;
    document.getElementById('quickInfoPanel').style.display = 'none';
    updateOnlineDriversList();
};

/**
 * ── Feature Preservation (Post/Booking/Dispatch) ──────────────────────
 */

function initDispatchFeature() {
    // Legacy dispatch logic point
}

function initGlobalAdminListeners() {
    document.addEventListener('click', (e) => {
        if (e.target.closest('#logoutBtn')) {
            if (confirm("Sign out?")) signOut(auth).then(() => window.location.href = '../login.html');
        }
    });
}

function initGlobalStats() {
    // 1. Total Drivers
    onSnapshot(collection(db, "drivers"), snap => {
        const el = document.getElementById('totalDriversCount');
        if (el) el.innerText = snap.size;
    });

    // 2. Active Drivers (using our heartbeat logic indirectly via markers)
    // We update this via checking markers in the sidebar loop for simplicity, 
    // but we can also set it here.
    onSnapshot(collection(db, "driver_locations"), snap => {
        const activeEl = document.getElementById('activeDriversCount');
        if (activeEl) {
            // Drivers seen in the last 5 minutes
            const now = Date.now();
            const active = snap.docs.filter(doc => {
                const data = doc.data();
                const ts = data.last_updated?.toDate ? data.last_updated.toDate() : new Date(data.timestamp || 0);
                return (now - ts.getTime()) < HEARTBEAT_EXPIRY_MS;
            }).length;
            activeEl.innerText = active;
        }
    });

    // 3. Lifetime Total Trips
    onSnapshot(collection(db, "schedules"), snap => {
        const el = document.getElementById('totalTripsCount');
        if (el) el.innerText = snap.size;
    });

    // 4. Pending Bookings (Operational Counter)
    onSnapshot(query(collection(db, "bookings"), where("status", "==", "pending")), snap => {
        const el = document.getElementById('pendingBookings');
        if (el) el.innerText = snap.size;
    });

    // 5. Active Trips (Operational Counter)
    onSnapshot(query(collection(db, "schedules"), where("status", "==", "in_progress")), snap => {
        const el = document.getElementById('activeSchedules');
        if (el) el.innerText = snap.size;
    });

    // 6. Recent Completed Trips Widget (Removed)
}

