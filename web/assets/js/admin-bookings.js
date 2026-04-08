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

const bookingTableBody = document.getElementById('bookingTableBody');
const statusFilter = document.getElementById('statusFilter');
const newAdminBookingBtn = document.getElementById('newAdminBookingBtn');

let allBookings = [];

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
        initLayout('Bookings', name);
        initBookingList();
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
                    <div class="input-with-action">
                        <input type="text" class="form-input pickup-input" placeholder="Search for pickup..." required autocomplete="off">
                    </div>
                    <input type="hidden" class="lat-input" value="0">
                    <input type="hidden" class="lng-input" value="0">
                </div>
                <div class="form-group dropoff-point" style="position: relative;">
                    <label>Dropoff Location</label>
                    <div class="input-with-action">
                        <input type="text" class="form-input dropoff-input" placeholder="Search for dropoff..." required autocomplete="off">
                    </div>
                    <input type="hidden" class="drop-lat-input" value="0">
                    <input type="hidden" class="drop-lng-input" value="0">
                </div>
            </div>
        </div>
        <button type="button" id="add_segment" class="btn-secondary" style="margin-bottom: 20px; padding: 8px 16px; font-size: 0.85em;">
            <i class="fas fa-plus-circle"></i> Add Secondary Stop (Pickup & Dropoff)
        </button>

        <div class="modal-form-row">
            <div class="form-group">
                <label for="pickup_date">Pickup Date (Today/Tomorrow Only)</label>
                <input type="date" id="pickup_date" class="form-input" value="${today}" min="${today}" max="${tomorrowStr}" required>
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
            <label for="special_instructions">Special Instructions (Optional)</label>
            <textarea id="special_instructions" class="form-input" rows="2" placeholder="e.g. Near the main gate..."></textarea>
        </div>

        <div class="form-group" style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px; background: rgba(0, 212, 255, 0.05); padding: 12px; border-radius: 8px; border: 1px dashed var(--accent-blue);">
            <input type="checkbox" id="modal_is_official" style="width: auto;">
            <label for="modal_is_official" style="margin: 0; cursor: pointer; color: var(--accent-blue); font-weight: 700;">Official Trip (NSCRP Requirement)</label>
        </div>

        <div class="form-group">
            <label for="modal_driver">Assign Driver (Optional)</label>
            <select id="modal_driver" class="form-input">
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

        const segments = Array.from(document.querySelectorAll('.segment-group')).map((el, i) => ({
            pickup: el.querySelector('.pickup-input').value,
            pickup_latitude: parseFloat(el.querySelector('.lat-input').value) || 0,
            pickup_longitude: parseFloat(el.querySelector('.lng-input').value) || 0,
            dropoff: el.querySelector('.dropoff-input').value,
            dropoff_latitude: parseFloat(el.querySelector('.drop-lat-input').value) || 0,
            dropoff_longitude: parseFloat(el.querySelector('.drop-lng-input').value) || 0,
            order: i + 1
        }));

        if (segments.some(s => !s.pickup || !s.dropoff)) throw new Error("Please fill in all pickup and dropoff locations for each segment.");

        const bookingId = generateNumericId().toString();
        const operatingArea = document.getElementById('modal_operating_area').value;
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
            operating_area: operatingArea,
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

        // 1. Save Booking
        await setDoc(doc(db, "bookings", bookingId), data);

        // 2. Schedule Creation (if dispatched)
        if (autoDispatch && driverId) {
            const driverSelect = document.getElementById('modal_driver');
            const driverName = driverSelect.options[driverSelect.selectedIndex].text.replace('🟢 ', '').replace('⚪ ', '');
            
            const driverDoc = await getDoc(doc(db, "drivers", driverId));
            const dData = driverDoc.exists() ? driverDoc.data() : {};
            const driverEmail = dData.driver_email || "";

            const scheduleData = sanitizeFirestoreData({
                booking_id: bookingId,
                numeric_booking_id: parseInt(bookingId), 
                schedule_id: generateNumericId(),
                client_id: 'guest',
                client_name: clientName,
                operating_area: operatingArea,
                driver_id: driverId,
                driver_email: driverEmail.toLowerCase().trim(),
                driver_name: driverName,
                driver_image_url: dData.profile_image_url || "",
                car_details: dData.car_details || "",
                car_color: dData.car_color || "",
                trip_phase: "pending",
                status: "pending",
                segments: segments,
                pickup_location: segments[0].pickup,
                pickup_latitude: segments[0].pickup_latitude,
                pickup_longitude: segments[0].pickup_longitude,
                dropoff_location: segments[segments.length - 1].dropoff,
                dropoff_latitude: segments[segments.length - 1].dropoff_latitude,
                dropoff_longitude: segments[segments.length - 1].dropoff_longitude,
                schedule_date: date,
                schedule_time: time,
                passengers: parseInt(document.getElementById('passengers').value) || 1,
                return_to_pickup: document.getElementById('return_to_pickup').checked,
                special_instructions: document.getElementById('special_instructions').value || '',
                isOfficial: isOfficial,
                created_at: serverTimestamp(),
                updated_at: serverTimestamp()
            });

            await addDoc(collection(db, "schedules"), scheduleData);

            // Update driver status
            await updateDoc(doc(db, "drivers", driverId), {
                current_status: "on_schedule",
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
        }
        
        // Log Activity
        await addDoc(collection(db, "activity"), {
            type: 'system',
            title: 'New Booking Created',
            message: `Admin created a booking for ${clientName} (ID: ${bookingId})`,
            timestamp: serverTimestamp()
        });

        alert("Booking created successfully! " + (autoDispatch ? "It has been sent to dispatch." : "It is now pending approval."));
    });

    // Initialize Dynamic UI components
    setTimeout(async () => {
        // Dynamic Segments
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
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <div style="font-size: 0.75rem; font-weight: 800; color: var(--accent-blue); text-transform: uppercase;">Booking ${segmentCount} (Secondary)</div>
                        <button type="button" class="btn-icon remove-segment" style="color: var(--accent-error);"><i class="fas fa-trash"></i></button>
                    </div>
                    <div class="form-group pickup-point" style="position: relative;">
                        <label>Pickup Location</label>
                        <input type="text" class="form-input pickup-input" placeholder="Secondary pickup..." required autocomplete="off">
                        <input type="hidden" class="lat-input" value="0">
                        <input type="hidden" class="lng-input" value="0">
                    </div>
                    <div class="form-group dropoff-point" style="position: relative;">
                        <label>Dropoff Location</label>
                        <input type="text" class="form-input dropoff-input" placeholder="Secondary dropoff..." required autocomplete="off">
                        <input type="hidden" class="drop-lat-input" value="0">
                        <input type="hidden" class="drop-lng-input" value="0">
                    </div>
                `;
                container.appendChild(div);

                // Re-init autocompletes if needed
                if (window.initAutocompleteForInput) {
                    div.querySelectorAll('input[type="text"]').forEach(input => window.initAutocompleteForInput(input));
                }
                
                div.querySelector('.remove-segment').onclick = () => div.remove();
            };
        }

        const driverSelect = document.getElementById('modal_driver');
        if (driverSelect) {
            try {
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
                        name: data.driver_name,
                        isOnline: isOnline
                    });
                });

                const sortedDrivers = Array.from(driverMap.values()).sort((a, b) => {
                    if (a.isOnline === b.isOnline) return a.name.localeCompare(b.name);
                    return a.isOnline ? -1 : 1;
                });

                if (sortedDrivers.length > 0) {
                    driverSelect.innerHTML = '<option value="">-- No Driver Assigned --</option>' + 
                        sortedDrivers.map(d => `<option value="${d.id}">${d.isOnline ? '🟢 [ONLINE]' : '⚪ [OFFLINE]'} ${d.name}</option>`).join('');
                } else {
                    driverSelect.innerHTML = '<option value="">No available drivers found</option>';
                }
            } catch (err) {
                console.error("Error loading drivers for booking:", err);
            }
        }
    }, 100);
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
    if (document.getElementById('areaFilter')) {
        document.getElementById('areaFilter').addEventListener('change', applyFilters);
    }
}

function applyFilters() {
    if (!bookingTableBody) return;
    const status = statusFilter?.value || 'all';
    const area = document.getElementById('areaFilter')?.value || 'all';
    const filtered = allBookings.filter(d => {
        const b = d.data();
        const matchStatus = status === 'all' || b.status === status;
        const matchArea = area === 'all' || b.operating_area === area;
        return matchStatus && matchArea;
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
        return `
            <tr>
                <td>${displayName}</td>
                <td><span class="badge badge-info" style="font-size: 0.65rem;">${booking.operating_area || 'Unassigned'}</span></td>
                <td>${booking.pickup_location || 'N/A'}</td>
                <td>${booking.dropoff_location || 'N/A'}</td>
                <td>${booking.pickup_date || 'N/A'} ${booking.pickup_time || ''}</td>
                <td><span class="status-badge ${statusClass}">${statusClass}</span></td>
                <td class="table-actions">
                    <button class="btn-icon view" title="View Details" onclick="window.viewBookingDetails('${id}')"><i class="fas fa-eye"></i></button>
                    ${booking.status === 'pending' ? `<button class="btn-icon approve" title="Assign Driver" onclick="window.assignDriver('${id}')"><i class="fas fa-user-check"></i></button>` : ''}
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
            <div><strong>Pax:</strong> ${b.pax || 1}</div>
            <div><strong>Return?:</strong> ${b.return_to_pickup ? 'Yes' : 'No'}</div>
            <div><strong>Status:</strong> <span class="status-badge ${b.status}">${b.status}</span></div>
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
            <select id="modal_driver" class="form-input" required>
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
            <input type="date" id="modal_sched_date" class="form-input" value="${booking.pickup_date || ''}" required>
        </div>
        <div class="form-group">
            <label>Schedule Time</label>
            <input type="time" id="modal_sched_time" class="form-input" value="${booking.pickup_time || ''}" required>
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
            isOfficial: booking.isOfficial || false,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp()
        });

        await setDoc(doc(db, "schedules", schedId), scheduleData);

        await updateDoc(doc(db, "drivers", driverId), {
            current_status: "on_schedule",
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
    });
};

window.deleteBooking = async (id) => {
    if (confirm("Are you sure you want to delete this booking request?")) {
        await deleteDoc(doc(db, "bookings", id));
        
        await addDoc(collection(db, "activity"), {
            type: 'system',
            title: 'Booking Deleted',
            message: `Admin deleted Booking #${id}`,
            timestamp: serverTimestamp()
        });
    }
};
