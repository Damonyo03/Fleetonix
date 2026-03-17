import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot, doc, getDoc, updateDoc, deleteDoc, orderBy, getDocs, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { initLayout, showModal, hideModal } from "./modules/ui.js";
import { sanitizeFirestoreData, generateNumericId } from "./modules/data.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const bookingTableBody = document.getElementById('bookingTableBody');
const statusFilter = document.getElementById('statusFilter');
const newAdminBookingBtn = document.getElementById('newAdminBookingBtn');

let allBookings = [];

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../login.html';
        return;
    }

    const userDoc = await getDoc(doc(db, "users", user.uid));
    const name = userDoc.exists() ? userDoc.data().full_name : user.email.split('@')[0];
    initLayout('Bookings', name);

    initBookingList();
    initAdminBooking();
});

function initAdminBooking() {
    if (newAdminBookingBtn) {
        newAdminBookingBtn.addEventListener('click', window.showAdminBookingModal);
    }
}

window.showAdminBookingModal = async () => {
    try {
        // Fetch clients
        const clientsSnap = await getDocs(query(collection(db, "users"), where("user_type", "==", "client")));
        const clients = clientsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const content = `
            <div class="form-group">
                <label>Select Client</label>
                <select id="modal_client" class="form-input" required>
                    <option value="">-- Choose a Client --</option>
                    ${clients.map(c => `<option value="${c.id}" data-name="${c.full_name || ''}" data-email="${c.email || ''}">${c.full_name || c.email}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Pickup Location</label>
                <input type="text" id="modal_pickup" class="form-input" placeholder="Start typing address..." required>
            </div>
            <div class="form-group">
                <label>Dropoff Location</label>
                <input type="text" id="modal_dropoff" class="form-input" placeholder="Destination..." required>
            </div>
            <div class="grid-2">
                <div class="form-group">
                    <label>Pickup Date</label>
                    <input type="date" id="modal_date" class="form-input" value="${new Date().toISOString().split('T')[0]}" required>
                </div>
                <div class="form-group">
                    <label>Pickup Time</label>
                    <input type="time" id="modal_time" class="form-input" required>
                </div>
            </div>
            <div class="form-group">
                <label>Passengers (Pax)</label>
                <input type="number" id="modal_pax" class="form-input" value="1" min="1" required>
            </div>
            <div class="form-group" style="display: flex; align-items: center; gap: 10px; margin-top: 10px; background: rgba(59, 130, 246, 0.05); padding: 10px; border-radius: 8px;">
                <input type="checkbox" id="modal_auto_dispatch" style="width: auto; height: auto;">
                <label for="modal_auto_dispatch" style="margin: 0; cursor: pointer; color: var(--accent-blue); font-weight: 600;">Auto-Approve & Dispatch</label>
            </div>
        `;

        showModal('admin-booking-modal', 'New Client Booking', content, async () => {
            const clientSelect = document.getElementById('modal_client');
            const data = {
                client_id: clientSelect.value,
                client_name: clientSelect.options[clientSelect.selectedIndex].getAttribute('data-name'),
                client_email: clientSelect.options[clientSelect.selectedIndex].getAttribute('data-email'),
                pickup_location: document.getElementById('modal_pickup').value,
                dropoff_location: document.getElementById('modal_dropoff').value,
                pickup_date: document.getElementById('modal_date').value,
                pickup_time: document.getElementById('modal_time').value,
                pax: document.getElementById('modal_pax').value,
                status: document.getElementById('modal_auto_dispatch').checked ? 'approved' : 'pending',
                createdBy: 'admin',
                created_at: serverTimestamp()
            };

            if (!data.client_id) throw new Error("Please select a client.");

            const bookingId = generateNumericId().toString();
            await setDoc(doc(db, "bookings", bookingId), sanitizeFirestoreData(data));
            
            alert("Booking created successfully!");
        });

        // Initialize Google Places Autocomplete if available
        if (window.google && google.maps && google.maps.places) {
            new google.maps.places.Autocomplete(document.getElementById('modal_pickup'));
            new google.maps.places.Autocomplete(document.getElementById('modal_dropoff'));
        }

    } catch (error) {
        console.error("Error opening booking modal:", error);
        alert("Failed to load clients: " + error.message);
    }
};

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
    const status = statusFilter.value;
    const filtered = allBookings.filter(d => status === 'all' || d.data().status === status);
    renderBookings(filtered);
}

function renderBookings(docs) {
    if (docs.length === 0) {
        bookingTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">No bookings found.</td></tr>';
        return;
    }

    bookingTableBody.innerHTML = docs.map(d => {
        const booking = d.data();
        const id = d.id;
        return `
            <tr>
                <td>${booking.client_name || 'N/A'}</td>
                <td>${booking.pickup_location || 'N/A'}</td>
                <td>${booking.dropoff_location || 'N/A'}</td>
                <td>${booking.pickup_date || 'N/A'} ${booking.pickup_time || ''}</td>
                <td><span class="status-badge ${booking.status}">${booking.status}</span></td>
                <td class="table-actions">
                    <button class="btn-icon view" title="View Details" onclick="alert('Pickup Lat: ${booking.pickup_latitude}, Long: ${booking.pickup_longitude}')"><i class="fas fa-eye"></i></button>
                    ${booking.status === 'pending' ? `<button class="btn-icon approve" title="Assign Driver" onclick="window.assignDriver('${id}')"><i class="fas fa-user-check"></i></button>` : ''}
                    <button class="btn-icon delete" title="Delete" onclick="window.deleteBooking('${id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

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
        <div class="form-group">
            <label>Schedule Date</label>
            <input type="date" id="modal_date" class="form-input" value="${booking.booking_date}" required>
        </div>
        <div class="form-group">
            <label>Schedule Time</label>
            <input type="time" id="modal_time" class="form-input" value="${booking.booking_time}" required>
        </div>
    `;

    showModal('assign-modal', 'Assign Driver to Schedule', content, async () => {
        const driverSelect = document.getElementById('modal_driver');
        const selectedOption = driverSelect.options[driverSelect.selectedIndex];
        if (!selectedOption.value) {
            alert("Please select a driver");
            return;
        }

        const driverId = selectedOption.value;
        const driverEmail = selectedOption.getAttribute('data-email')?.toLowerCase().trim();
        const driverName = selectedOption.getAttribute('data-name');
        const driverPhone = selectedOption.getAttribute('data-phone');
        const plateNumber = selectedOption.getAttribute('data-plate');
        const vehicleAssigned = selectedOption.getAttribute('data-vehicle');
        const date = document.getElementById('modal_date').value;
        const time = document.getElementById('modal_time').value;

        // Create the schedule
        // Use a numeric ID for the 'schedule_id' field specifically for Android Int models
        const numericId = generateNumericId();
        const schedId = 'SCHED_' + Date.now();
        
        console.log("Creating schedule for driver:", driverEmail);

        const scheduleData = sanitizeFirestoreData({
            booking_id: id, // Keep original booking string ID
            numeric_booking_id: generateNumericId(), // Fallback for Int models
            schedule_id: numericId, // Numeric ID for Android Int model mapping
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
            pickup_latitude: booking.pickup_latitude,
            pickup_longitude: booking.pickup_longitude,
            dropoff_location: booking.dropoff_location,
            dropoff_latitude: booking.dropoff_latitude,
            dropoff_longitude: booking.dropoff_longitude,
            company_name: booking.company_name,
            client_name: booking.client_name,
            client_phone: booking.client_phone,
            client_email: booking.client_email,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp()
        });

        await setDoc(doc(db, "schedules", schedId), scheduleData);

        // Update driver status
        await updateDoc(doc(db, "drivers", driverId), { 
            current_status: "on_schedule",
            current_trip_id: id,
            current_trip_phase: "pending",
            updated_at: serverTimestamp()
        });

        // Update booking status
        await updateDoc(doc(db, "bookings", id), { 
            status: "scheduled",
            updated_at: serverTimestamp()
        });
        
        alert("Driver assigned and schedule created!");
    });
};

window.deleteBooking = async (id) => {
    if (confirm("Are you sure you want to delete this booking request?")) {
        await deleteDoc(doc(db, "bookings", id));
    }
};


