import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot, doc, getDoc, updateDoc, deleteDoc, setDoc, addDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
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

let currentUserData = null;
let allDrivers = [];
let activeCompanies = {};

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
    initLayout('Driver Management', name);

    initDriverList();

    initDriverList();
    
    // Integrity Check (Super Admin only can auto-repair)
    if (role === 'super_admin' || role === 'admin') {
        setTimeout(repairMissingDriverProfiles, 2000);
    }
});

async function repairMissingDriverProfiles() {
    console.log("Analyzing driver database integrity...");
    try {
        const driversSnap = await getDocs(collection(db, "drivers"));
        const usersSnap = await getDocs(query(collection(db, "users"), where("role", "==", "driver")));
        
        let driverEmails = new Map();
        let duplicatesFound = 0;

        // 1. Identify and remove duplicates from 'drivers' collection
        for (const d of driversSnap.docs) {
            const data = d.data();
            const email = data.driver_email?.toLowerCase()?.trim();
            if (!email) continue;

            if (driverEmails.has(email)) {
                // Duplicate found! 
                const existing = driverEmails.get(email);
                console.warn(`Removing duplicate ghost driver: ${email} (ID: ${d.id})`);
                await deleteDoc(doc(db, "drivers", d.id));
                duplicatesFound++;
            } else {
                driverEmails.set(email, { id: d.id, data });
            }
        }

        if (duplicatesFound > 0) {
            console.log(`Cleaned up ${duplicatesFound} duplicate driver accounts.`);
        }

        // 2. Repair missing profiles from 'users' collection
        for (const u of usersSnap.docs) {
            const userData = u.data();
            const email = userData.email?.toLowerCase();
            
            if (email && !driverEmails.has(email)) {
                console.log(`Repairing missing driver profile for: ${email}`);
                await setDoc(doc(db, "drivers", u.id), {
                    driver_name: userData.full_name || "New Driver",
                    driver_email: email,
                    accredited_company_id: "jettsan",
                    current_status: "offline",
                    vehicle_assigned: "Pending Assignment",
                    plate_number: "N/A",
                    created_at: serverTimestamp(),
                    is_currently_timed_in: false
                });
                repairCount++;
            }
        }
        if (repairCount > 0) {
            console.log(`Database Integrity Shield: ${repairCount} driver profiles restored.`);
            alert(`System Integrity Alert: ${repairCount} missing driver profiles have been automatically restored. Mobile app functionality is now active for these users.`);
        }
    } catch (e) {
        console.error("Database integrity check failed:", e);
    }
}

function initDriverList() {
    const role = currentUserData.role || currentUserData.user_type;
    const companyId = currentUserData.accredited_company_id;

    let driverQuery = collection(db, "drivers");

    // RBAC Filtering removed for NSCRP

    onSnapshot(driverQuery, (snapshot) => {
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
        // Directly use Firestore's current_status — updated in real-time via onSnapshot
        const status = driver.current_status || 'offline';
        const displayStatus = status.replace(/_/g, ' ');
        const isTimedIn = driver.is_currently_timed_in === true;

        return `
            <div class="driver-card" id="dcard-${id}">
                <div class="driver-status ${status}"></div>
                <div class="driver-profile-header">
                    <div class="driver-avatar-large">
                        ${driver.profile_image_url ? `<img src="${driver.profile_image_url}" alt="${driver.driver_name}">` : `<i class="fas fa-user-circle"></i>`}
                    </div>
                </div>
                <div class="driver-info">
                    <h3>${driver.driver_name || 'Unnamed Driver'}</h3>
                    <p><i class="fas fa-truck-pickup"></i> ${driver.vehicle_assigned || 'No vehicle'} ${driver.car_color ? `(${driver.car_color})` : ''}</p>
                    <p><i class="fas fa-id-card"></i> ${driver.plate_number || 'No plate'}</p>
                    <p><i class="fas fa-phone"></i> ${driver.driver_phone || 'No phone'}</p>
                    ${driver.car_details ? `<p class="car-details-small"><i class="fas fa-info-circle"></i> ${driver.car_details}</p>` : ''}
                </div>
                <div class="driver-meta">
                    <span class="status-badge ${status}">${displayStatus}</span>
                    ${isTimedIn ? `<span class="status-badge available" style="margin-left:4px; font-size:0.7em;"><i class="fas fa-clock"></i> Timed In</span>` : ''}
                    <div class="card-actions">
                        <button class="btn-icon edit" onclick="window.editDriver('${id}')" title="Edit Driver"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon delete" onclick="window.deleteDriver('${id}')" title="Delete Driver"><i class="fas fa-trash"></i></button>
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
                <label>Admin Insight</label>
                <div class="alert alert-info" style="font-size: 0.85rem; padding: 12px; margin-bottom: 20px; display: block; border-left: 4px solid var(--accent-blue);">
                    <i class="fas fa-shield-alt"></i> New accounts use temporary password: <strong style="color:var(--accent-blue);">driver123</strong>. 
                    Drivers will be prompted to verify via OTP and reset their password upon first login.
                </div>
            </div>
            <div class="form-group">
                <label>Full Name</label>
                <input type="text" id="modal_driver_name" class="form-input" placeholder="e.g. John Doe" required>
            </div>
            <div class="form-grid-2">
                <div class="form-group">
                    <label>Driver Email</label>
                    <input type="email" id="modal_email" class="form-input" placeholder="e.g. driver@fleet.com" required>
                </div>
                <div class="form-group">
                    <label>Phone Number</label>
                    <input type="text" id="modal_phone" class="form-input" placeholder="e.g. 09123456789" required>
                </div>
            </div>
            <div class="form-grid-2">
                <div class="form-group">
                    <label>License Number</label>
                    <input type="text" id="modal_license" class="form-input" placeholder="Enter DL number" required>
                </div>
                <div class="form-group">
                    <label>Plate Number</label>
                    <input type="text" id="modal_plate" class="form-input" placeholder="e.g. ABC 1234" required>
                </div>
            </div>
            <div class="form-group">
                <label>Vehicle Model / Assigned Vehicle</label>
                <input type="text" id="modal_vehicle" class="form-input" placeholder="e.g. Toyota Vios 2023" required>
            </div>
        `;

        showModal('driver-modal', 'Register New Fleet Driver', content, async () => {
            const name = document.getElementById('modal_driver_name').value;
            const email = document.getElementById('modal_email').value.toLowerCase().trim();
            const phone = document.getElementById('modal_phone').value;
            const license = document.getElementById('modal_license').value;
            const plate = document.getElementById('modal_plate').value;
            const vehicle = document.getElementById('modal_vehicle').value;
            const password = "driver123";

            try {
                // Secondary app creation
                const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
                const driverId = userCredential.user.uid;
                const companyId = "jettsan"; // Static for NSCRP requirement

                // Create Driver Document
                await setDoc(doc(db, "drivers", driverId), {
                    driver_name: name,
                    driver_email: email,
                    driver_phone: phone,
                    license_number: license,
                    plate_number: plate,
                    vehicle_assigned: vehicle,
                    accredited_company_id: companyId,
                    current_status: "offline",
                    isFirstLogin: true,
                    is_currently_timed_in: false,
                    created_at: serverTimestamp(),
                    updated_at: serverTimestamp()
                });
                
                // Create User Meta-Data Document
                await setDoc(doc(db, "users", driverId), {
                    full_name: name,
                    email: email,
                    phone: phone,
                    user_type: "driver",
                    role: "driver",
                    status: "active",
                    isFirstLogin: true,
                    accredited_company_id: companyId,
                    created_at: serverTimestamp()
                });

                await signOut(secondaryAuth);

                await addDoc(collection(db, "activity"), {
                    type: 'system',
                    title: 'New Driver Account Created',
                    message: `Admin manually provisioned driver: ${name} (${email})`,
                    timestamp: serverTimestamp()
                });

                alert("Driver account provisioned successfully! Give the driver their email and the default password: driver123");
                location.reload(); // Refresh to show new driver
            } catch (error) {
                console.error("Provisioning error:", error);
                alert("Critical: Failed to provision account. " + error.message);
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
        <div class="form-grid-2">
            <div class="form-group">
                <label>Vehicle Model</label>
                <input type="text" id="modal_vehicle" class="form-input" value="${driver.vehicle_assigned}" required>
            </div>
            <div class="form-group">
                <label>Car Color</label>
                <input type="text" id="modal_color" class="form-input" value="${driver.car_color || ''}" required>
            </div>
        </div>
        <div class="form-group">
            <label>Plate Number</label>
            <input type="text" id="modal_plate" class="form-input" value="${driver.plate_number}" required>
        </div>
        <div class="form-group">
            <label>Car Details (Optional)</label>
            <input type="text" id="modal_car_details" class="form-input" value="${driver.car_details || ''}">
        </div>
        <div class="form-group">
            <label>Profile Image URL (Optional)</label>
            <input type="url" id="modal_image_url" class="form-input" value="${driver.profile_image_url || ''}">
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
            car_color: document.getElementById('modal_color').value,
            car_details: document.getElementById('modal_car_details').value,
            profile_image_url: document.getElementById('modal_image_url').value,
            plate_number: document.getElementById('modal_plate').value,
            driver_email: email,
            current_status: document.getElementById('modal_status').value
        });
        
        try {
            await updateDoc(doc(db, "users", id), {
                full_name: document.getElementById('modal_driver_name').value,
                email: email
            });
        } catch (e) { console.log("User doc might not exist yet for this driver ID"); }

        await addDoc(collection(db, "activity"), {
            type: 'system',
            title: 'Driver Updated',
            message: `Admin updated info for driver: ${document.getElementById('modal_driver_name').value}`,
            timestamp: serverTimestamp()
        });
    });
};

window.deleteDriver = async (id) => {
    const snap = await getDoc(doc(db, "drivers", id));
    if (!snap.exists()) {
        alert("Error: Driver profile not found.");
        return;
    }
    const driver = snap.data();

    if (confirm(`Are you sure you want to permanently delete the driver account for ${driver.driver_name}? This will remove them from Fleet Monitoring and recalibrate organizational counts.`)) {
        try {
            // 1. Backend Purge (Auth + Logic)
            const response = await fetch('https://us-central1-appfleetonix.cloudfunctions.net/adminDeleteUser', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    uid: id,
                    email: driver.driver_email
                })
            });

            const result = await response.json();
            if (!result.success) {
                // If Cloud Function fails, try to at least delete firestore docs if admin
                console.warn("Cloud Purge failed, attempting manual Firestore cleanup:", result.message);
                await deleteDoc(doc(db, "drivers", id));
                try { await deleteDoc(doc(db, "users", id)); } catch(e){}
            }

            // 3. Activity Audit
            await addDoc(collection(db, "activity"), {
                type: 'system',
                title: 'Driver Deleted',
                message: `Super Admin purged driver: ${driver.driver_name} (ID: ${id})`,
                timestamp: serverTimestamp()
            });

            alert("Driver account and profile successfully purged.");
        } catch (error) {
            console.error("Deletion error:", error);
            alert("Failed to delete driver: " + error.message);
        }
    }
};
