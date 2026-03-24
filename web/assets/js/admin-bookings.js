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

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../login.html';
        return;
    }

    const userDoc = await getDoc(doc(db, "users", user.uid));
    const name = userDoc.exists() ? (userDoc.data().full_name || user.email.split('@')[0]) : user.email.split('@')[0];
    
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

    const content = `
        <div class="form-group">
            <label style="display: block; margin-bottom: 10px; font-weight: 600;">Client Type</label>
            <div style="display: flex; gap: 20px; background: rgba(0, 212, 255, 0.05); padding: 12px; border-radius: 8px; border: 1px solid rgba(0, 212, 255, 0.1);">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                    <input type="radio" name="client_type" value="existing" checked style="width: auto;"> Registered Client
                </label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                    <input type="radio" name="client_type" value="new" style="width: auto;"> New / Guest
                </label>
            </div>
        </div>

        <div id="existing_client_section" class="form-group">
            <label for="modal_client">Select Client</label>
            <select id="modal_client" class="form-input">
                <option value="">-- Choose a Client --</option>
                ${clients.map(c => `<option value="${c.id}" data-name="${c.full_name}" data-email="${c.email}">${c.full_name} (${c.email})</option>`).join('')}
            </select>
        </div>

        <div id="new_client_section" style="display: none;">
            <div class="modal-form-row">
                <div class="form-group">
                    <label for="modal_guest_name">Guest Name</label>
                    <input type="text" id="modal_guest_name" class="form-input" placeholder="Enter guest name...">
                </div>
                <div class="form-group">
                    <label for="modal_guest_email">Guest Email</label>
                    <input type="email" id="modal_guest_email" class="form-input" placeholder="Enter guest email...">
                </div>
            </div>
            <div class="form-group">
                <label for="modal_company">Company Name (Optional)</label>
                <input type="text" id="modal_company" class="form-input" placeholder="Enter company name...">
            </div>
        </div>

        <div class="form-group" style="position: relative;">
            <label for="pickup_location">Pickup Location</label>
            <div class="input-with-action">
                <input type="text" id="pickup_location" class="form-input" placeholder="Search for pickup address..." required autocomplete="off">
                <button type="button" class="btn-input-action" id="locatePickup" title="Use current location"><i class="fas fa-location-crosshairs"></i></button>
            </div>
            <input type="hidden" id="pickup_latitude" value="0">
            <input type="hidden" id="pickup_longitude" value="0">
        </div>

        <div class="form-group" style="position: relative;">
            <label for="dropoff_location">Dropoff Location</label>
            <div class="input-with-action">
                <input type="text" id="dropoff_location" class="form-input" placeholder="Search for dropoff address..." required autocomplete="off">
                <button type="button" class="btn-input-action" id="locateDropoff" title="Use current location"><i class="fas fa-location-crosshairs"></i></button>
            </div>
            <input type="hidden" id="dropoff_latitude" value="0">
            <input type="hidden" id="dropoff_longitude" value="0">
        </div>

        <div class="modal-form-row">
            <div class="form-group">
                <label for="pickup_date">Pickup Date</label>
                <input type="date" id="pickup_date" class="form-input" value="${today}" required>
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
        const isExisting = document.querySelector('input[name="client_type"]:checked').value === 'existing';
        const clientSelect = document.getElementById('modal_client');
        const selectedOption = clientSelect?.options[clientSelect.selectedIndex];

        const clientId = isExisting ? (clientSelect?.value || '') : 'guest';
        const clientName = isExisting
            ? (selectedOption?.getAttribute('data-name') || selectedOption?.text || '')
            : document.getElementById('modal_guest_name').value;
        const clientEmail = isExisting
            ? (selectedOption?.getAttribute('data-email') || '')
            : document.getElementById('modal_guest_email').value;

        if (isExisting && !clientId) throw new Error("Please select a registered client.");
        if (!isExisting && (!clientName || !clientEmail)) throw new Error("Please enter Guest name and email.");

        const pickup = document.getElementById('pickup_location').value.trim();
        const dropoff = document.getElementById('dropoff_location').value.trim();
        if (!pickup || !dropoff) throw new Error("Please enter pickup and dropoff locations.");

        const date = document.getElementById('pickup_date').value;
        const time = document.getElementById('pickup_time').value;
        if (!date || !time) throw new Error("Please enter a date and time.");

        const driverId = document.getElementById('modal_driver').value;
        const autoDispatch = document.getElementById('modal_auto_dispatch').checked;

        const bookingId = generateNumericId().toString();
        const data = sanitizeFirestoreData({
            booking_id: bookingId,
            client_id: clientId,
            client_name: clientName,
            client_email: clientEmail,
            company_name: isExisting ? '' : (document.getElementById('modal_company')?.value || ''),

            pickup_location: pickup,
            pickup_latitude: parseFloat(document.getElementById('pickup_latitude').value) || 0,
            pickup_longitude: parseFloat(document.getElementById('pickup_longitude').value) || 0,

            dropoff_location: dropoff,
            dropoff_latitude: parseFloat(document.getElementById('dropoff_latitude').value) || 0,
            dropoff_longitude: parseFloat(document.getElementById('dropoff_longitude').value) || 0,

            pickup_date: date,
            pickup_time: time,
            passengers: parseInt(document.getElementById('passengers').value) || 1,
            return_to_pickup: document.getElementById('return_to_pickup').checked,
            special_instructions: document.getElementById('special_instructions').value || '',

            driver_id: driverId || null,
            status: autoDispatch ? 'scheduled' : 'pending',
            createdBy: 'admin',
            created_at: serverTimestamp()
        });

        // 1. Save Booking
        await setDoc(doc(db, "bookings", bookingId), data);

        // 2. If Auto-Dispatch and Driver selected, create Schedule and update Driver status
        if (autoDispatch && driverId) {
            const driverSelect = document.getElementById('modal_driver');
            const driverName = driverSelect.options[driverSelect.selectedIndex].text.replace('🟢 ', '');
            
            // Get driver email
            const driverUserDoc = await getDoc(doc(db, "users", driverId));
            const driverEmail = driverUserDoc.exists() ? (driverUserDoc.data().email || "") : "";

            const scheduleData = sanitizeFirestoreData({
                booking_id: bookingId,
                numeric_booking_id: parseInt(bookingId), 
                schedule_id: generateNumericId(),
                client_id: clientId,
                client_name: clientName,
                client_email: clientEmail,
                company_name: isExisting ? '' : (document.getElementById('modal_company')?.value || ''),
                driver_id: driverId,
                driver_email: driverEmail.toLowerCase().trim(),
                driver_name: driverName,
                trip_phase: "pending",
                status: "pending",
                pickup_location: pickup,
                pickup_latitude: parseFloat(document.getElementById('pickup_latitude').value) || 0,
                pickup_longitude: parseFloat(document.getElementById('pickup_longitude').value) || 0,
                dropoff_location: dropoff,
                dropoff_latitude: parseFloat(document.getElementById('dropoff_latitude').value) || 0,
                dropoff_longitude: parseFloat(document.getElementById('dropoff_longitude').value) || 0,
                schedule_date: date,
                schedule_time: time,
                passengers: parseInt(document.getElementById('passengers').value) || 1,
                return_to_pickup: document.getElementById('return_to_pickup').checked,
                special_instructions: document.getElementById('special_instructions').value || '',
                created_at: serverTimestamp(),
                updated_at: serverTimestamp()
            });

            await addDoc(collection(db, "schedules"), scheduleData);

            // Update driver status in drivers collection
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
            // 3. Create Notification for Client
            await addDoc(collection(db, "notifications"), {
                user_id: clientId,
                user_email: clientEmail,
                title: 'Driver Assigned',
                message: `Professional Driver ${driverName} (${vehicleAssigned}) has been assigned to your booking #${bookingId}.`,
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
            message: `Admin created a booking for ${data.client_name} (ID: ${bookingId})`,
            timestamp: serverTimestamp()
        });

        alert("Booking created successfully! " + (autoDispatch ? "It has been sent to dispatch." : "It is now pending approval."));
    });

    // Initialize client type toggle logic after modal renders
    setTimeout(async () => {
        const radios = document.querySelectorAll('input[name="client_type"]');
        radios.forEach(r => r.addEventListener('change', (e) => {
            document.getElementById('existing_client_section').style.display = e.target.value === 'existing' ? 'block' : 'none';
            document.getElementById('new_client_section').style.display = e.target.value === 'new' ? 'block' : 'none';
        }));

        // Populate Drivers List (Only Available)
        const driverSelect = document.getElementById('modal_driver');
        if (driverSelect) {
            try {
                // We check 'drivers' collection for status, and 'users' for name
                const availableDriversQuery = query(collection(db, "drivers"), where("current_status", "==", "available"));
                const driversSnap = await getDocs(availableDriversQuery);
                
                if (!driversSnap.empty) {
                    let driversHtml = '<option value="">-- No Driver Assigned --</option>';
                    for (const docSnap of driversSnap.docs) {
                        const d = docSnap.data();
                        // Find the user UID for this driver via email fallback if needed
                        const uQuery = query(collection(db, "users"), where("email", "==", d.driver_email));
                        const uSnap = await getDocs(uQuery);
                        if (!uSnap.empty) {
                            const u = uSnap.docs[0];
                            driversHtml += `<option value="${u.id}">🟢 ${d.driver_name || u.data().full_name}</option>`;
                        }
                    }
                    driverSelect.innerHTML = driversHtml;
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
    onSnapshot(query(collection(db, "bookings"), orderBy("created_at", "desc")), (snapshot) => {
        allBookings = snapshot.docs;
        applyFilters();
    });

    if (statusFilter) {
        statusFilter.addEventListener('change', applyFilters);
    }
}

function applyFilters() {
    if (!bookingTableBody) return;
    const status = statusFilter?.value || 'all';
    const filtered = allBookings.filter(d => status === 'all' || d.data().status === status);
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
        return `
            <tr>
                <td>${booking.client_name || 'N/A'}</td>
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
            <div><strong>Client:</strong> ${b.client_name || 'N/A'} (${b.client_email || 'N/A'})</div>
            <div><strong>Pickup:</strong> ${b.pickup_location || 'N/A'}</div>
            <div><strong>Dropoff:</strong> ${b.dropoff_location || 'N/A'}</div>
            <div><strong>Date/Time:</strong> ${b.pickup_date || ''} ${b.pickup_time || ''}</div>
            <div><strong>Pax:</strong> ${b.pax || 1}</div>
            <div><strong>Return?:</strong> ${b.return_to_pickup ? 'Yes' : 'No'}</div>
            <div><strong>Status:</strong> <span class="status-badge ${b.status}">${b.status}</span></div>
            <div><strong>Notes:</strong> ${b.special_instructions || '-'}</div>
        </div>
    `, async () => { /* read-only, no save action */ });
    // Change save button to Close
    setTimeout(() => {
        const saveBtn = document.querySelector('.save-modal');
        if (saveBtn) { saveBtn.textContent = 'Close'; saveBtn.classList.replace('btn-primary', 'btn-secondary'); }
    }, 50);
};

window.assignDriver = async (id) => {
    const bookingDoc = await getDoc(doc(db, "bookings", id));
    if (!bookingDoc.exists()) return;
    const booking = bookingDoc.data();

    // Fetch available drivers
    const driversSnap = await getDocs(query(collection(db, "drivers"), where("current_status", "==", "available")));
    const drivers = driversSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const content = `
        <div class="form-group">
            <label>Select Driver</label>
            <select id="modal_driver" class="form-input" required>
                <option value="">-- Choose a Driver --</option>
                ${drivers.map(d => `
                    <option value="${d.id}" 
                            data-email="${d.driver_email || ''}" 
                            data-name="${d.driver_name || ''}"
                            data-phone="${d.driver_phone || ''}"
                            data-plate="${d.plate_number || ''}"
                            data-vehicle="${d.vehicle_assigned || ''}">
                        ${d.driver_name} - ${d.vehicle_assigned} (${d.plate_number})
                    </option>`).join('')}
            </select>
        </div>
        ${drivers.length === 0 ? '<p style="color:var(--accent-orange);"><i class="fas fa-exclamation-triangle"></i> No available drivers at the moment.</p>' : ''}
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
        const driverPhone = selectedOption.getAttribute('data-phone');
        const plateNumber = selectedOption.getAttribute('data-plate');
        const vehicleAssigned = selectedOption.getAttribute('data-vehicle');
        const date = document.getElementById('modal_sched_date').value;
        const time = document.getElementById('modal_sched_time').value;

        const schedId = 'SCHED_' + Date.now();

        const scheduleData = sanitizeFirestoreData({
            booking_id: id,
            schedule_id: generateNumericId(),
            driver_id: driverId,
            driver_email: driverEmail,
            driver_name: driverName,
            driver_phone: driverPhone,
            plate_number: plateNumber,
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
            company_name: booking.company_name || '',
            client_name: booking.client_name || '',
            client_phone: booking.client_phone || '',
            client_email: booking.client_email || '',
            return_to_pickup: booking.return_to_pickup || false,
            special_instructions: booking.special_instructions || '',
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

        // 4. Create Notification for Client
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

        // Log Activity
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
        
        // Log Activity
        await addDoc(collection(db, "activity"), {
            type: 'system',
            title: 'Booking Deleted',
            message: `Admin deleted Booking #${id}`,
            timestamp: serverTimestamp()
        });
    }
};
