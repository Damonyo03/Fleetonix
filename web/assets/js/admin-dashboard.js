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
let emailToUidMap = {}; 
let currentUserData = null;
let activeQuickInfoDriverId = null;

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
    initPostingFeature();
    initGlobalAdminListeners();
    initNewBookingFeature();
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
            const email = change.doc.id.toLowerCase().trim();
            const data = change.doc.data();
            const id = emailToUidMap[email] || email;
            
            if (change.type === "added" || change.type === "modified") {
                const lat = data.current_latitude || data.latitude || 0;
                const lng = data.current_longitude || data.longitude || 0;
                if (lat === 0 && lng === 0) return;

                updateDriverState(id, {
                    ...data,
                    current_latitude: lat,
                    current_longitude: lng,
                    driver_email: email,
                    last_updated: data.last_updated || data.timestamp || serverTimestamp()
                }, 'realtime');
            } else if (change.type === "removed") {
                removeMarker(id);
                delete allDriversData[id];
            }
        });
    });

    // 2. Metadata (Names/Photos)
    onSnapshot(query(collection(db, "users"), where("role", "==", "driver")), (snapshot) => {
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const email = data.email?.toLowerCase()?.trim();
            if (email) {
                emailToUidMap[email] = doc.id;
                updateDriverState(doc.id, {
                    driver_name: data.full_name || data.display_name,
                    driver_email: email,
                    profile_image_url: data.profile_image_url
                }, 'metadata');
            }
        });
    });

    // 3. Driver Extended Data (Vehicles + Incident Status)
    onSnapshot(collection(db, "drivers"), (snapshot) => {
        snapshot.docs.forEach(doc => {
            updateDriverState(doc.id, doc.data(), 'metadata');
        });
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
    const status = d.current_status || 'offline';
    const lastSeen = d.last_updated?.toDate ? d.last_updated.toDate() : new Date();
    const isStale = (new Date() - lastSeen) > HEARTBEAT_EXPIRY_MS;
    
    let statusClass = 'marker-available'; // Default Blue
    if (d.incident_active) {
        statusClass = 'marker-accident'; // Blinking Red/Orange
    } else if (isStale) {
        statusClass = 'marker-stale'; // Grey
    } else if (status === 'on_trip' || status === 'on_schedule' || status === 'busy') {
        statusClass = 'marker-on-schedule'; // Green
    }

    const pulseHtml = isMoving || d.incident_active ? '<div class="dot-pulse"></div>' : '';
    
    return L.divIcon({
        className: 'custom-driver-marker',
        html: `<div class="driver-dot ${statusClass}">${pulseHtml}</div>`,
        iconSize: [StatusMarkerSize(d.incident_active)],
        iconAnchor: [StatusMarkerSize(d.incident_active)/2, StatusMarkerSize(d.incident_active)/2]
    });
}

function StatusMarkerSize(isAccident) {
    return isAccident ? 24 : 14;
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
    if (!listEl) return;

    const drivers = Object.values(allDriversData)
        .filter(d => d.current_latitude && d.current_longitude)
        .sort((a, b) => a.driver_name.localeCompare(b.driver_name));

    listEl.innerHTML = drivers.map(d => {
        const speedKmh = (d.current_speed || 0) * 3.6;
        const isMoving = speedKmh >= MOVING_THRESHOLD_KMH;
        const isSelected = activeQuickInfoDriverId === d.id;
        
        return `
            <div class="driver-card ${isSelected ? 'selected' : ''}" onclick="focusDriverOnMap('${d.id}')">
                <img src="${d.profile_image_url || '../img/default-avatar.png'}" 
                     class="w-10 h-10 rounded-full border border-slate-700 bg-slate-800 object-cover"
                     onerror="this.src='../img/default-avatar.png'">
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-start">
                        <h5 class="text-sm font-bold text-slate-100 truncate">${d.driver_name}</h5>
                        <span class="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded ${isMoving ? 'bg-green-500/10 text-green-400' : 'bg-slate-500/10 text-slate-400'}">
                            ${isMoving ? 'Moving' : 'Idle'}
                        </span>
                    </div>
                    <div class="text-[11px] text-slate-400 truncate mt-0.5">
                        ${d.vehicle_assigned || 'No Vehicle'} · ${d.plate_number || 'N/A'}
                    </div>
                </div>
                ${isMoving ? '<div class="w-1.5 h-1.5 bg-accent-blue rounded-full shadow-[0_0_8px_#10b981]"></div>' : ''}
            </div>
        `;
    }).join('') || '<div class="p-6 text-center text-slate-500 text-sm">No drivers online.</div>';
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

    panel.innerHTML = `
        <div class="qip-header">
            <div class="qip-name">${d.driver_name}</div>
            <button class="qip-close" onclick="closeQuickInfo()">&times;</button>
        </div>
        <div class="qip-status-row">
            <span class="qip-badge ${status}">${status.toUpperCase()}</span>
            <span class="text-[10px] text-slate-500 ml-auto">UID: ${id.slice(-6)}</span>
        </div>
        <div class="qip-grid">
            <div class="qip-cell">
                <div class="qip-cell-label">Vehicle</div>
                <div class="qip-cell-value">${d.vehicle_assigned || '---'}</div>
            </div>
            <div class="qip-cell">
                <div class="qip-cell-label">Plate</div>
                <div class="qip-cell-value">${d.plate_number || '---'}</div>
            </div>
            <div class="qip-cell full">
                <div class="qip-cell-label">Address / Location</div>
                <div class="qip-cell-value text-xs">${d.current_city || 'Tracking...'}</div>
            </div>
            <div class="qip-cell full flex justify-between items-center">
                <div>
                    <div class="qip-cell-label">Velocity</div>
                    <div class="qip-cell-value text-accent-green">${speedKmh} <small>km/h</small></div>
                </div>
                <button class="bg-accent-blue/10 text-accent-blue text-[10px] px-3 py-1.5 rounded-lg border border-accent-blue/20" onclick="window.location.href='trip-tickets.html?driver=${id}'">
                    Full Logs
                </button>
            </div>
        </div>
    `;
    panel.style.display = 'block';
    
    // Highlight sidebar
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
function initPostingFeature() {
    const postBtn = document.getElementById('postScheduleBtn');
    if (!postBtn) return;
    postBtn.onclick = async () => {
        if (!confirm("Officialize tomorrow's schedules?")) return;
        try {
            postBtn.disabled = true;
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const dateStr = tomorrow.toISOString().split('T')[0];
            const q = query(collection(db, "schedules"), where("schedule_date", "==", dateStr), where("isOfficial", "==", false));
            const snap = await getDocs(q);
            if (snap.empty) return alert("No schedules found.");
            const batch = writeBatch(db);
            snap.docs.forEach(d => batch.update(d.ref, { isOfficial: true, posted_at: serverTimestamp() }));
            await batch.commit();
            alert("Posted successfully!");
        } catch (err) { alert(err.message); }
        finally { postBtn.disabled = false; }
    };
}

function initNewBookingFeature() {
    const btn = document.getElementById('newAdminBookingBtn');
    if (btn) {
        btn.onclick = () => {
            // Redirect to bookings page with trigger for modal
            window.location.href = 'bookings.html?trigger=new-booking';
        };
    }
}

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
    onSnapshot(collection(db, "accidents"), snap => {
        document.getElementById('activeJobs') ? document.getElementById('activeJobs').innerText = snap.size : null;
    });
}
