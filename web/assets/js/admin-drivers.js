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

    const adminRoles = ['admin', 'super_admin', 'company_admin'];
    const role = userData?.user_type || userData?.role;

    if (!userData || !adminRoles.includes(role)) {
        console.error("Access Denied: Not an administrator.");
        window.location.href = '../login.html?error=unauthorized';
        return;
    }

    currentUserData = userData;
    const name = userData.full_name || user.email.split('@')[0];
    initLayout('Driver Management', name);

    // Fetch companies
    if (role === 'super_admin' || role === 'admin') {
        const companiesSnap = await getDocs(query(collection(db, "accredited_companies"), where("status", "==", "active")));
        const filter = document.getElementById('companyFilter');
        companiesSnap.forEach(doc => {
            activeCompanies[doc.id] = doc.data().name;
            if (filter) {
                const option = document.createElement('option');
                option.value = doc.id;
                option.textContent = doc.data().name;
                filter.appendChild(option);
            }
        });
        if (filter) filter.addEventListener('change', applyFilters);
    }

    initDriverList();
    
    // Integrity Check (Super Admin only can auto-repair)
    if (role === 'super_admin' || role === 'admin') {
        setTimeout(repairMissingDriverProfiles, 2000);
    }
});

async function repairMissingDriverProfiles() {
    console.log("Analyzing driver database integrity...");
    try {
        const usersSnap = await getDocs(query(collection(db, "users"), where("role", "==", "driver")));
        const driversSnap = await getDocs(collection(db, "drivers"));
        const existingDriverIds = new Set(driversSnap.docs.map(d => d.id));
        
        let repairCount = 0;
        for (const userDoc of usersSnap.docs) {
            if (!existingDriverIds.has(userDoc.id)) {
                console.log(`Incomplete Profile detected for: ${userDoc.data().full_name}. Repairing...`);
                const data = userDoc.data();
                await setDoc(doc(db, "drivers", userDoc.id), {
                    driver_name: data.full_name || "Repair Entry",
                    driver_email: data.email || "",
                    accredited_company_id: data.accredited_company_id || "",
                    current_status: "offline",
                    vehicle_assigned: "Pending Setup",
                    plate_number: "TBD-0000",
                    is_repaired: true,
                    created_at: serverTimestamp()
                });
                repairCount++;
            }
        }
        if (repairCount > 0) {
            console.log(`Database Integrity Shield: ${repairCount} driver profiles restored.`);
            alert(`System Integrity Alert: ${repairCount} missing driver profiles have been automatically restored. Mobile app functionality is now active for these users.`);
        }
    } catch (error) {
        console.error("Integrity shield error:", error);
    }
}

function initDriverList() {
    const role = currentUserData.role || currentUserData.user_type;
    const companyId = currentUserData.accredited_company_id;

    let driverQuery = collection(db, "drivers");

    // RBAC Filtering
    if (role === 'company_admin' && companyId) {
        driverQuery = query(collection(db, "drivers"), where("accredited_company_id", "==", companyId));
    }

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
    const company = document.getElementById('companyFilter')?.value || 'all';

    const filtered = allDrivers.filter(d => {
        const data = d.data();
        const matchesSearch = (data.driver_name || '').toLowerCase().includes(searchTerm) || 
                             (data.plate_number || '').toLowerCase().includes(searchTerm) || 
                             (data.vehicle_assigned || '').toLowerCase().includes(searchTerm);
        const matchesStatus = status === 'all' || data.current_status === status;
        const matchesCompany = company === 'all' || data.accredited_company_id === company;
        return matchesSearch && matchesStatus && matchesCompany;
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
        const displayStatus = status.replace('_', ' ');
        return `
            <div class="driver-card">
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
                <label>Driver Name</label>
                <input type="text" id="modal_driver_name" class="form-input" required>
            </div>
            <div class="form-grid-2">
                <div class="form-group">
                    <label>Vehicle Model</label>
                    <input type="text" id="modal_vehicle" class="form-input" placeholder="e.g. Toyota Vios" required>
                </div>
                <div class="form-group">
                    <label>Car Color</label>
                    <input type="text" id="modal_color" class="form-input" placeholder="e.g. White" required>
                </div>
            </div>
            <div class="form-group">
                <label>Plate Number</label>
                <input type="text" id="modal_plate" class="form-input" required>
            </div>
            <div class="form-group">
                <label>Car Details (Optional)</label>
                <input type="text" id="modal_car_details" class="form-input" placeholder="e.g. Manual, 2023 Model">
            </div>
            <div class="form-group">
                <label>Profile Image URL (Optional)</label>
                <input type="url" id="modal_image_url" class="form-input" placeholder="https://example.com/image.jpg">
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
            ${(currentUserData.role === 'super_admin' || currentUserData.role === 'admin') ? `
            <div class="form-group">
                <label>Accredited Company</label>
                <select id="modal_accredited_company_id" class="form-input" required>
                    <option value="">-- Select Company --</option>
                    ${Object.entries(activeCompanies).map(([id, name]) => `<option value="${id}">${name}</option>`).join('')}
                </select>
            </div>` : ''}
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
                const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
                const driverId = userCredential.user.uid;

                const role = currentUserData.role || currentUserData.user_type;
                const companyId = (role === 'super_admin' || role === 'admin') 
                    ? document.getElementById('modal_accredited_company_id').value 
                    : currentUserData.accredited_company_id;

                await setDoc(doc(db, "drivers", driverId), {
                    driver_name: name,
                    vehicle_assigned: vehicle,
                    car_color: document.getElementById('modal_color').value,
                    car_details: document.getElementById('modal_car_details').value || "",
                    profile_image_url: document.getElementById('modal_image_url').value || "",
                    plate_number: plate,
                    driver_phone: phone,
                    driver_email: email,
                    accredited_company_id: companyId || "",
                    current_status: "offline",
                    created_at: serverTimestamp()
                });
                
                await setDoc(doc(db, "users", driverId), {
                    full_name: name,
                    email: email,
                    user_type: "driver",
                    role: "driver",
                    accredited_company_id: companyId || "",
                    status: "active",
                    created_at: serverTimestamp()
                });

                // Update Company Driver Counter if applicable
                if (companyId) {
                    const companyDoc = await getDoc(doc(db, "accredited_companies", companyId));
                    if (companyDoc.exists()) {
                        await updateDoc(doc(db, "accredited_companies", companyId), {
                            total_drivers: (companyDoc.data().total_drivers || 0) + 1,
                            updated_at: serverTimestamp()
                        });
                    }
                }

                await signOut(secondaryAuth);

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
    if (confirm("Are you sure you want to delete this driver?")) {
        await deleteDoc(doc(db, "drivers", id));
        
        await addDoc(collection(db, "activity"), {
            type: 'system',
            title: 'Driver Deleted',
            message: `Admin deleted driver (ID: ${id})`,
            timestamp: serverTimestamp()
        });
    }
};
