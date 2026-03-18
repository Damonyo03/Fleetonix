import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot, doc, getDoc, updateDoc, deleteDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { initLayout, showModal, hideModal } from "./modules/ui.js";

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// Secondary app for creating users without logging out
const secondaryApp = getApps().find(a => a.name === "Secondary") || initializeApp(firebaseConfig, "Secondary");
const secondaryAuth = getAuth(secondaryApp);

const driverGrid = document.getElementById('driverGrid');
const driverSearch = document.getElementById('driverSearch');
const statusFilter = document.getElementById('statusFilter');

let allDrivers = [];

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../login.html';
        return;
    }

    const userDoc = await getDoc(doc(db, "users", user.uid));
    const name = userDoc.exists() ? userDoc.data().full_name : user.email.split('@')[0];
    initLayout('Driver Management', name);

    initDriverList();
});

function initDriverList() {
    onSnapshot(collection(db, "drivers"), (snapshot) => {
        allDrivers = snapshot.docs;
        applyFilters();
    });

    if (driverSearch) driverSearch.addEventListener('input', applyFilters);
    if (statusFilter) statusFilter.addEventListener('change', applyFilters);
}

function applyFilters() {
    if (!driverGrid) return;
    const searchTerm = driverSearch.value.toLowerCase();
    const status = statusFilter.value;

    const filtered = allDrivers.filter(d => {
        const data = d.data();
        const matchesSearch = (data.driver_name || '').toLowerCase().includes(searchTerm) || 
                             (data.plate_number || '').toLowerCase().includes(searchTerm) || 
                             (data.vehicle_assigned || '').toLowerCase().includes(searchTerm);
        const matchesStatus = status === 'all' || data.current_status === status;
        return matchesSearch && matchesStatus;
    });
    renderDrivers(filtered);
}

function renderDrivers(docs) {
    if (docs.length === 0) {
        driverGrid.innerHTML = '<p style="text-align: center; grid-column: 1/-1; padding: 40px;">No drivers found.</p>';
        return;
    }

    driverGrid.innerHTML = docs.map(d => {
        const driver = d.data();
        const id = d.id;
        const status = driver.current_status || 'offline';
        return `
            <div class="driver-card">
                <div class="driver-status ${status}"></div>
                <div class="driver-info">
                    <h3>${driver.driver_name || 'Unnamed Driver'}</h3>
                    <p><i class="fas fa-truck-pickup"></i> ${driver.vehicle_assigned || 'No vehicle'}</p>
                    <p><i class="fas fa-id-card"></i> ${driver.plate_number || 'No plate'}</p>
                    <p><i class="fas fa-phone"></i> ${driver.driver_phone || 'No phone'}</p>
                </div>
                <div class="driver-meta">
                    <span>Status: ${status.replace('_', ' ')}</span>
                    <div class="card-actions">
                        <button class="btn-icon edit" onclick="window.editDriver('${id}')"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon delete" onclick="window.deleteDriver('${id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

const addDriverBtn = document.getElementById('addDriverBtn');
if (addDriverBtn) {
    addDriverBtn.onclick = () => {
        const content = `
            <div class="form-group">
                <label>Driver Name</label>
                <input type="text" id="modal_driver_name" class="form-input" required>
            </div>
            <div class="form-group">
                <label>Vehicle Model</label>
                <input type="text" id="modal_vehicle" class="form-input" required>
            </div>
            <div class="form-group">
                <label>Plate Number</label>
                <input type="text" id="modal_plate" class="form-input" required>
            </div>
            <div class="form-group">
                <label>Phone Number</label>
                <input type="text" id="modal_phone" class="form-input" required>
            </div>
            <div class="form-group">
                <label>Driver Email (for Mobile Login)</label>
                <input type="email" id="modal_email" class="form-input" required>
            </div>
            <div class="form-group">
                <label>Password (At least 6 characters)</label>
                <input type="password" id="modal_password" class="form-input" required minlength="6">
            </div>
        `;

        showModal('driver-modal', 'Add New Driver', content, async () => {
            const name = document.getElementById('modal_driver_name').value;
            const vehicle = document.getElementById('modal_vehicle').value;
            const plate = document.getElementById('modal_plate').value;
            const phone = document.getElementById('modal_phone').value;
            const email = document.getElementById('modal_email').value.toLowerCase().trim();
            const password = document.getElementById('modal_password').value;

            if (password.length < 6) {
                alert("Password must be at least 6 characters long.");
                return;
            }

            try {
                // Create user in Firebase Auth
                const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
                const driverId = userCredential.user.uid;

                await setDoc(doc(db, "drivers", driverId), {
                    driver_name: name,
                    vehicle_assigned: vehicle,
                    plate_number: plate,
                    driver_phone: phone,
                    driver_email: email,
                    current_status: "offline",
                    created_at: serverTimestamp()
                });
                
                // Set initial user record for role validation
                await setDoc(doc(db, "users", driverId), {
                    full_name: name,
                    email: email,
                    user_type: "driver",
                    status: "active"
                });

                // Clear secondary auth state
                await signOut(secondaryAuth);

                // Log Activity
                await addDoc(collection(db, "activity"), {
                    type: 'system',
                    title: 'New Driver Created',
                    message: `Admin created driver: ${name} (${email})`,
                    timestamp: serverTimestamp()
                });

                alert("Driver created successfully!");
            } catch (error) {
                console.error("Error creating driver account:", error);
                alert("Failed to create driver account: " + error.message);
            }
        });
    };
}

window.editDriver = async (id) => {
    const snap = await getDoc(doc(db, "drivers", id));
    if (!snap.exists()) return;
    const driver = snap.data();

    const content = `
        <div class="form-group">
            <label>Driver Name</label>
            <input type="text" id="modal_driver_name" class="form-input" value="${driver.driver_name}" required>
        </div>
        <div class="form-group">
            <label>Vehicle Model</label>
            <input type="text" id="modal_vehicle" class="form-input" value="${driver.vehicle_assigned}" required>
        </div>
        <div class="form-group">
            <label>Plate Number</label>
            <input type="text" id="modal_plate" class="form-input" value="${driver.plate_number}" required>
        </div>
        <div class="form-group">
            <label>Driver Email</label>
            <input type="email" id="modal_email" class="form-input" value="${driver.driver_email || ''}" required>
        </div>
        <div class="form-group">
            <label>Status</label>
            <select id="modal_status" class="form-input">
                <option value="available" ${driver.current_status === 'available' ? 'selected' : ''}>Available</option>
                <option value="on_schedule" ${driver.current_status === 'on_schedule' ? 'selected' : ''}>On Schedule</option>
                <option value="offline" ${driver.current_status === 'offline' ? 'selected' : ''}>Offline</option>
            </select>
        </div>
    `;

    showModal('driver-modal', 'Edit Driver', content, async () => {
        const email = document.getElementById('modal_email').value.toLowerCase().trim();
        await updateDoc(doc(db, "drivers", id), {
            driver_name: document.getElementById('modal_driver_name').value,
            vehicle_assigned: document.getElementById('modal_vehicle').value,
            plate_number: document.getElementById('modal_plate').value,
            driver_email: email,
            current_status: document.getElementById('modal_status').value
        });
        // Update user record too for consistency
        try {
            await updateDoc(doc(db, "users", id), {
                full_name: document.getElementById('modal_driver_name').value,
                email: email
            });
        } catch (e) { console.log("User doc might not exist yet for this driver ID"); }

        // Log Activity
        await addDoc(collection(db, "activity"), {
            type: 'system',
            title: 'Driver Updated',
            message: `Admin updated info for driver: ${document.getElementById('modal_driver_name').value}`,
            timestamp: serverTimestamp()
        });
    });
};

window.deleteDriver = async (id) => {
    if (confirm("Are you sure you want to delete this driver?")) {
        await deleteDoc(doc(db, "drivers", id));
        
        // Log Activity
        await addDoc(collection(db, "activity"), {
            type: 'system',
            title: 'Driver Deleted',
            message: `Admin deleted driver (ID: ${id})`,
            timestamp: serverTimestamp()
        });
    }
};


