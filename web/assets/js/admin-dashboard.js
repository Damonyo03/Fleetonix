import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, query, where, onSnapshot, getDocs, doc, getDoc, updateDoc, addDoc, setDoc, serverTimestamp, writeBatch, limit, getCountFromServer } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { initLayout, clearUserCache, showModal, hideModal } from "./modules/ui.js";
import { sanitizeFirestoreData, generateNumericId } from "./modules/data.js";

// Map Configuration
const HEARTBEAT_EXPIRY_MS = 15 * 60 * 1000; // 15 mins till "Stale"
const GHOST_EXPIRY_MS = 60 * 60 * 1000;     // 1 hour till marker removed

let driversMap = null;
let driverMarkers = {};
let driverPolylines = {};
let driverStopMarkers = {}; // driverId -> [MapOverlay]
let allDriversData = {}; // Stores combined metadata + live location
let emailToUidMap = {}; // Maps driver_email -> UID for fast lookup
let pendingBookingsMap = new Map();
let currentDispatchBookingId = null;
let unsubscribeStats = [];
let unsubscribeDrivers = null;
let infoWindow = null;
let currentUserData = null; // Ported from admin-bookings.js
let driverDTRStatus = {}; // email -> { action: 'time_in'|'time_out', timestamp: JS Date }

// Live Map Assets
let accidentOverlays = {};        // driverId -> AccidentOverlay
let activeSchedulesData = {};      // driverId -> { stops:[], final:{}, tripId:"" }
let driverPaths = {};              // driverId -> [{lat, lng, speedKmh}]
let driverPolylineSegments = {};   // driverId -> [google.maps.Polyline] (colored segments)
let activeQuickInfoDriverId = null; // currently pinned Quick Info driver
let uiUpdateTimeout = null;
let listUpdateTimeout = null;

// Notification Counts (Ported from admin.js)
let accidentCount = 0;
let issueCount = 0;

// ── Batch Render Queue (C1) ───────────────────────────────────────────────────
const pendingRenderSet = new Set();
let renderFrameScheduled = false;

function scheduleRender(id) {
    pendingRenderSet.add(id);
    if (!renderFrameScheduled) {
        renderFrameScheduled = true;
        requestAnimationFrame(flushRenderQueue);
    }
}

function flushRenderQueue() {
    renderFrameScheduled = false;
    const MAX_PER_FRAME = 25;
    let count = 0;
    for (const id of pendingRenderSet) {
        if (count++ >= MAX_PER_FRAME) {
            renderFrameScheduled = true;
            requestAnimationFrame(flushRenderQueue);
            break;
        }
        refreshMarker(id);
        pendingRenderSet.delete(id);
    }
}

function isInViewport(lat, lng) {
    const bounds = driversMap?.getBounds();
    return !bounds || bounds.contains(new google.maps.LatLng(lat, lng));
}

// Fix Issue 4: Properly declared module-level globals (avoids ReferenceError in strict mode)
let selectedContractorId = null;

// Fix Issue 1: MapOverlay is moved INSIDE initMap() so it only
// runs after google.maps is confirmed ready. This variable is a
// module-level reference set once initMap() defines the class.
let MapOverlay = null;

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

    // Dashboard initialized for NSCRP Jettsan

    // Try to initialize map EARLY (so it doesn't wait for stats fetch)
    const tryInitMap = () => {
        if (window.__mapsReady && typeof google !== 'undefined' && google.maps) {
            initMap();
        } else {
            console.log("[Dashboard] Map API not ready yet, waiting...");
            document.addEventListener('maps-api-ready', () => initMap(), { once: true });
            // Secondary fallback for race conditions
            setTimeout(() => {
                if (!driversMap && window.__mapsReady) initMap();
            }, 1000);
        }
    };
    tryInitMap();

    // Start Live Listeners
    refreshDashboardData();
    
    // [UNCOUPLED DATA FLOW] Start tracking drivers immediately
    startRealtimeDriverTracking();
    
    initDashboardUI();
    initPostingFeature();
    initGlobalAdminListeners();
    initNewBookingFeature();
    initDispatchFeature();
});

function initDispatchFeature() {
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
                const targetDate = bookingData.pickup_date || "";

                // Admin Absolute Power: Removed isCutOffPassed check to allow overrides at any time.

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
                    isOfficial: false,
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
}

function initNewBookingFeature() {
    const newAdminBookingBtn = document.getElementById('newAdminBookingBtn');
    if (newAdminBookingBtn) {
        newAdminBookingBtn.addEventListener('click', () => {
            showAdminBookingModal();
        });
    }
}

/** Ported from admin.js: Listen for global system notifications */
function initGlobalAdminListeners() {
    // 1. Sidebar Toggles (Redundancy check)
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    if (menuToggle && sidebar && !menuToggle.dataset.listenerAttached) {
        menuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('show');
        });
        menuToggle.dataset.listenerAttached = "true";
    }

    // 2. Notification Badges
    const updateVisualBadges = () => {
        const total = accidentCount + issueCount;
        document.querySelectorAll('.notif-count').forEach(counter => {
            counter.innerText = total > 0 ? total : '0';
            counter.style.display = total > 0 ? 'inline-flex' : 'none';
            counter.classList.add('badge', 'badge-error');
        });
        const headerBadge = document.querySelector('.notification-badge');
        if (headerBadge) {
            headerBadge.innerText = total > 0 ? total : '0';
            headerBadge.style.display = total > 0 ? 'flex' : 'none';
        }
    };

    onSnapshot(query(collection(db, "accidents"), where("status", "!=", "acknowledged")), (snap) => {
        accidentCount = snap.size;
        updateVisualBadges();
    });

    onSnapshot(query(collection(db, "vehicle_issues"), where("status", "!=", "acknowledged")), (snap) => {
        issueCount = snap.size;
        updateVisualBadges();
    });

    // 3. Logout handling
    document.addEventListener('click', (e) => {
        const logoutBtn = e.target.closest('#logoutBtn') || e.target.closest('.nav-item.logout');
        if (logoutBtn) {
            e.preventDefault();
            if (confirm("Sign out of the administrative terminal?")) {
                clearUserCache();
                signOut(auth).then(() => {
                    window.location.href = '../login.html';
                }).catch(() => {
                    window.location.href = '../login.html';
                });
            }
        }
    });
}

function initPostingFeature() {
    const postBtn = document.getElementById('postScheduleBtn');
    if (!postBtn) return;

    // Force enable the button for Admin at all times
    postBtn.disabled = false;
    postBtn.classList.add('premium-pulsing');
    postBtn.title = "Publish schedules immediately.";

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
                postBtn.disabled = false; // Re-enable if empty
                return;
            }

            const batchCount = snap.size;
            const batch = writeBatch(db);
            snap.docs.forEach(d => {
                batch.update(d.ref, { 
                    isOfficial: true,
                    posted_at: serverTimestamp()
                });
            });
            
            await batch.commit();
            
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


function refreshDashboardData() {
    // 1. Cleanup existing listeners to avoid memory leaks
    unsubscribeStats.forEach(unsub => unsub && unsub());
    unsubscribeStats = [];
    
    if (unsubscribeDrivers) {
        unsubscribeDrivers();
        unsubscribeDrivers = null;
    }

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
    // A2: Define missing reference variables
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const activeTripsQuery = query(
        collection(db, "schedules"),
        where("status", "in", ["pending", "accepted", "moving_to_pickup", "picked_up", "moving_to_dropoff", "on_schedule"])
    );

    let usersQuery = collection(db, "users");
    let bookingsQuery = query(collection(db, "bookings"), where("status", "==", "pending"));
    let schedulesQuery = collection(db, "schedules");
    
    // 4. Completed Missions (C6 - Bounded Query Optimization)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    
    const completedSchedulesQuery = query(
        collection(db, "schedules"),
        where("status", "==", "completed"),
        where("updated_at", ">=", cutoff),
        limit(100)
    );

    // ── Optimized KPI Aggregations (bypass 100-limit constraints) ──
    const updateBigStats = async () => {
        try {
            // 1. Total Drivers
            const drvCount = await getCountFromServer(query(collection(db, "users"), where("role", "==", "driver")));
            const totalDriversEl = document.getElementById('totalDrivers');
            if (totalDriversEl) totalDriversEl.innerText = drvCount.data().count;

            // 2. Monthly Bookings
            const monthCount = await getCountFromServer(query(
                collection(db, "schedules"),
                where("status", "==", "completed"),
                where("updated_at", ">=", startOfMonth)
            ));
            const monthlyBookingsEl = document.getElementById('monthlyBookings');
            if (monthlyBookingsEl) monthlyBookingsEl.innerText = monthCount.data().count;

            // 3. Pending & Active (Refresh once, then live listeners take over)
            const pendingCount = await getCountFromServer(bookingsQuery);
            const pendingBadge = document.getElementById('pendingBookings');
            if (pendingBadge) pendingBadge.innerText = pendingCount.data().count;

            const activeCount = await getCountFromServer(activeTripsQuery);
            const activeSchedulesEl = document.getElementById('activeSchedules');
            if (activeSchedulesEl) activeSchedulesEl.innerText = activeCount.data().count;

        } catch (err) {
            console.warn("Failed to update aggregate KPIs:", err);
        }
    };
    updateBigStats();
    setInterval(updateBigStats, 5 * 60 * 1000); // Periodic re-sync for aggregates

    const unsubUsers = onSnapshot(usersQuery, (snapshot) => {
        // Keep live for small changes if needed, but aggregates are handled above
    });

    // Total Partners stat removed or hardcoded to 1 (Jettsan)
    const totalPartnersEl = document.getElementById('totalClients');
    if (totalPartnersEl) totalPartnersEl.innerText = "1";
    
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

    const unsubSchedules = onSnapshot(activeTripsQuery, (snapshot) => {
        const activeSchedulesEl = document.getElementById('activeSchedules');
        if (activeSchedulesEl) activeSchedulesEl.innerText = snapshot.size;

        snapshot.docChanges().forEach(change => {
            const data = change.doc.data();
            const driverId = data.driver_id;
            if (!driverId) return;

            if (change.type === "removed") {
                delete activeSchedulesData[driverId];
                if (allDriversData[driverId]) delete allDriversData[driverId].odometer_start;
            } else {
                const stops = [];
                if (data.segments && Array.isArray(data.segments)) {
                    data.segments.forEach((seg, idx) => {
                        stops.push({ 
                            latitude: seg.pickup_latitude, 
                            longitude: seg.pickup_longitude, 
                            label: `P${idx + 1}` 
                        });
                        stops.push({ 
                            latitude: seg.dropoff_latitude, 
                            longitude: seg.dropoff_longitude, 
                            label: `D${idx + 1}` 
                        });
                    });
                } else {
                    if (data.pickup_latitude && data.pickup_longitude) {
                        stops.push({ latitude: data.pickup_latitude, longitude: data.pickup_longitude, label: 'P' });
                    }
                }

                activeSchedulesData[driverId] = {
                    stops: stops,
                    final: data.dropoff_location,
                    tripId: change.doc.id,
                    status: data.status
                };
                if (allDriversData[driverId]) {
                    allDriversData[driverId].odometer_start = data.odometer_start;
                }
            }
            if (driverMarkers[driverId]) refreshMarker(driverId);
        });
    });

    const unsubCompleted = onSnapshot(completedSchedulesQuery, (snapshot) => {
        renderRecentCompletedBookings(snapshot);
        
        let totalDuration = 0;
        let todayCount = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            const completedAt = data.updated_at?.toDate?.() || data.created_at?.toDate?.();
            if (!completedAt) return;
            
            if (completedAt >= today) todayCount++;

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
    });

    unsubscribeStats.push(unsubUsers, unsubAccidents, unsubBookings, unsubSchedules, unsubCompleted);
}

function animateMarkerTo(marker, newPos) {
    // Cancel any in-progress animation for this marker (C2)
    if (marker.animationId) {
        cancelAnimationFrame(marker.animationId);
        marker.animationId = null;
    }
    if (!marker.getPosition()) {
        marker.setPosition(newPos);
        return;
    }
    const startPos = marker.getPosition();
    const startTime = performance.now();
    const duration = 4500;

    function step(now) {
        const progress = Math.min((now - startTime) / duration, 1);
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
    // Fix Issue 1: Define MapOverlay HERE, after google.maps is guaranteed ready.
    // This is the only safe place — it must extend google.maps.OverlayView.
    MapOverlay = class extends google.maps.OverlayView {
        constructor(position, content, className) {
            super();
            this.position = position;
            this.content = content;
            this.className = className;
            this.div = null;
        }
        onAdd() {
            this.div = document.createElement('div');
            this.div.className = this.className;
            this.div.style.position = 'absolute';
            this.div.innerHTML = this.content;
            const panes = this.getPanes();
            panes.overlayMouseTarget.appendChild(this.div);
        }
        draw() {
            const overlayProjection = this.getProjection();
            const sw = overlayProjection.fromLatLngToDivPixel(this.position);
            if (sw && this.div) {
                this.div.style.left = sw.x + 'px';
                this.div.style.top = sw.y + 'px';
            }
        }
        onRemove() {
            if (this.div) {
                this.div.parentNode.removeChild(this.div);
                this.div = null;
            }
        }
        setPosition(pos) {
            this.position = pos;
            this.draw();
        }
    };

    const mapOptions = {
        center: { lat: 14.5995, lng: 120.9842 },
        zoom: 11,
        disableDefaultUI: false,
        fullscreenControl: true
    };

    const mapElement = document.getElementById('drivers-map');
    if (!mapElement) return;
    console.log("[Dashboard] Initializing Google Map...");
    const mapStatusEl = document.getElementById('mapStatus');
    
    try {
        const mapElement = document.getElementById('drivers-map');
        if (!mapElement) {
            throw new Error("Map container #drivers-map not found in DOM.");
        }

        const mapOptions = {
            center: { lat: 14.5995, lng: 120.9842 }, // Manila
            zoom: 12,
            // mapId: 'f0c8e31d4b65673', // Premium vector map id
            disableDefaultUI: false,
            zoomControl: true,
            gestureHandling: 'greedy'
        };

        driversMap = new google.maps.Map(mapElement, mapOptions);
        infoWindow = new google.maps.InfoWindow();

        // Register idle listener exactly once — re-renders all drivers after pan/zoom (C5)
        driversMap.addListener('idle', () => {
            Object.keys(allDriversData).forEach(id => scheduleRender(id));
        });

        console.log("[Dashboard] Map initialized successfully.");
        if (mapStatusEl) {
            mapStatusEl.innerText = "LIVE";
            mapStatusEl.className = "badge badge-success";
        }
        
        // Initial render of any data already fetched
        Object.keys(allDriversData).forEach(id => scheduleRender(id));
        
    } catch (error) {
        console.error("[Dashboard] Map Initialization Failed:", error);
        if (mapStatusEl) {
            mapStatusEl.innerText = "ERROR";
            mapStatusEl.className = "badge badge-error";
            mapStatusEl.title = error.message;
        }
    }
}

/**
 * [UNCOUPLED] Starts real-time Firestore listeners for driver locations and metadata.
 * Can safely run before Google Maps is ready.
 */
function startRealtimeDriverTracking() {
    console.log("[Dashboard] Starting real-time driver tracking...");
    
    // Inclusive Query: Show ALL registered drivers who have reported a location
    const onlineDriversQuery = query(collection(db, "drivers")); 

    unsubscribeDrivers = onSnapshot(onlineDriversQuery, (snapshot) => {
        snapshot.docChanges().forEach(change => {
            const id = change.doc.id;
            const data = change.doc.data();
            
            if (change.type === "added" || change.type === "modified") {
                if (data.location) {
                    data.current_latitude = data.location.latitude;
                    data.current_longitude = data.location.longitude;
                }
                if (data.lastSeen) data.last_updated = data.lastSeen;
                updateDriverState(id, data, 'realtime');
            } else if (change.type === "removed") {
                if (driverMarkers[id]) {
                    driverMarkers[id].setMap(null);
                    delete driverMarkers[id];
                }
                delete allDriversData[id];
                updateOnlineDriversList();
                updateOnlineDisplay();
            }
        });
    });

    // Metadata Listener
    const unsubUsers = onSnapshot(query(collection(db, "users"), where("role", "==", "driver")), (snapshot) => {
        snapshot.docChanges().forEach(change => {
            if (change.type === "removed") return;
            const id = change.doc.id;
            const data = change.doc.data();
            const email = data.email?.toLowerCase()?.trim();
            if (email) emailToUidMap[email] = id;
            
            if (!allDriversData[id]) {
                updateDriverState(id, {
                    driver_name: data.full_name || data.display_name || data.fullName,
                    driver_email: email
                }, 'metadata');
            }
        });
    });
    unsubscribeStats.push(unsubUsers);

    // Refresh display periodically for heartbeat calculations
    // Refresh display periodically
    setInterval(() => {
        updateOnlineDriversList();
        updateOnlineDisplay();
    }, 15000);

    // Hybrid Cleanup Loop: Remove ghost markers but keep metadata
    setInterval(() => {
        const now = Date.now();
        Object.keys(allDriversData).forEach(id => {
            const d = allDriversData[id];
            const lastActive = d.last_updated
                ? (d.last_updated.toMillis ? d.last_updated.toMillis() : (d.last_updated.seconds ? d.last_updated.seconds * 1000 : Number(d.last_updated)))
                : 0;
            const lastActiveMs = Math.max(lastActive, d.last_location_push || 0);
            
            // If genuinely silent for 1 hour, purge marker
            if (now - lastActiveMs > GHOST_EXPIRY_MS) {
                if (driverMarkers[id]) {
                    driverMarkers[id].setMap(null);
                    delete driverMarkers[id];
                }
            }
        });
    }, 5 * 60 * 1000);
}


function updateDriverState(id, data, source) {
    if (!allDriversData[id]) {
        allDriversData[id] = { id: id, driver_name: 'Loading...' };
    }
    const existing = allDriversData[id];
    
    // Unified data merge
    Object.assign(existing, {
        driver_name: data.driver_name || data.full_name || existing.driver_name || 'Fleet Driver',
        current_status: data.current_status || existing.current_status || 'available',
        status: data.status || existing.status,
        current_trip_phase: data.current_trip_phase || existing.current_trip_phase,
        vehicle_assigned: data.vehicle_assigned || existing.vehicle_assigned,
        plate_number: data.plate_number || existing.plate_number,
        car_color: data.car_color || existing.car_color,
        driver_email: data.driver_email?.toLowerCase()?.trim() || existing.driver_email,
        profile_image_url: data.profile_image_url || existing.profile_image_url,
        is_background: data.is_background !== undefined ? data.is_background : existing.is_background,
        device_health: data.device_health || existing.device_health,
        current_latitude: data.current_latitude !== undefined ? data.current_latitude : existing.current_latitude,
        current_longitude: data.current_longitude !== undefined ? data.current_longitude : existing.current_longitude,
        current_speed: data.current_speed !== undefined ? data.current_speed : existing.current_speed,
        current_heading: data.current_heading !== undefined ? data.current_heading : existing.current_heading,
        last_updated: data.last_updated || existing.last_updated,
        lastSeen: data.lastSeen || existing.lastSeen,
        last_location_push: Date.now()
    });

    if (source === 'realtime') {
        scheduleRender(id);
    }
    
    // Throttled UI Updates
    if (!listUpdateTimeout) {
        listUpdateTimeout = setTimeout(() => {
            updateOnlineDriversList();
            listUpdateTimeout = null;
        }, 1500); // Refresh list every 1.5s
    }
    
    if (!uiUpdateTimeout) {
        uiUpdateTimeout = setTimeout(() => {
            updateOnlineDisplay();
            uiUpdateTimeout = null;
        }, 3000); // Refresh headers every 3s
    }
}



function refreshMarker(id) {
    const d = allDriversData[id];
    if (!d || !d.current_latitude || !d.current_longitude) return;

    // Safety: Skip marker rendering if Google Maps is not yet loaded
    if (!driversMap || !google.maps.Marker) return;

    // Viewport culling (C5) — skip expensive render for off-screen drivers
    const inViewport = isInViewport(d.current_latitude, d.current_longitude);
    if (!inViewport) {
        if (driverMarkers[id]) driverMarkers[id].setVisible(false);
        return;
    }

    const pos = { lat: d.current_latitude, lng: d.current_longitude };
    const status = d.current_trip_phase || d.current_status || 'available';
    
    // Traffic Color Coding (NSCRP Rule)
    const speedKmh = (d.current_speed || 0) * 3.6;
    let trafficColor = '#10b981';
    if (speedKmh < 10) trafficColor = '#ef4444';
    else if (speedKmh < 40) trafficColor = '#f59e0b';

    const markerIcon = getMarkerIcon(status, trafficColor);

    const now = Date.now();
    const lastActive = d.last_updated
        ? (d.last_updated.toMillis ? d.last_updated.toMillis() : (d.last_updated.seconds ? d.last_updated.seconds * 1000 : Number(d.last_updated)))
        : 0;
    
    // Heartbeat Logic: Check if driver is "Stale"
    const lastActiveMs = Math.max(lastActive, d.last_location_push || 0);
    const heartbeatAge = now - lastActiveMs;
    const isStale = heartbeatAge > HEARTBEAT_EXPIRY_MS;
    
    // Availability Logic: Heartbeat + DTR Status
    const email = d.driver_email?.toLowerCase()?.trim();
    const dtr = driverDTRStatus[email];
    const isOnDuty = dtr ? dtr.action === 'time_in' : false;
    
    // Visualization Rules
    const isOnline = !isStale && (isOnDuty || status !== 'offline');
    const isAccident = d.current_status === 'accident' || d.is_accident === true || d.incident_active === true;
    const isCompleted = d.current_trip_phase === 'completed' || d.current_status === 'completed';

    // Automated Cleanup for Completed Trips
    if (isCompleted) {
        if (driverPolylines[id]) { driverPolylines[id].setMap(null); delete driverPolylines[id]; }
        if (driverPolylineSegments[id]) {
            driverPolylineSegments[id].forEach(s => s.setMap(null));
            delete driverPolylineSegments[id];
        }
        if (driverPaths[id]) delete driverPaths[id];
        if (accidentOverlays[id]) { accidentOverlays[id].setMap(null); delete accidentOverlays[id]; }
        if (driverStopMarkers[id]) {
            driverStopMarkers[id].forEach(m => m.setMap(null));
            delete driverStopMarkers[id];
        }
        if (activeQuickInfoDriverId === id) closeQuickInfoPanel();
    }

    if (driverMarkers[id]) {
        const marker = driverMarkers[id];
        animateMarkerTo(marker, pos);
        marker.setIcon(markerIcon);
        
        // Visual distinction: Registered but Offline = Dimmed
        marker.setOpacity(isOnline ? 1.0 : 0.5);
        
        // Hide standard marker if accident is active (blinking overlay replaces it)
        marker.setVisible(!isAccident && !isCompleted);
        
        // Accident Blinking Implementation
        if (isAccident && !isCompleted) {
            if (!accidentOverlays[id]) {
                accidentOverlays[id] = new MapOverlay(pos, '<div class="emergency-marker-inner">!</div>', 'blinking-emergency');
                accidentOverlays[id].setMap(driversMap);
            } else {
                accidentOverlays[id].setPosition(pos);
            }
        } else if (accidentOverlays[id]) {
            accidentOverlays[id].setMap(null);
            delete accidentOverlays[id];
        }

        // --- Route Tracking ---
        if (!isCompleted && (status === 'in_progress' || status === 'pickup' || status === 'dropoff' ||
                            status === 'moving_to_pickup' || status === 'moving_to_dropoff' ||
                            status === 'picked_up' || status === 'accepted' || status === 'on_schedule')) {
            if (!driverPaths[id]) driverPaths[id] = [];
            
            const lastPoint = driverPaths[id][driverPaths[id].length - 1];
            if (!lastPoint || (lastPoint.lat !== pos.lat || lastPoint.lng !== pos.lng)) {
                driverPaths[id].push({ lat: pos.lat, lng: pos.lng, speedKmh });
                if (driverPaths[id].length > 120) driverPaths[id].shift();
            }

            const path = driverPaths[id];
            if (path && path.length >= 2) {
                const prev = path[path.length - 2];
                const curr = path[path.length - 1];
                if (prev.lat !== curr.lat || prev.lng !== curr.lng) {
                    const color = (curr.speedKmh > 40) ? '#10b981' : (curr.speedKmh > 10 ? '#f59e0b' : '#ef4444');
                    const newSeg = new google.maps.Polyline({
                        path: [{ lat: prev.lat, lng: prev.lng }, { lat: curr.lat, lng: curr.lng }],
                        strokeColor: color,
                        strokeOpacity: 0.85,
                        strokeWeight: 4,
                        map: driversMap
                    });
                    if (!driverPolylineSegments[id]) driverPolylineSegments[id] = [];
                    driverPolylineSegments[id].push(newSeg);
                    if (driverPolylineSegments[id].length > 119) {
                        const oldest = driverPolylineSegments[id].shift();
                        if (oldest) oldest.setMap(null);
                    }
                }
            }
        }

        // Sequential Destination Milestones (Numbered Stops & Checkered Flag)
        const mission = activeSchedulesData[id];
        if (mission && !isCompleted) {
            if (!driverStopMarkers[id]) driverStopMarkers[id] = [];
            
            // Clear existing and re-draw markers for this mission
            driverStopMarkers[id].forEach(m => m.setMap(null));
            driverStopMarkers[id] = [];

            // 1. Numbered Intermediate Stops
            if (mission.stops && mission.stops.length > 0) {
                mission.stops.forEach((stop, index) => {
                    if (stop.latitude && stop.longitude) {
                        const stopPos = { lat: Number(stop.latitude), lng: Number(stop.longitude) };
                        const overlay = new MapOverlay(
                            stopPos,
                            `<span>${stop.label || (index + 1)}</span>`,
                            'stop-marker-numbered'
                        );
                        overlay.setMap(driversMap);
                        driverStopMarkers[id].push(overlay);
                    }
                });
            }

            // 2. Checkered Flag (Final Destination)
            if (mission.final && mission.final.latitude && mission.final.longitude) {
                const finalPos = { lat: Number(mission.final.latitude), lng: Number(mission.final.longitude) };
                const flagOverlay = new MapOverlay(
                    finalPos,
                    '<i class="fas fa-flag-checkered"></i>',
                    'finish-marker-checkered'
                );
                flagOverlay.setMap(driversMap);
                driverStopMarkers[id].push(flagOverlay);
            }
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
        
        // Initial setup for accident blinking if needed
        if (isAccident && !isCompleted) {
            if (!accidentOverlays[id]) {
                accidentOverlays[id] = new MapOverlay(
                    pos, 
                    '<div class="emergency-marker-inner">!</div>', 
                    'blinking-emergency'
                );
                accidentOverlays[id].setMap(driversMap);
            }
        }
        marker.driverData = d;
        marker.driverId = id;
        marker.addListener('click', () => {
            // Auto-center + zoom the map
            driversMap.panTo(marker.getPosition());
            driversMap.setZoom(16);
            // Show Quick Info panel (replaces legacy infoWindow)
            showQuickInfoPanel(id, marker.driverData);
        });
        driverMarkers[id] = marker;
    }

    // Live-update Quick Info if this driver is currently pinned
    if (activeQuickInfoDriverId === id) {
        showQuickInfoPanel(id, d);
    }
}

function getInfoWindowContent(driver) {
    const status = driver.current_trip_phase || driver.current_status || 'available';
    const speedKmh = ((driver.current_speed || 0) * 3.6).toFixed(1);
    const heading = Math.round(driver.current_heading || 0);

    // Resolve display name — prefer stored driver_name over email fallback
    const displayName = (driver.driver_name && driver.driver_name !== 'Loading...' && driver.driver_name !== 'Loading Driver...')
        ? driver.driver_name
        : (driverDTRStatus[driver.driver_email?.toLowerCase()?.trim()]?.name || driver.driver_email || 'Fleet Driver');

    // Resolve vehicle info
    const vehicleInfo = driver.vehicle_assigned
        ? `${driver.vehicle_assigned}${driver.plate_number ? ' · ' + driver.plate_number : ''}`
        : 'No Vehicle Assigned';

    // Last seen formatted
    let lastSeenText = '';
    if (driver.last_updated) {
        const lastMs = driver.last_updated.toMillis ? driver.last_updated.toMillis() : (driver.last_updated.seconds ? driver.last_updated.seconds * 1000 : Number(driver.last_updated));
        const ageMins = Math.round((Date.now() - lastMs) / 60000);
        const timeStr = new Date(lastMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        lastSeenText = `${timeStr} (${ageMins}m ago)`;
    }
    
    return `
        <div class="map-info-window" style="color: #333; padding: 12px; min-width: 240px; font-family: 'Inter', sans-serif;">
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px; border-bottom:1px solid #eee; padding-bottom:8px;">
                <div style="width:42px; height:42px; border-radius:50%; background:#e2e8f0; display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0;">
                    ${driver.profile_image_url
                        ? `<img src="${driver.profile_image_url}" style="width:100%; height:100%; object-fit:cover;">`
                        : `<i class="fas fa-user-circle" style="font-size:26px; color:#64748b;"></i>`
                    }
                </div>
                <div>
                    <strong style="display:block; font-size:15px; color:#1e293b;">${displayName}</strong>
                    <span style="font-size:11px; color:#64748b;">${driver.driver_email || ''}</span>
                </div>
            </div>
            <div style="margin-bottom:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:11px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px;">Status</span>
                    <span style="color:${getStatusColor(status)}; font-weight:700; font-size:11px; background:${getStatusColor(status)}18; padding:2px 9px; border-radius:10px;">${status.replace(/_/g, ' ').toUpperCase()}</span>
                </div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px;">
                <div style="font-size:11px; color:#475569; background:#f8fafc; padding:7px; border-radius:7px;">
                    <i class="fas fa-tachometer-alt" style="color:#3b82f6; width:14px;"></i> <strong>${speedKmh}</strong> <small>km/h</small>
                </div>
                <div style="font-size:11px; color:#475569; background:#f8fafc; padding:7px; border-radius:7px;">
                    <i class="fas fa-compass" style="color:#3b82f6; width:14px;"></i> <strong>${heading}&deg;</strong> <small>HDG</small>
                </div>
                <div style="font-size:11px; color:#475569; background:#f0fdf4; padding:7px; border-radius:7px; grid-column:1 / span 2;">
                    <i class="fas fa-car" style="color:#10b981; width:14px;"></i> ${vehicleInfo}
                </div>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #f1f5f9; padding-top:8px;">
                <span style="font-size:10px; color:#94a3b8;">
                    ${driver.wifi_ssid ? `<i class="fas fa-wifi"></i> ${driver.wifi_ssid}` : '<i class="fas fa-satellite"></i> Satellite'}
                </span>
                <span style="font-size:9px; color:${lastSeenText.includes('ago') && parseInt(lastSeenText) > 3 ? '#f59e0b' : '#94a3b8'}">
                    ${lastSeenText ? `&#128337; ${lastSeenText}` : ''}
                </span>
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
        const lastSeen = d.lastSeen ? (d.lastSeen.toMillis ? d.lastSeen.toMillis() : (d.lastSeen.seconds ? d.lastSeen.seconds * 1000 : Number(d.lastSeen))) : 0;
        const lastUpdated = d.last_updated ? (d.last_updated.toMillis ? d.last_updated.toMillis() : (d.last_updated.seconds ? d.last_updated.seconds * 1000 : Number(d.last_updated))) : 0;
        const lastPulse = d.last_location_push || 0;
        
        const effectiveLastSeen = Math.max(lastSeen, lastUpdated, lastPulse);
        return !isNaN(effectiveLastSeen) && effectiveLastSeen > 0 && (now - effectiveLastSeen) < onlineThreshold;
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
        const isBackground = driver.is_background === true;
        const vehicleInfo = driver.vehicle_assigned ? `${driver.vehicle_assigned}${driver.car_color ? ' (' + driver.car_color + ')' : ''}${driver.plate_number ? ' · ' + driver.plate_number : ''}` : '';
        const email = driver.driver_email?.toLowerCase()?.trim();

        const displayName = (driver.driver_name && !['Loading...', 'Fleet Driver', 'Loading Driver...'].includes(driver.driver_name)) 
            ? driver.driver_name 
            : (driverDTRStatus[email]?.name || driver.driver_email || 'Fleet Driver');

        return `
            <div class="driver-item ${status === 'offline' ? 'offline' : ''} ${isLive ? 'pulse' : ''}" onclick="focusDriver('${driver.id}')" title="${vehicleInfo}">
                <div class="status-dot ${displayStatus}"></div>
                <div class="driver-info">
                    <div class="driver-name" style="font-weight: 700; color: var(--text-primary);">${displayName}</div>
                    <div class="driver-status-text ${displayStatus}" style="display: flex; align-items: center; gap: 6px;">
                        ${statusLabel}
                        ${isBackground ? '<span class="bg-indicator active" title="App Running in Background"></span>' : ''}
                    </div>
                    ${vehicleInfo ? `<div style="font-size:0.75em; color:var(--text-secondary); margin-top:3px; line-height: 1.2;"><i class="fas fa-truck-pickup" style="font-size:0.85em; color: var(--accent-blue);"></i> ${vehicleInfo}</div>` : ''}
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
        const lastSeen = d.lastSeen ? (d.lastSeen.toMillis ? d.lastSeen.toMillis() : (d.lastSeen.seconds ? d.lastSeen.seconds * 1000 : Number(d.lastSeen))) : 0;
        const lastUpdated = d.last_updated ? (d.last_updated.toMillis ? d.last_updated.toMillis() : (d.last_updated.seconds ? d.last_updated.seconds * 1000 : Number(d.last_updated))) : 0;
        const lastPulse = d.last_location_push || 0;
        
        const effectiveLastSeen = Math.max(lastSeen, lastUpdated, lastPulse);
        
        if (!isNaN(effectiveLastSeen) && effectiveLastSeen > 0 && (now - effectiveLastSeen) < tenMins) {
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
        driversMap.panTo(marker.getPosition());
        driversMap.setZoom(16);
        showQuickInfoPanel(driverId, allDriversData[driverId]);
    }
};

/**
 * Shows the Quick Info panel overlay on the map.
 * Populates all fields from live driver data + active schedule data.
 */
function showQuickInfoPanel(driverId, driver) {
    if (!driver) return;
    activeQuickInfoDriverId = driverId;

    const panel = document.getElementById('quickInfoPanel');
    if (!panel) return;

    // Name
    const email = driver.driver_email?.toLowerCase()?.trim() || '';
    const resolvedName = (driver.driver_name && !['Loading...', 'Loading Driver...', 'Fleet Driver'].includes(driver.driver_name))
        ? driver.driver_name
        : (driverDTRStatus[email]?.name || driver.driver_email || 'Fleet Driver');
    document.getElementById('qipName').textContent = resolvedName;

    // Vehicle
    const vehicle = driver.vehicle_assigned
        ? `${driver.vehicle_assigned}${driver.plate_number ? ' · ' + driver.plate_number : ''}`
        : 'No vehicle assigned';
    document.getElementById('qipVehicle').textContent = vehicle;

    // Status badge
    const rawStatus = driver.current_trip_phase || driver.current_status || 'available';
    const badge = document.getElementById('qipBadge');
    badge.textContent = rawStatus.replace(/_/g, ' ').toUpperCase();
    badge.className = `qip-badge ${rawStatus}`;

    // Speed
    const speedKmh = ((driver.current_speed || 0) * 3.6).toFixed(1);
    document.getElementById('qipSpeed').innerHTML = `${speedKmh} <small>km/h</small>`;

    // Odometer
    const odometer = driver.odometer_start !== undefined
        ? `${Number(driver.odometer_start).toFixed(1)} <small>km</small>`
        : '-- <small>km</small>';
    document.getElementById('qipOdometer').innerHTML = odometer;

    // Trip Phase (human readable)
    const phaseMap = {
        pending: 'Pending Dispatch',
        accepted: 'Job Accepted',
        moving_to_pickup: 'En Route to Pickup',
        picked_up: 'Passenger On Board',
        moving_to_dropoff: 'En Route to Dropoff',
        ready_to_complete: 'At Destination',
        return_pickup: 'Return Trip',
        completed: 'Trip Completed',
        available: 'Standby / Available',
        on_schedule: 'Scheduled',
    };
    document.getElementById('qipPhase').textContent = phaseMap[rawStatus] || rawStatus.replace(/_/g, ' ');

    // Passenger info
    const mission = activeSchedulesData[driverId];
    const passengerName = driver.passenger_name || driver.client_name || (mission ? '(see schedule)' : 'No active trip');
    document.getElementById('qipPassenger').textContent = passengerName;

    // Traffic indicator
    const spd = (driver.current_speed || 0) * 3.6;
    let trafficColor = '#94a3b8', trafficLabel = 'Stationary';
    if (spd >= 40)      { trafficColor = '#10b981'; trafficLabel = 'Moving freely (>40 km/h)'; }
    else if (spd >= 10) { trafficColor = '#f59e0b'; trafficLabel = 'Light traffic (10-40 km/h)'; }
    else if (spd > 0)   { trafficColor = '#ef4444'; trafficLabel = 'Heavy traffic (<10 km/h)'; }
    document.getElementById('qipTrafficDot').style.background = trafficColor;
    document.getElementById('qipTrafficLabel').textContent = trafficLabel;
    document.getElementById('qipTrafficLabel').style.color = trafficColor;

    // Last seen
    let lastSeenText = 'No signal';
    if (driver.last_updated) {
        const lastMs = driver.last_updated.toMillis
            ? driver.last_updated.toMillis()
            : (driver.last_updated.seconds ? driver.last_updated.seconds * 1000 : Number(driver.last_updated));
        const ageMins = Math.round((Date.now() - lastMs) / 60000);
        const timeStr = new Date(lastMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        lastSeenText = `Last seen ${timeStr} (${ageMins}m ago)`;
    }
    document.getElementById('qipLastSeen').textContent = lastSeenText;

    // ── Sidebar Sync ────────────────────────────────────────────────────────
    const sdPanel = document.getElementById('activeDriverDetails');
    if (sdPanel) {
        sdPanel.style.display = 'block';
        document.getElementById('sdName').textContent = resolvedName;
        document.getElementById('sdVehicle').textContent = vehicle;
        
        let locText = '--';
        if (driver.location_name) {
            locText = driver.location_name;
        } else if (driver.current_latitude && driver.current_longitude) {
            locText = `${Number(driver.current_latitude).toFixed(4)}, ${Number(driver.current_longitude).toFixed(4)}`;
        }
        document.getElementById('sdLocation').textContent = locText;
        
        const odoStart = driver.odometer_start !== undefined ? `${Number(driver.odometer_start).toFixed(1)} km` : '-- km';
        const odoEnd = driver.odometer_end !== undefined ? `${Number(driver.odometer_end).toFixed(1)} km` : '-- km';
        
        document.getElementById('sdOdoStart').textContent = odoStart;
        document.getElementById('sdOdoEnd').textContent = odoEnd;
    }
    // ────────────────────────────────────────────────────────────────────────

    // Re-center button
    const focusBtn = document.getElementById('qipFocusBtn');
    focusBtn.onclick = () => {
        const marker = driverMarkers[driverId];
        if (marker) {
            driversMap.panTo(marker.getPosition());
            driversMap.setZoom(17);
        }
    };

    // Phase E: Remote Command (Ping)
    let pingBtn = document.getElementById('qipPingBtn');
    if (!pingBtn) {
        pingBtn = document.createElement('button');
        pingBtn.id = 'qipPingBtn';
        pingBtn.className = 'qip-action-btn ping';
        pingBtn.style.background = '#6366f1';
        pingBtn.style.color = 'white';
        pingBtn.style.marginTop = '12px';
        pingBtn.style.width = '100%';
        pingBtn.style.borderRadius = '8px';
        pingBtn.style.padding = '8px';
        pingBtn.style.border = 'none';
        pingBtn.style.cursor = 'pointer';
        pingBtn.innerHTML = '<i class="fas fa-satellite"></i> PING DEVICE';
        document.querySelector('.qip-actions').appendChild(pingBtn);
    }
    
    pingBtn.onclick = async () => {
        pingBtn.disabled = true;
        pingBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> PINGING...';
        try {
            const driverRef = doc(db, "drivers", driverId);
            await updateDoc(driverRef, { command: 'ping' });
            setTimeout(() => {
                pingBtn.disabled = false;
                pingBtn.innerHTML = '<i class="fas fa-check"></i> PING SENT';
                setTimeout(() => { pingBtn.innerHTML = '<i class="fas fa-satellite"></i> PING DEVICE'; }, 2000);
            }, 1000);
        } catch (e) {
            console.error("Ping failed", e);
            pingBtn.disabled = false;
            pingBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> FAILED';
        }
    };

    // Phase E: Health Indicators
    let healthBox = document.getElementById('qipHealthBox');
    if (!healthBox) {
        healthBox = document.createElement('div');
        healthBox.id = 'qipHealthBox';
        healthBox.style.display = 'flex';
        healthBox.style.gap = '10px';
        healthBox.style.marginTop = '10px';
        healthBox.style.padding = '10px';
        healthBox.style.background = 'rgba(255,255,255,0.05)';
        healthBox.style.borderRadius = '8px';
        document.querySelector('.qip-body').insertBefore(healthBox, document.querySelector('.qip-traffic'));
    }

    const health = driver.device_health || {};
    const battery = health.battery || '--';
    const isCharging = health.is_charging ? '<i class="fas fa-bolt" style="color:#fbbf24; margin-left:4px;"></i>' : '';
    const network = health.network || 'Unknown';
    const netIcon = network.includes('WIFI') ? 'fa-wifi' : 'fa-signal';

    healthBox.innerHTML = `
        <div style="flex:1;">
            <small style="color:#94a3b8; display:block; font-size:10px;">BATTERY</small>
            <span style="font-weight:600; color:${battery < 20 ? '#ef4444' : '#fff'};">${battery}% ${isCharging}</span>
        </div>
        <div style="flex:1; border-left:1px solid rgba(255,255,255,0.1); padding-left:10px;">
            <small style="color:#94a3b8; display:block; font-size:10px;">NETWORK</small>
            <span style="font-weight:600; color:#fff;"><i class="fas ${netIcon}" style="font-size:10px; margin-right:4px;"></i> ${network}</span>
        </div>
    `;

    // Show panel (re-trigger animation)
    panel.classList.remove('active');
    void panel.offsetWidth; // reflow
    panel.classList.add('active');
}

function closeQuickInfoPanel() {
    activeQuickInfoDriverId = null;
    const panel = document.getElementById('quickInfoPanel');
    if (panel) panel.classList.remove('active');
}
window.closeQuickInfoPanel = closeQuickInfoPanel;


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
        const passengerName = data.passenger_name || data.client_name || 'Unknown Passenger';
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
                    <div style="font-size:0.75rem; color:var(--text-muted); margin-top:6px; display:flex; flex-direction:column; gap:2px;">
                        <div><i class="fas fa-id-card"></i> Driver: <strong>${driverName}</strong></div>
                        <div><i class="fas fa-user"></i> Passenger: <strong>${passengerName}</strong></div>
                        <div><i class="fas fa-clock"></i> Arrived: ${completedTime}</div>
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

/**
 * Checks if the 3:00 PM (15:00) cut-off for tomorrow's schedules has passed.
 * Returns true if the targetDate is tomorrow and current local time is >= 15:00.
 */
function isCutOffPassed(targetDate) {
    if (!targetDate) return false;
    
    // 1. Get tomorrow's date string (YYYY-MM-DD)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // 2. Check if the targetDate is tomorrow
    if (targetDate === tomorrowStr) {
        // 3. Get current local time (hours)
        const now = new Date();
        const currentHour = now.getHours();
        
        // 4. Return true if it's 3:00 PM (15) or later
        return currentHour >= 15;
    }
    
    return false;
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
        const targetDate = bookingData.pickup_date || "";

        // CUT-OFF RULE (3:00 PM for tomorrow)
        if (isCutOffPassed(targetDate)) {
            const role = currentUserData?.role || currentUserData?.user_type;
            if (role !== 'super_admin' && role !== 'admin') {
                alert(`⚠️ CUT-OFF PASSED: It is past 3:00 PM. You can no longer modify or dispatch schedules for tomorrow (${targetDate}). Please contact a Super Admin if this is urgent.`);
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = `<i class="fas fa-bolt"></i> Instant`;
                }
                return;
            } else {
                if (!confirm(`NOTICE: The 3:00 PM cut-off for tomorrow (${targetDate}) has passed. Do you want to OVERRIDE and proceed with this URGENT dispatch?`)) {
                    if (btn) {
                        btn.disabled = false;
                        btn.innerHTML = `<i class="fas fa-bolt"></i> Instant`;
                    }
                    return;
                }
            }
        }

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
            isOfficial: false, // Default is unofficial until posted
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

// --- PORTED BOOKING MODAL LOGIC (Start) ---
async function showAdminBookingModal() {
    let clients = [];
    try {
        const rolesSnap = await getDocs(query(collection(db, "users"), where("role", "==", "client")));
        const typesSnap = await getDocs(query(collection(db, "users"), where("user_type", "==", "client")));
        const seen = new Set();
        [...rolesSnap.docs, ...typesSnap.docs].forEach(d => {
            if (!seen.has(d.id)) {
                seen.add(d.id);
                clients.push({ id: d.id, ...d.data() });
            }
        });
        showCreateBookingModal(clients);
    } catch (error) {
        console.error("Error fetching clients:", error);
        showCreateBookingModal([]);
    }
}

async function showCreateBookingModal(clients) {
    const todayStr = new Date().toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(new Date().getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const content = `
        <div class="form-group">
            <label for="modal_passenger_name">Passenger Name</label>
            <input type="text" id="modal_passenger_name" class="form-input" placeholder="Enter full name..." required>
        </div>
        <div class="modal-form-row">
            <div class="form-group">
                <label for="modal_passenger_email">Passenger Email (Optional)</label>
                <input type="email" id="modal_passenger_email" class="form-input" placeholder="email@example.com">
            </div>
            <div class="form-group">
                <label for="modal_passenger_phone">Phone Number (Optional)</label>
                <input type="tel" id="modal_passenger_phone" class="form-input" placeholder="+63 9XX XXX XXXX">
            </div>
        </div>
        <div class="modal-form-row">
            <div class="form-group">
                <label for="modal_contractor">Contractor</label>
                <input type="text" id="modal_contractor" class="form-input" value="Jettsan" readonly>
            </div>
            <div class="form-group">
                <label for="modal_operating_area">Target Operating Area</label>
                <select id="modal_operating_area" class="form-input" required>
                    <option value="">-- Select Area --</option>
                    <option value="Metro Manila">Metro Manila – unrestricted</option>
                    <option value="South">South – up to Calamba / Banlic</option>
                    <option value="North">North – up to Clark / Mabalacat</option>
                </select>
            </div>
        </div>
        <div id="segments_container">
            <div class="segment-group" style="margin-bottom: 24px; padding: 16px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 8px;">
                <div style="font-size: 0.75rem; font-weight: 800; color: var(--accent-blue); margin-bottom: 12px; text-transform: uppercase;">Booking 1 (Primary)</div>
                <div class="form-group pickup-point" style="position: relative;">
                    <label>Pickup Location</label>
                    <input type="text" class="form-input pickup-input" placeholder="Search for pickup..." required autocomplete="off">
                    <input type="hidden" class="lat-input" value="0">
                    <input type="hidden" class="lng-input" value="0">
                </div>
                <div class="form-group dropoff-point" style="position: relative;">
                    <label>Dropoff Location</label>
                    <input type="text" class="form-input dropoff-input" placeholder="Search for dropoff..." required autocomplete="off">
                    <input type="hidden" class="drop-lat-input" value="0">
                    <input type="hidden" class="drop-lng-input" value="0">
                </div>
            </div>
        </div>
        <button type="button" id="add_segment" class="btn-secondary" style="margin-bottom: 20px; padding: 8px 16px; font-size: 0.85em;"><i class="fas fa-plus-circle"></i> Add Secondary Stop</button>
        <div class="modal-form-row">
            <div class="form-group">
                <label for="pickup_date">Pickup Date (Today/Tomorrow Only)</label>
                <input type="date" id="pickup_date" class="form-input" value="${todayStr}" min="${todayStr}" max="${tomorrowStr}" required>
            </div>
            <div class="form-group">
                <label for="pickup_time">Pickup Time</label>
                <input type="time" id="pickup_time" class="form-input" required>
            </div>
        </div>
        <div class="modal-form-row">
            <div class="form-group">
                <label for="passengers">Passengers (Pax)</label>
                <input type="number" id="passengers" class="form-input" value="1" min="1" required>
            </div>
            <div class="form-group" style="display: flex; align-items: center; padding-top: 25px;">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.9em;">
                    <input type="checkbox" id="return_to_pickup" style="width: auto;"> Return to Pickup
                </label>
            </div>
        </div>
        <div class="form-group">
            <label for="special_instructions">Special Instructions</label>
            <textarea id="special_instructions" class="form-input" rows="2" placeholder="e.g. Near main gate..."></textarea>
        </div>
        <div class="form-group" style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px; background: rgba(0, 212, 255, 0.05); padding: 12px; border-radius: 8px; border: 1px dashed var(--accent-blue);">
            <input type="checkbox" id="modal_is_official" style="width: auto;" checked>
            <label for="modal_is_official" style="margin: 0; cursor: pointer; color: var(--accent-blue); font-weight: 700;">Official Trip</label>
        </div>
        <div class="form-group">
            <label for="modal_driver">Assign Driver (Optional)</label>
            <select id="modal_driver" class="form-input"><option value="">-- No Driver Assigned --</option></select>
        </div>
        <div class="form-group" style="display: flex; align-items: center; gap: 10px; margin-top: 10px; background: rgba(16, 185, 129, 0.05); padding: 12px; border-radius: 8px; border: 1px dashed var(--accent-green);">
            <input type="checkbox" id="modal_auto_dispatch" style="width: auto;">
            <label for="modal_auto_dispatch" style="margin: 0; cursor: pointer; color: var(--accent-green); font-weight: 700;">Auto-Approve & Dispatch</label>
        </div>
    `;

    showModal('admin-booking-modal', 'New Client Booking', content, async () => {
        const clientName = document.getElementById('modal_passenger_name').value.trim();
        const clientEmail = document.getElementById('modal_passenger_email').value.trim();
        const clientPhone = document.getElementById('modal_passenger_phone').value.trim();
        if (!clientName) throw new Error("Please enter a passenger name.");

        const pickupDateInput = document.getElementById('pickup_date').value;
        const now = new Date();
        const tomorrow = new Date();
        tomorrow.setDate(now.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];
        const isAdmin = currentUserData?.role === 'admin' || currentUserData?.role === 'super_admin';

        if (pickupDateInput === tomorrowStr && now.getHours() >= 15) {
            if (isAdmin) {
                if (!confirm("NOTICE: 3:00 PM cutoff passed for tomorrow. Proceed?")) return;
            } else {
                throw new Error("Cut-off Reached: Next-day schedules must be requested before 3:00 PM.");
            }
        }

        const segments = Array.from(document.querySelectorAll('.segment-group')).map((el, i) => ({
            pickup: el.querySelector('.pickup-input').value,
            pickup_latitude: parseFloat(el.querySelector('.lat-input').value) || 0,
            pickup_longitude: parseFloat(el.querySelector('.lng-input').value) || 0,
            dropoff: el.querySelector('.dropoff-input').value,
            dropoff_latitude: parseFloat(el.querySelector('.drop-lat-input').value) || 0,
            dropoff_longitude: parseFloat(el.querySelector('.drop-lng-input').value) || 0,
            order: i + 1
        }));
        if (segments.some(s => !s.pickup || !s.dropoff)) throw new Error("Fill all pickup/dropoff locations.");

        const bookingId = generateNumericId().toString();
        const date = document.getElementById('pickup_date').value;
        const time = document.getElementById('pickup_time').value;
        const driverId = document.getElementById('modal_driver').value;
        const autoDispatch = document.getElementById('modal_auto_dispatch').checked;
        const isOfficial = document.getElementById('modal_is_official').checked;

        const data = sanitizeFirestoreData({
            booking_id: bookingId,
            numeric_booking_id: parseInt(bookingId),
            client_id: 'guest',
            client_name: clientName,
            client_email: clientEmail,
            client_phone: clientPhone,
            contractor: 'Jettsan',
            operating_area: document.getElementById('modal_operating_area').value,
            isOfficial: isOfficial,
            segments: segments,
            pickup_location: segments[0].pickup,
            pickup_latitude: segments[0].pickup_latitude,
            pickup_longitude: segments[0].pickup_longitude,
            dropoff_location: segments[segments.length - 1].dropoff,
            dropoff_latitude: segments[segments.length - 1].dropoff_latitude,
            dropoff_longitude: segments[segments.length - 1].dropoff_longitude,
            pickup_date: date,
            pickup_time: time,
            passengers: parseInt(document.getElementById('passengers').value) || 1,
            return_to_pickup: document.getElementById('return_to_pickup').checked,
            special_instructions: document.getElementById('special_instructions').value || '',
            driver_id: driverId || null,
            status: autoDispatch ? 'scheduled' : 'pending',
            createdBy: 'admin',
            created_at: serverTimestamp(),
            updated_at: serverTimestamp()
        });

        await setDoc(doc(db, "bookings", bookingId), data);

        if (autoDispatch && driverId) {
            const driverSelect = document.getElementById('modal_driver');
            const driverName = driverSelect.options[driverSelect.selectedIndex].text.replace('🟢 ', '').replace('⚪ ', '');
            const driverDoc = await getDoc(doc(db, "drivers", driverId));
            const dData = driverDoc.exists() ? driverDoc.data() : {};
            
            const scheduleData = sanitizeFirestoreData({
                booking_id: bookingId,
                numeric_booking_id: parseInt(bookingId), 
                schedule_id: generateNumericId(),
                driver_id: driverId,
                driver_email: (dData.driver_email || "").toLowerCase().trim(),
                driver_name: driverName,
                trip_phase: "pending",
                status: "pending",
                segments: segments,
                current_segment_index: 0,
                pickup_location: segments[0].pickup,
                dropoff_location: segments[segments.length - 1].dropoff,
                schedule_date: date,
                schedule_time: time,
                isOfficial: isOfficial,
                created_at: serverTimestamp(),
                updated_at: serverTimestamp()
            });

            await addDoc(collection(db, "schedules"), scheduleData);
            await updateDoc(doc(db, "drivers", driverId), {
                current_status: "on_schedule"
            });
        }
        alert("Booking created successfully!");
    });

    setTimeout(async () => {
        const addSegmentBtn = document.getElementById('add_segment');
        const container = document.getElementById('segments_container');
        let segmentCount = 1;
        if (addSegmentBtn && container) {
            addSegmentBtn.onclick = () => {
                segmentCount++;
                const div = document.createElement('div');
                div.className = 'segment-group';
                div.style.cssText = 'margin-bottom: 24px; padding: 16px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 8px; position: relative;';
                div.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <div style="font-size:0.75rem; font-weight:800; color:var(--accent-blue); text-transform:uppercase;">Booking ${segmentCount}</div>
                        <button type="button" class="btn-icon remove-segment" style="color:var(--accent-error);"><i class="fas fa-trash"></i></button>
                    </div>
                    <div class="form-group"><input type="text" class="form-input pickup-input" placeholder="Pickup..." required autocomplete="off"><input type="hidden" class="lat-input" value="0"><input type="hidden" class="lng-input" value="0"></div>
                    <div class="form-group"><input type="text" class="form-input dropoff-input" placeholder="Dropoff..." required autocomplete="off"><input type="hidden" class="drop-lat-input" value="0"><input type="hidden" class="drop-lng-input" value="0"></div>
                `;
                container.appendChild(div);
                if (window.initAutocompleteForInput) {
                    div.querySelectorAll('input[type="text"]').forEach(input => window.initAutocompleteForInput(input));
                }
                div.querySelector('.remove-segment').onclick = () => div.remove();
            };
        }

        const driverSelect = document.getElementById('modal_driver');
        if (driverSelect) {
            const driversSnap = await getDocs(query(collection(db, "drivers"), where("current_status", "==", "available")));
            let html = '<option value="">-- No Driver Assigned --</option>';
            driversSnap.docs.forEach(d => {
                const data = d.data();
                html += `<option value="${d.id}">${data.driver_name}</option>`;
            });
            driverSelect.innerHTML = html;
        }
        
        if (window.initAutocompleteForInput) {
            document.querySelectorAll('.pickup-input, .dropoff-input').forEach(input => window.initAutocompleteForInput(input));
        }
    }, 100);
}
// --- PORTED BOOKING MODAL LOGIC (End) ---
