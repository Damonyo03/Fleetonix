import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot, doc, getDoc, updateDoc, deleteDoc, orderBy, getDocs, setDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { initLayout, showModal, hideModal } from "./modules/ui.js";
import { sanitizeFirestoreData, generateNumericId } from "./modules/data.js";

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// Tracking listeners for modals
let activeModalListeners = [];
function clearModalListeners() {
    activeModalListeners.forEach(unsub => unsub());
    activeModalListeners = [];
}

function updateDriverDropdown(selectEl, drivers, locations, isAssignModal = false) {
    if (!selectEl) return;
    
    const locationMap = {};
    locations.forEach(doc => {
        locationMap[(doc.data().driver_email || "").toLowerCase().trim()] = doc.data();
    });

    const driverMap = new Map();
    const now = Date.now();
    const tenMins = 10 * 60 * 1000;

    drivers.forEach(dDoc => {
        const data = dDoc.data();
        const email = (data.driver_email || "").toLowerCase().trim();
        if (!email || driverMap.has(email)) return;

        const loc = locationMap[email];
        let isOnline = false;
        if (loc && loc.last_updated) {
            const lastActive = loc.last_updated.toMillis ? loc.last_updated.toMillis() : (loc.last_updated.seconds * 1000);
            if (now - lastActive < tenMins) isOnline = true;
        }

        driverMap.set(email, {
            id: dDoc.id,
            ...data,
            isOnline: isOnline
        });
    });

    const sortedDrivers = Array.from(driverMap.values()).sort((a, b) => {
        if (a.isOnline === b.isOnline) {
            const nameA = a.driver_name || "";
            const nameB = b.driver_name || "";
            return nameA.localeCompare(nameB);
        }
        return a.isOnline ? -1 : 1;
    });

    const currentVal = selectEl.value;
    if (sortedDrivers.length > 0) {
        selectEl.innerHTML = '<option value="">-- Select Driver --</option>' + 
            sortedDrivers.map(d => `
                <option value="${d.id}" ${d.id === currentVal ? 'selected' : ''}
                    data-email="${d.driver_email || ''}" 
                    data-name="${d.driver_name || ''}"
                    data-image="${d.profile_image_url || ''}"
                    data-details="${d.car_details || ''}"
                    data-color="${d.car_color || ''}"
                    data-vehicle="${d.vehicle_assigned || ''}">
                    ${d.isOnline ? '🟢 [ONLINE]' : '⚪ [OFFLINE]'} ${d.driver_name} ${isAssignModal ? `- ${d.vehicle_assigned} (${d.plate_number})` : ''}
                </option>`).join('');
    } else {
        selectEl.innerHTML = '<option value="">No drivers found</option>';
    }
}


const bookingTableBody = document.getElementById('bookingTableBody');
const statusFilter = document.getElementById('statusFilter');
const newAdminBookingBtn = document.getElementById('newAdminBookingBtn');

let allBookings = [];

// Phase 5: Geographic Sector Groups
const SECTORS = {
    NORTH: [
        'New Clark City', 'Clark International Airport', 'Clark', 'Angeles', 'San Fernando', 'Apalit', 
        'Calumpit', 'Malolos', 'Guiguinto', 'Balagtas', 'Bocaue', 'Marilao', 'Meycauayan',
        'Pampanga', 'Bulacan', 'Tarlac', 'Pangasinan', 'Zambales', 'Bataan', 'Nueva Ecija'
    ],
    NCR: [
        'West Valenzuela', 'Valenzuela', 'Caloocan', 'Solis', 'Tutuban', 'Blumentritt', 'Espana', 'Santa Mesa', 
        'Paco', 'Buendia', 'EDSA', 'Senate-DepEd', 'FTI', 'Bicutan', 'Sucat',
        'Manila', 'Makati', 'Pasay', 'Taguig', 'Parañaque', 'Quezon City', 'Las Piñas', 'Muntinlupa'
    ],
    SOUTH: [
        'Alabang', 'Muntinlupa', 'San Pedro', 'Pacita', 'Biñan', 'Santa Rosa', 'Cabuyao', 'Banlic', 'Calamba',
        'Laguna', 'Batangas', 'Cavite', 'Rizal', 'Quezon', 'Mindoro', 'Camarines', 'Albay', 'Sorsogon'
    ]
};

/**
 * Automagically detects the operating area based on address keywords and coordinates.
 */
function detectArea(address, city, province, lat) {
    const fullText = (address + " " + city + " " + province).toLowerCase();
    
    // 1. Keyword Check
    if (SECTORS.NORTH.some(k => fullText.includes(k.toLowerCase()))) return "North";
    if (SECTORS.SOUTH.some(k => fullText.includes(k.toLowerCase()))) return "South";
    if (SECTORS.NCR.some(k => fullText.includes(k.toLowerCase()))) return "NCR";

    // 2. Latitude Check (Fallback for missing keywords)
    if (lat > 14.8) return "North";
    if (lat > 0 && lat < 14.3) return "South";

    // 3. Default to NCR
    return "NCR";
}

// Attach the button right away (don't wait for auth)
if (newAdminBookingBtn) {
    newAdminBookingBtn.addEventListener('click', () => {
        showAdminBookingModal();
    });
}

let currentUserData = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        if (!window.location.pathname.includes('login.html')) {
            window.location.href = '../login.html';
        }
        return;
    }

    const userDoc = await getDoc(doc(db, "users", user.uid));
    let userData = userDoc.exists() ? userDoc.data() : null;

    if (!userData) {
        const q = query(collection(db, "users"), where("email", "==", user.email));
        const snap = await getDocs(q);
        if (!snap.empty) {
            userData = snap.docs[0].data();
        }
    }

    const adminRoles = ['admin', 'super_admin'];
    const role = userData?.user_type || userData?.role;

    if (!userData || !adminRoles.includes(role)) {
        console.error("Access Denied: Not an administrator.");
        window.location.href = '../login.html?error=unauthorized';
        return;
    }

    currentUserData = userData;
    const name = userData.full_name || user.email.split('@')[0];
    
    // Only set layout title to 'Bookings' if we are on the bookings page
    if (window.location.pathname.includes('bookings.html')) {
        initLayout('Bookings', name, 0, role);
        initBookingList();

        // Handle dashboard triggers
        const trigger = urlParams.get('trigger');
        if (trigger === 'new-booking') {
            setTimeout(() => {
                showAdminBookingModal();
            }, 500);
        }
    }
});

// --- Admin Booking Modal ---
async function showAdminBookingModal() {
    // Try fetching clients by both `role` and `user_type` fields to handle schema differences
    let clients = [];
    try {
        // Query both fields for maximal compatibility during migration
        const rolesSnap = await getDocs(query(collection(db, "users"), where("role", "==", "client")));
        const typesSnap = await getDocs(query(collection(db, "users"), where("user_type", "==", "client")));
        
        const seen = new Set();
        [...rolesSnap.docs, ...typesSnap.docs].forEach(d => {
            if (!seen.has(d.id)) {
                seen.add(d.id);
                clients.push({ id: d.id, ...d.data() });
            }
        });

        // Show the UI with the fetched clients
        showCreateBookingModal(clients);
    } catch (error) {
        console.error("Error fetching clients:", error);
        // Still show the modal even if clients fail to load
        showCreateBookingModal([]);
    }
}

async function showCreateBookingModal(clients) {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(new Date().getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const content = `
        <div class="form-group">
            <label for="modal_passenger_name">Passenger Name</label>
            <input type="text" id="modal_passenger_name" class="form-control" placeholder="Enter full name..." required>
        </div>
        
        <div class="modal-form-row">
            <div class="form-group">
                <label for="modal_passenger_email">Passenger Email (Optional)</label>
                <input type="email" id="modal_passenger_email" class="form-control" placeholder="email@example.com">
            </div>
            <div class="form-group">
                <label for="modal_passenger_phone">Phone Number (Optional)</label>
                <input type="tel" id="modal_passenger_phone" class="form-control" placeholder="+63 9XX XXX XXXX">
            </div>
        </div>

        <div class="modal-form-row">
            <div class="form-group">
                <label for="modal_contractor">Contractor</label>
                <input type="text" id="modal_contractor" class="form-control" value="Jettsan" readonly>
            </div>
            <div class="form-group">
                <!-- Operating Area Removed per Core Stability Refactor -->
            </div>
        </div>

        <!-- Single Pickup & Dropoff -->
        <div class="form-group pickup-point" style="position: relative;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <label>Pickup Location</label>
                <div id="area_indicator" style="font-size: 0.75em; font-weight: 700; padding: 2px 8px; border-radius: 4px; display: none;"></div>
            </div>
            <input type="text" id="modal_pickup" class="form-control pickup-input" placeholder="Search for pickup..." required autocomplete="off">
            <input type="hidden" id="modal_lat" class="lat-input" value="0">
            <input type="hidden" id="modal_lng" class="lng-input" value="0">
        </div>
        <div class="form-group dropoff-point" style="position: relative;">
            <label>Dropoff Location</label>
            <input type="text" id="modal_dropoff" class="form-control dropoff-input" placeholder="Search for dropoff..." required autocomplete="off">
            <input type="hidden" id="modal_drop_lat" class="drop-lat-input" value="0">
            <input type="hidden" id="modal_drop_lng" class="drop-lng-input" value="0">
        </div>

        <div class="modal-form-row">
            <div class="form-group">
                <label for="pickup_date">Pickup Date (Today/Tomorrow Only)</label>
                <input type="date" id="pickup_date" class="form-control" value="${today}" min="${today}" max="${tomorrowStr}" required>
            </div>
            <div class="form-group">
                <label for="pickup_time">Start Time</label>
                <input type="time" id="pickup_time" class="form-control" required>
            </div>
        </div>

        <div class="modal-form-row">
            <div class="form-group">
                <label for="passengers">Passengers (Pax)</label>
                <input type="number" id="passengers" class="form-control" value="1" min="1" required>
            </div>
            <div class="form-group">
                <label for="modal_trip_purpose">Purpose of Trip</label>
                <select id="modal_trip_purpose" class="form-select" required>
                    <option value="">-- Select Purpose --</option>
                    <option value="Commute- Pro A">Commute- Pro A (Shuttle Service)</option>
                    <option value="OB- Fieldwork">OB- Fieldwork (Construction Site)</option>
                    <option value="Document">Document (Office Delivery)</option>
                    <option value="Standby">Standby (Relief/Backup)</option>
                    <option value="Others- Dinner">Others- Dinner (Team Eat Out)</option>
                    <option value="Others- Golf">Others- Golf (Unofficial Activity)</option>
                </select>
            </div>
        </div>


        <div class="form-group">
            <label for="special_instructions">Special Instructions (Optional)</label>
            <textarea id="special_instructions" class="form-control" rows="2" placeholder="e.g. Near the main gate..."></textarea>
        </div>

        <div class="form-group" style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px; background: rgba(0, 212, 255, 0.05); padding: 12px; border-radius: 8px; border: 1px dashed var(--accent-blue);">
            <input type="checkbox" id="modal_is_official" style="width: auto;" checked>
            <label for="modal_is_official" style="margin: 0; cursor: pointer; color: var(--accent-blue); font-weight: 700;">Official Trip (NSCRP Requirement)</label>
        </div>

        <div class="form-group">
            <label for="modal_driver">Assign Driver</label>
            <select id="modal_driver" class="form-select">
                <option value="">-- No Driver Assigned --</option>
            </select>
            <small style="color: var(--text-muted); font-size: 0.8em; margin-top: 4px; display: block;">Only available drivers are shown here.</small>
        </div>

        <div class="form-group" style="display: flex; align-items: center; gap: 10px; margin-top: 10px; background: rgba(16, 185, 129, 0.05); padding: 12px; border-radius: 8px; border: 1px dashed var(--accent-green);">
            <input type="checkbox" id="modal_auto_dispatch" style="width: auto;">
            <label for="modal_auto_dispatch" style="margin: 0; cursor: pointer; color: var(--accent-green); font-weight: 700;">Auto-Approve & Send to Dispatch</label>
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

        // 3:00 PM Cutoff Check (Only for Tomorrow)
        if (pickupDateInput === tomorrowStr && now.getHours() >= 15) {
            if (isAdmin) {
                const confirmOverride = confirm("NOTICE: The 3:00 PM cutoff for tomorrow's schedules has passed. Proceed with this emergency entry?");
                if (!confirmOverride) {
                    const sb = document.querySelector('.save-modal');
                    if (sb) { sb.disabled = false; sb.innerText = 'Save Booking'; }
                    return;
                }
            } else {
                alert("Cut-off Reached: Next-day schedules must be requested before 3:00 PM.");
                const sb = document.querySelector('.save-modal');
                if (sb) { sb.disabled = false; sb.innerText = 'Save Booking'; }
                return;
            }
        }

        const pickup = document.getElementById('modal_pickup').value;
        const pickup_lat = parseFloat(document.getElementById('modal_lat').value) || 0;
        const pickup_lng = parseFloat(document.getElementById('modal_lng').value) || 0;
        const dropoff = document.getElementById('modal_dropoff').value;
        const drop_lat = parseFloat(document.getElementById('modal_drop_lat').value) || 0;
        const drop_lng = parseFloat(document.getElementById('modal_drop_lng').value) || 0;

        if (!pickup || !dropoff) throw new Error("Please fill in both pickup and dropoff locations.");

        const bookingId = generateNumericId().toString();
        const date = document.getElementById('pickup_date').value;
        const time = document.getElementById('pickup_time').value;

        // Admin Control: Allow historical data entry if needed, but keeping the cutoff warning for future dates
        if (date && time) {
            const selectedDT = new Date(`${date}T${time}`);
            // No longer throwing error for past dates to allow historical record entry
        }

        const driverId = document.getElementById('modal_driver').value;
        const autoDispatch = document.getElementById('modal_auto_dispatch').checked;
        const isOfficial = document.getElementById('modal_is_official').checked;
        const tripPurpose = document.getElementById('modal_trip_purpose').value;

        if (!tripPurpose) throw new Error("Please select a Purpose of Trip.");

        // Auto-Area Detection Logic (Phase 5 Alignment)
        const pickupEl = document.getElementById('modal_pickup');
        const cityName = pickupEl.dataset.city || "";
        const provinceName = pickupEl.dataset.province || "";
        const detectedArea = detectArea(pickup, cityName, provinceName, pickup_lat);

        const data = sanitizeFirestoreData({
            booking_id: bookingId,
            numeric_booking_id: parseInt(bookingId),
            client_id: 'guest',
            client_name: clientName,
            client_email: clientEmail,
            client_phone: clientPhone,
            contractor: 'Jettsan',
            operating_area: detectedArea,
            isOfficial: isOfficial,
            is_published: false, // Core Stability Refactor: Start as Draft

            pickup_location: pickup,
            pickup_latitude: pickup_lat,
            pickup_longitude: pickup_lng,
            dropoff_location: dropoff,
            dropoff_latitude: drop_lat,
            dropoff_longitude: drop_lng,

            pickup_date: date,
            pickup_time: time,
            passengers: parseInt(document.getElementById('passengers').value) || 1,
            trip_purpose: tripPurpose,
            special_instructions: document.getElementById('special_instructions').value || '',

            driver_id: driverId || null,
            status: (autoDispatch && !driverId) ? 'draft' : (autoDispatch ? 'scheduled' : 'pending'),
            createdBy: 'admin',
            created_at: serverTimestamp(),
            updated_at: serverTimestamp()
        });

        // 1. Save Booking
        await setDoc(doc(db, "bookings", bookingId), data);

        // 2. Schedule Creation (if dispatched)
        if (autoDispatch && driverId) {
            const driverSelect = document.getElementById('modal_driver');
            const driverOption = driverSelect.options[driverSelect.selectedIndex];
            const driverName = driverOption.getAttribute('data-name') || driverOption.text.replace('🟢 ', '').replace('⚪ ', '').replace('[ONLINE] ', '').replace('[OFFLINE] ', '').trim();

            
            const driverDoc = await getDoc(doc(db, "drivers", driverId));
            const dData = driverDoc.exists() ? driverDoc.data() : {};
            const driverEmail = dData.driver_email || "";

            const scheduleData = sanitizeFirestoreData({
                booking_id: bookingId,
                numeric_booking_id: parseInt(bookingId), 
                schedule_id: generateNumericId(),
                client_id: 'guest',
                client_name: clientName,
                driver_id: driverId || "",
                driver_uid: (driverId === "undefined" || !driverId) ? "" : driverId,
                driver_email: driverEmail.toLowerCase().trim(),
                driver_name: driverName,
                driver_image_url: dData.profile_image_url || "",
                car_details: dData.car_details || "",
                car_color: dData.car_color || "",
                trip_phase: "pending",
                status: "pending",
                pickup_location: pickup,
                pickup_latitude: pickup_lat,
                pickup_longitude: pickup_lng,
                dropoff_location: dropoff,
                dropoff_latitude: drop_lat,
                dropoff_longitude: drop_lng,
                schedule_date: date,
                schedule_time: time,
                passengers: parseInt(document.getElementById('passengers').value) || 1,
                trip_purpose: tripPurpose,
                special_instructions: document.getElementById('special_instructions').value || '',
                operating_area: detectedArea,
                isOfficial: isOfficial,
                is_published: false, // Core Stability Refactor: Start as Draft
                created_at: serverTimestamp(),
                updated_at: serverTimestamp()
            });

            await addDoc(collection(db, "schedules"), scheduleData);

            // Update driver trip metadata (Status remains 'available' until driver accepts)
            await updateDoc(doc(db, "drivers", driverId), {
                current_trip_id: bookingId,
                current_trip_phase: "pending",
                updated_at: serverTimestamp()
            });

            // 3. Notification (Minimized)
            await addDoc(collection(db, "notifications"), {
                user_id: 'guest',
                title: 'Driver Assigned',
                message: `Driver ${driverName} has been assigned to your booking #${bookingId}.`,
                type: 'assignment',
                is_read: false,
                booking_id: bookingId,
                timestamp: serverTimestamp()
            });
            
            // 4. Notification to DRIVER specifically (for Android popup)
            await addDoc(collection(db, "notifications"), {
                user_id: driverId,
                title: 'New Trip Assignment',
                message: `You have been assigned to trip #${bookingId}. Please check My Assignments.`,
                type: 'assignment',
                is_read: false,
                booking_id: bookingId,
                timestamp: serverTimestamp()
            });
        }
        
        // Log Activity
        await addDoc(collection(db, "activity"), {
            type: 'system',
            title: 'New Booking Created',
            message: `Admin created a booking for ${clientName} (ID: ${bookingId})`,
            timestamp: serverTimestamp()
        });

        alert("Booking created successfully! " + (autoDispatch ? "It has been sent to dispatch." : "It is now pending approval."));
        hideModal('admin-booking-modal');
    });

    // Handle Unsubscribes when modal closes
    const cleanup = () => {
        clearModalListeners();
    };
    
    // UI components are injected after showModal, so we wait a bit or use event delegation
    setTimeout(() => {
        const modal = document.querySelector('.modal-backdrop');
        if (modal) {
            modal.querySelector('.close-modal').addEventListener('click', cleanup);
            modal.querySelector('.cancel-modal').addEventListener('click', cleanup);
        }
    }, 100);
    
    // ── Populate Drivers List REAL-TIME ─────────
    setTimeout(() => {
        const driverSelect = document.getElementById('modal_driver');
        if (!driverSelect) return;

        // Start listeners
        const unsubDrivers = onSnapshot(collection(db, "drivers"), (driversSnap) => {
            getDocs(collection(db, "driver_locations")).then(locsSnap => {
                updateDriverDropdown(driverSelect, driversSnap.docs, locsSnap.docs);
            });
        });

        const unsubLocs = onSnapshot(collection(db, "driver_locations"), (locsSnap) => {
            getDocs(collection(db, "drivers")).then(driversSnap => {
                updateDriverDropdown(driverSelect, driversSnap.docs, locsSnap.docs);
            });
        });

        activeModalListeners.push(unsubDrivers, unsubLocs);
    }, 100);


    // ── ALWAYS Initialize Autocompletes ───────────────────
    setTimeout(() => {
        if (window.initAutocompleteForInput) {
            const pickupEl = document.getElementById('modal_pickup');
            const dropoffEl = document.getElementById('modal_dropoff');
            if (pickupEl) {
                window.initAutocompleteForInput(pickupEl);
                
                // Real-time Area Detection Listener
                pickupEl.addEventListener('change', () => {
                    const indicator = document.getElementById('area_indicator');
                    if (!indicator) return;

                    const address = pickupEl.value;
                    const city = pickupEl.dataset.city || "";
                    const province = pickupEl.dataset.province || "";
                    const lat = parseFloat(document.getElementById('modal_lat').value) || 0;

                    const area = detectArea(address, city, province, lat);
                    
                    indicator.textContent = area.toUpperCase();
                    indicator.style.display = 'block';
                    
                    // Style based on area
                    if (area === 'North') {
                        indicator.style.background = 'rgba(0, 212, 255, 0.2)';
                        indicator.style.color = 'var(--accent-blue)';
                    } else if (area === 'South') {
                        indicator.style.background = 'rgba(255, 179, 71, 0.2)';
                        indicator.style.color = 'var(--accent-orange)';
                    } else {
                        indicator.style.background = 'rgba(148, 163, 184, 0.2)';
                        indicator.style.color = 'var(--text-muted)';
                    }
                });
            }
            if (dropoffEl) window.initAutocompleteForInput(dropoffEl);
        }
    }, 200);
}

// --- Booking List ---
function initBookingList() {
    const role = currentUserData.role || currentUserData.user_type;
    const companyId = currentUserData.accredited_company_id;

    let q = collection(db, "bookings");

    // RBAC Filtering
    q = query(collection(db, "bookings"), orderBy("created_at", "desc"));

    onSnapshot(q, (snapshot) => {
        allBookings = snapshot.docs;
        applyFilters();
    });

    if (statusFilter) statusFilter.addEventListener('change', applyFilters);
}

function applyFilters() {
    if (!bookingTableBody || !statusFilter) return;
    const filterValue = statusFilter.value;
    const filtered = allBookings.filter(d => {
        const b = d.data();
        const matchStatus = filterValue === 'all' || b.status === filterValue;
        return matchStatus;
    });
    renderBookings(filtered);
}

function renderBookings(docs) {
    if (!bookingTableBody) return;
    if (docs.length === 0) {
        bookingTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">No bookings found.</td></tr>';
        return;
    }

    bookingTableBody.innerHTML = docs.map(d => {
        const booking = d.data();
        const id = d.id;
        const statusClass = booking.status || 'pending';
        const displayName = booking.passenger_name || booking.client_name || 'N/A';
        const areaLabel = booking.operating_area === 'North' ? '<span class="badge badge-info"><i class="fas fa-arrow-up"></i> North</span>' : 
                          booking.operating_area === 'South' ? '<span class="badge badge-warning"><i class="fas fa-arrow-down"></i> South</span>' : 
                          '<span class="badge badge-secondary">NCR</span>';
        
        return `
            <tr>
                <td>${displayName}</td>
                <td>${areaLabel}</td>
                <td title="${booking.pickup_location || ''}">${(booking.pickup_location || 'N/A').length > 35 ? (booking.pickup_location || '').substring(0,35)+'...' : (booking.pickup_location || 'N/A')}</td>
                <td title="${booking.dropoff_location || ''}">${(booking.dropoff_location || 'N/A').length > 35 ? (booking.dropoff_location || '').substring(0,35)+'...' : (booking.dropoff_location || 'N/A')}</td>
                <td>${booking.pickup_date || 'N/A'} ${booking.pickup_time || ''}</td>
                <td><span class="status-badge ${statusClass}">${
                    statusClass === 'pending' ? 'Pending Review' : 
                    statusClass === 'scheduled' ? 'Schedule Sent' : 
                    statusClass === 'draft' ? 'Draft / Need Driver' : 
                    statusClass
                }</span></td>
                <td class="table-actions">
                    <button class="btn-icon view" title="View Details" onclick="window.viewBookingDetails('${id}')"><i class="fas fa-eye"></i></button>
                    ${booking.status === 'pending' ? `<button class="btn-icon approve" title="Assign Driver" onclick="window.assignDriver('${id}')"><i class="fas fa-user-check"></i></button>` : ''}
                    ${booking.status === 'draft' ? `<button class="btn-icon edit" title="Finalize Dispatch" onclick="window.finalizeDraft('${id}')" style="background: rgba(255, 179, 71, 0.1); color: #FFB347;"><i class="fas fa-edit"></i></button>` : ''}
                    <button class="btn-icon delete" title="Delete" onclick="window.deleteBooking('${id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

window.viewBookingDetails = async (id) => {
    const bookingDoc = await getDoc(doc(db, "bookings", id));
    if (!bookingDoc.exists()) { alert("Booking not found."); return; }
    const b = bookingDoc.data();
    showModal('view-booking-modal', `Booking #${id}`, `
        <div style="display:grid; gap:10px;">
            <div><strong>Passenger:</strong> ${b.passenger_name || b.client_name || 'N/A'}</div>
            ${b.passenger_email ? `<div><strong>Email:</strong> ${b.passenger_email}</div>` : ''}
            ${b.passenger_phone ? `<div><strong>Phone:</strong> ${b.passenger_phone}</div>` : ''}
            <div><strong>Contractor:</strong> ${b.client_name || 'Jettsan'}</div>
            <div><strong>Date/Time:</strong> ${b.pickup_date || ''} ${b.pickup_time || ''}</div>
            <div><strong>Pax:</strong> ${b.pax || b.passengers || 1}</div>
            <div><strong>Status:</strong> <span class="status-badge ${b.status}">${b.status}</span></div>
            <div><strong>Purpose:</strong> <span style="color:var(--accent-blue); font-weight:700;">${b.trip_purpose || 'Not Specified'}</span></div>
            <div><strong>Notes:</strong> ${b.special_instructions || '-'}</div>
        </div>
    `, async () => { /* read-only */ });
    
    setTimeout(() => {
        const saveBtn = document.querySelector('.save-modal');
        if (saveBtn) { saveBtn.textContent = 'Close'; saveBtn.classList.replace('btn-primary', 'btn-secondary'); }
    }, 50);
};

window.assignDriver = async (id) => {
    const bookingDoc = await getDoc(doc(db, "bookings", id));
    if (!bookingDoc.exists()) return;
    const booking = bookingDoc.data();

    const [driversSnap, locationsSnap] = await Promise.all([
        getDocs(query(collection(db, "drivers"), where("current_status", "==", "available"))),
        getDocs(collection(db, "driver_locations"))
    ]);

    const locationMap = {};
    locationsSnap.docs.forEach(doc => {
        locationMap[doc.id.toLowerCase().trim()] = doc.data();
    });

    const driverMap = new Map();
    const now = Date.now();
    const tenMins = 10 * 60 * 1000;

    driversSnap.docs.forEach(dDoc => {
        const data = dDoc.data();
        const email = (data.driver_email || "").toLowerCase().trim();
        if (!email || driverMap.has(email)) return;

        const loc = locationMap[email];
        let isOnline = false;
        if (loc && loc.last_updated) {
            const lastActive = loc.last_updated.toMillis ? loc.last_updated.toMillis() : (loc.last_updated.seconds * 1000);
            if (now - lastActive < tenMins) isOnline = true;
        }

        driverMap.set(email, {
            id: dDoc.id,
            ...data,
            isOnline: isOnline
        });
    });

    const processedDrivers = Array.from(driverMap.values()).sort((a, b) => {
        if (a.isOnline === b.isOnline) return a.driver_name.localeCompare(b.driver_name);
        return a.isOnline ? -1 : 1;
    });

    const content = `
        <div class="form-group">
            <label>Select Driver</label>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 10px;">
                <i class="fas fa-info-circle"></i> Online drivers have updated their location in the last 10 minutes.
            </p>
            <select id="modal_driver" class="form-select" required>
                <option value="">-- Choose a Driver --</option>
                ${processedDrivers.map(d => `
                    <option value="${d.id}" 
                            data-email="${d.driver_email || ''}" 
                            data-name="${d.driver_name || ''}"
                            data-image="${d.profile_image_url || ''}"
                            data-details="${d.car_details || ''}"
                            data-color="${d.car_color || ''}"
                            data-vehicle="${d.vehicle_assigned || ''}">
                        ${d.isOnline ? '🟢 [ONLINE]' : '⚪ [OFFLINE]'} ${d.driver_name} - ${d.vehicle_assigned} (${d.plate_number})
                    </option>`).join('')}
            </select>
        </div>
        <div class="form-group">
            <label>Schedule Date</label>
            <input type="date" id="modal_sched_date" class="form-control" value="${booking.pickup_date || ''}" required>
        </div>
        <div class="form-group">
            <label>Start Time</label>
            <input type="time" id="modal_sched_time" class="form-control" value="${booking.pickup_time || ''}" required>
        </div>
    `;

    showModal('assign-modal', 'Assign Driver to Booking', content, async () => {
        const driverSelect = document.getElementById('modal_driver');
        const selectedOption = driverSelect.options[driverSelect.selectedIndex];
        if (!selectedOption.value) throw new Error("Please select a driver.");

        const driverId = selectedOption.value;
        const driverEmail = selectedOption.getAttribute('data-email')?.toLowerCase().trim();
        const driverName = selectedOption.getAttribute('data-name');
        const driverImage = selectedOption.getAttribute('data-image');
        const carDetails = selectedOption.getAttribute('data-details');
        const carColor = selectedOption.getAttribute('data-color');
        const vehicleAssigned = selectedOption.getAttribute('data-vehicle');
        const date = document.getElementById('modal_sched_date').value;
        const time = document.getElementById('modal_sched_time').value;

        const schedId = 'SCHED_' + Date.now();

        const scheduleData = sanitizeFirestoreData({
            booking_id: id,
            numeric_booking_id: generateNumericId(),
            schedule_id: generateNumericId(),
            driver_id: driverId,
            driver_id: driverId || "",
            driver_uid: (driverId === "undefined" || !driverId) ? "" : driverId,
            driver_email: driverEmail,
            driver_name: driverName,
            driver_image_url: driverImage || "",
            car_details: carDetails || "",
            car_color: carColor || "",
            vehicle_assigned: vehicleAssigned,
            status: "pending",
            trip_phase: "pending",
            schedule_date: date,
            schedule_time: time,
            schedule_time: time,
            current_segment_index: 0,
            pickup_location: booking.pickup_location,
            pickup_latitude: booking.pickup_latitude || 0,
            pickup_longitude: booking.pickup_longitude || 0,
            dropoff_location: booking.dropoff_location,
            dropoff_latitude: booking.dropoff_latitude || 0,
            dropoff_longitude: booking.dropoff_longitude || 0,
            company_name: 'Jettsan',
            client_name: booking.client_name || '',
            return_to_pickup: booking.return_to_pickup || false,
            special_instructions: booking.special_instructions || '',
            trip_purpose: booking.trip_purpose || '',
            isOfficial: booking.isOfficial || false,
            is_published: false, // Core Stability Refactor: Start as Draft
            created_at: serverTimestamp(),
            updated_at: serverTimestamp()
        });

        await setDoc(doc(db, "schedules", schedId), scheduleData);

        await updateDoc(doc(db, "drivers", driverId), {
            current_trip_id: id,
            current_trip_phase: "pending",
            updated_at: serverTimestamp()
        });

        await updateDoc(doc(db, "bookings", id), {
            status: "scheduled",
            driver_id: driverId,
            updated_at: serverTimestamp()
        });

        // Notifications & logs
        await addDoc(collection(db, "notifications"), {
            user_id: booking.client_id || 'guest',
            user_email: booking.client_email,
            title: 'Driver Assigned',
            message: `Professional Driver ${driverName} (${vehicleAssigned}) has been assigned to your booking #${id}.`,
            type: 'assignment',
            is_read: false,
            booking_id: id,
            timestamp: serverTimestamp()
        });

        await addDoc(collection(db, "activity"), {
            type: 'system',
            title: 'Booking Assigned',
            message: `Driver ${driverName} assigned to Booking #${id}`,
            timestamp: serverTimestamp()
        });

        alert("Driver assigned and schedule created!");
        hideModal('assign-modal');
        clearModalListeners();
    });

    // Handle Unsubscribes for this modal
    setTimeout(() => {
        const modal = document.querySelector('.modal-backdrop');
        if (modal) {
            modal.querySelector('.close-modal').addEventListener('click', clearModalListeners);
            modal.querySelector('.cancel-modal').addEventListener('click', clearModalListeners);
        }
    }, 100);

    // Populate drivers REAL-TIME for manual assignment
    setTimeout(() => {
        const driverSelect = document.getElementById('modal_driver');
        if (!driverSelect) return;

        const unsubDrivers = onSnapshot(collection(db, "drivers"), (driversSnap) => {
            getDocs(collection(db, "driver_locations")).then(locsSnap => {
                updateDriverDropdown(driverSelect, driversSnap.docs, locsSnap.docs, true);
            });
        });

        const unsubLocs = onSnapshot(collection(db, "driver_locations"), (locsSnap) => {
            getDocs(collection(db, "drivers")).then(driversSnap => {
                updateDriverDropdown(driverSelect, driversSnap.docs, locsSnap.docs, true);
            });
        });

        activeModalListeners.push(unsubDrivers, unsubLocs);
    }, 100);

};

window.finalizeDraft = async (id) => {
    // Re-use logic for manual assignment which handles schedule creation
    await window.assignDriver(id);
};

window.deleteBooking = async (id) => {
    const snap = await getDoc(doc(db, "bookings", id));
    if (!snap.exists()) return;
    const bookingData = snap.data();

    await confirmWithBackup(
        "Are you sure you want to delete this booking request?",
        bookingData,
        "Booking",
        id,
        async () => {
            await deleteDoc(doc(db, "bookings", id));
            
            await addDoc(collection(db, "activity"), {
                type: 'system',
                title: 'Booking Deleted',
                message: `Admin deleted Booking #${id}`,
                timestamp: serverTimestamp()
            });

            alert("Booking deleted and backup downloaded.");
        }
    );
};
