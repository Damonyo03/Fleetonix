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
const brandSearch = document.getElementById('brandSearch');
const colorSearch = document.getElementById('colorSearch');
const typeFilter = document.getElementById('typeFilter');
const statusFilter = document.getElementById('statusFilter');

let currentUserData = null;
let allDrivers = [];

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../login.html';
        return;
    }

    const userDoc = await getDoc(doc(db, "users", user.uid));
    currentUserData = userDoc.exists() ? userDoc.data() : { role: 'admin' };
    document.getElementById('adminDisplayName').textContent = currentUserData.full_name || "Administrator";

    initDriverList();
});

function initDriverList() {
    onSnapshot(collection(db, "drivers"), (snapshot) => {
        allDrivers = snapshot.docs;
        applyFilters();
    });

    [driverSearch, brandSearch, colorSearch, typeFilter, statusFilter].forEach(el => {
        if (el) el.addEventListener('input', applyFilters);
    });
}

function applyFilters() {
    if (!driverGrid) return;
    const search = driverSearch?.value.toLowerCase() || "";
    const brand = brandSearch?.value.toLowerCase() || "";
    const color = colorSearch?.value.toLowerCase() || "";
    const type = typeFilter?.value || "all";
    const status = statusFilter?.value || "all";

    const filtered = allDrivers.filter(d => {
        const data = d.data();
        const matchesSearch = (data.driver_name || '').toLowerCase().includes(search) || (data.plate_number || '').toLowerCase().includes(search);
        const matchesBrand = !brand || (data.vehicle_assigned || '').toLowerCase().includes(brand);
        const matchesColor = !color || (data.car_color || '').toLowerCase().includes(color);
        const matchesType = type === 'all' || (data.car_details || '').includes(`${type}-seater`);
        const matchesStatus = status === 'all' || data.current_status === status;
        
        return matchesSearch && matchesBrand && matchesColor && matchesType && matchesStatus;
    });
    renderDrivers(filtered);
}

function renderDrivers(docs) {
    if (docs.length === 0) {
        driverGrid.innerHTML = '<div class="glass-card" style="grid-column: 1/-1; text-align: center; padding: 40px;">No drivers match your filters.</div>';
        return;
    }

    driverGrid.innerHTML = docs.map(d => {
        const driver = d.data();
        const id = d.id;
        const status = driver.current_status || 'offline';
        const displayStatus = status.replace(/_/g, ' ');
        return `
            <div class="driver-card" style="background: var(--glass-bg); backdrop-filter: blur(12px); border-radius: var(--radius-lg); border: 1px solid var(--glass-border); padding: 24px; position: relative;">
                <div class="status-dot ${status}"></div>
                <div class="driver-header" style="display: flex; gap: 16px; align-items: center; margin-bottom: 16px;">
                    <div class="avatar-large" style="width: 64px; height: 64px; border-radius: 50%; overflow: hidden; border: 2px solid var(--accent-blue);">
                        ${driver.profile_image_url ? `<img src="${driver.profile_image_url}" style="width:100%; height:100%; object-fit:cover;">` : `<i class="fas fa-user-circle" style="font-size: 64px; color: var(--border-color);"></i>`}
                    </div>
                    <div>
                        <h3 style="margin: 0; font-size: 1.1rem; font-weight: 700;">${driver.driver_name}</h3>
                        <p style="margin: 2px 0 0; font-size: 0.8rem; color: var(--accent-blue);"><i class="fas fa-id-card"></i> ${driver.plate_number}</p>
                    </div>
                </div>
                <div class="driver-stats-mini">
                    <div class="stat-box">
                        <span>Vehicle</span>
                        <strong>${driver.vehicle_assigned || 'N/A'}</strong>
                    </div>
                    <div class="stat-box">
                        <span>Type</span>
                        <strong>${(driver.car_details || '').match(/\d-seater/) ? driver.car_details.match(/\d-seater/)[0] : 'Standard'}</strong>
                    </div>
                </div>
                <div style="margin-top: 16px; display: flex; justify-content: space-between; align-items: center;">
                    <span class="status-badge ${status}" style="text-transform: capitalize;">${displayStatus}</span>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-icon" onclick="window.editDriver('${id}')" style="background: rgba(0,212,255,0.1); color: var(--accent-blue); border: none; padding: 8px; border-radius: 6px;"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon" onclick="window.deleteDriver('${id}')" style="background: rgba(255,71,87,0.1); color: var(--accent-error); border: none; padding: 8px; border-radius: 6px;"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// --- Driver Modal Helper ---
function getDriverFormContent(driver = {}) {
    return `
        <div class="form-group" style="text-align: center; margin-bottom: 24px;">
            <div id="image-drop-zone" style="width: 120px; height: 120px; border-radius: 50%; border: 2px dashed var(--accent-blue); margin: 0 auto 12px; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; background: rgba(0,212,255,0.05); cursor: pointer;">
                ${driver.profile_image_url ? `<img id="preview-image" src="${driver.profile_image_url}" style="width:100%; height:100%; object-fit:cover;">` : `<i class="fas fa-camera" style="font-size: 2rem; color: var(--accent-blue);"></i>`}
                <div style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.5); font-size: 0.65rem; color: white; padding: 4px;">Update</div>
            </div>
            <input type="file" id="driver-image-input" accept="image/*" style="display: none;">
            <p style="font-size: 0.75rem; color: var(--text-muted);">Drag and drop or click to upload photo</p>
            <div id="cropper-container" style="display:none; margin-top: 12px;">
                <img id="cropper-image" style="max-width: 100%;">
                <button type="button" class="btn btn-primary" id="crop-confirm" style="margin-top: 10px; width: 100%;">Crop & Apply</button>
            </div>
        </div>

        <div class="form-group">
            <label>Driver Full Name</label>
            <input type="text" id="modal_name" class="form-input" value="${driver.driver_name || ''}" required placeholder="John Doe">
        </div>
        
        <div class="form-grid-2">
            <div class="form-group">
                <label>Plate Number</label>
                <input type="text" id="modal_plate" class="form-input" value="${driver.plate_number || ''}" required placeholder="ABC 1234">
            </div>
            <div class="form-group">
                <label>Car Color</label>
                <input type="text" id="modal_color" class="form-input" value="${driver.car_color || ''}" placeholder="e.g. Metallic White">
            </div>
        </div>

        <div class="form-grid-2">
            <div class="form-group">
                <label>Car Brand & Model</label>
                <input type="text" id="modal_vehicle" class="form-input" value="${driver.vehicle_assigned || ''}" required placeholder="Toyota Innova">
            </div>
            <div class="form-group">
                <label>Car Type</label>
                <select id="modal_type" class="form-input">
                    <option value="4-seater" ${(driver.car_details || '').includes('4-seater') ? 'selected' : ''}>4-Seater Sedan/SUV</option>
                    <option value="6-seater" ${(driver.car_details || '').includes('6-seater') ? 'selected' : ''}>6-Seater MPV/Large SUV</option>
                </select>
            </div>
        </div>

        <div class="form-group">
            <label>License Number</label>
            <input type="text" id="modal_license" class="form-input" value="${driver.license_number || ''}" required>
        </div>

        <div class="form-group">
            <label>Mobile Number</label>
            <input type="text" id="modal_phone" class="form-input" value="${driver.driver_phone || ''}" required placeholder="09xxxxxxxxx">
        </div>

        ${driver.driver_email ? `
        <div class="form-group">
            <label>Driver Email (Read-only)</label>
            <input type="email" class="form-input" value="${driver.driver_email}" readonly style="opacity: 0.6; cursor: not-allowed;">
        </div>
        ` : `
        <div class="form-group">
            <label>Driver Email (Account login)</label>
            <input type="email" id="modal_email" class="form-input" required placeholder="driver@fleetonix.com">
        </div>
        `}

        <div class="form-group">
            <label>Operating Status</label>
            <div class="alert alert-info" style="font-size: 0.8rem; background: rgba(0, 212, 255, 0.05); border: 1px dashed var(--accent-blue); padding: 10px;">
                <i class="fas fa-sync"></i> Current Status: <strong style="color: var(--accent-blue); text-transform: uppercase;">${(driver.current_status || 'Offline').replace('_',' ')}</strong>
                <p style="margin: 4px 0 0; font-size: 0.7rem; color: var(--text-muted);">This status is strictly synchronized with the Driver's Android application activity and cannot be modified manually.</p>
            </div>
        </div>
        <input type="hidden" id="cropped_image_base64">
    `;
}

function initModalCropper() {
    const dropZone = document.getElementById('image-drop-zone');
    const input = document.getElementById('driver-image-input');
    const cropperContainer = document.getElementById('cropper-container');
    const cropperImage = document.getElementById('cropper-image');
    let cropperInstance = null;

    dropZone.onclick = () => input.click();

    // Drag and Drop implementation
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--accent-green)';
        dropZone.style.background = 'rgba(16, 185, 129, 0.1)';
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.style.borderColor = 'var(--accent-blue)';
        dropZone.style.background = 'rgba(0, 212, 255, 0.05)';
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--accent-blue)';
        dropZone.style.background = 'rgba(0, 212, 255, 0.05)';
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            handleFile(file);
        }
    });

    const handleFile = (file) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            cropperContainer.style.display = 'block';
            cropperImage.src = event.target.result;
            
            if (cropperInstance) cropperInstance.destroy();
            cropperInstance = new Cropper(cropperImage, {
                aspectRatio: 1,
                viewMode: 1,
                autoCropArea: 1,
            });
        };
        reader.readAsDataURL(file);
    };

    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) handleFile(file);
    };

    document.getElementById('crop-confirm').onclick = () => {
        const canvas = cropperInstance.getCroppedCanvas({ width: 256, height: 256 });
        document.getElementById('preview-image').src = canvas.toDataURL();
        document.getElementById('cropped_image_base64').value = canvas.toDataURL();
        cropperContainer.style.display = 'none';
        cropperInstance.destroy();
    };
}


window.editDriver = async (id) => {
    const snap = await getDoc(doc(db, "drivers", id));
    if (!snap.exists()) return;
    const driver = snap.data();

    showModal('edit-driver-modal', `Edit Asset: ${driver.driver_name}`, getDriverFormContent(driver), async () => {
        const croppedImg = document.getElementById('cropped_image_base64').value;
        const updateData = {
            driver_name: document.getElementById('modal_name').value,
            plate_number: document.getElementById('modal_plate').value,
            car_color: document.getElementById('modal_color').value,
            vehicle_assigned: document.getElementById('modal_vehicle').value,
            car_details: document.getElementById('modal_type').value,
            license_number: document.getElementById('modal_license').value,
            driver_phone: document.getElementById('modal_phone').value,
            updated_at: serverTimestamp()
        };
        if (croppedImg) updateData.profile_image_url = croppedImg;

        await updateDoc(doc(db, "drivers", id), updateData);
        alert("Profile updated successfully!");
    });
    setTimeout(initModalCropper, 100);
};

const addDriverBtn = document.getElementById('addDriverBtn');
if (addDriverBtn) {
    addDriverBtn.onclick = () => {
        showModal('add-driver-modal', 'Onboard New Driver', getDriverFormContent(), async () => {
            const email = document.getElementById('modal_email').value.toLowerCase().trim();
            const password = "driver123";
            const name = document.getElementById('modal_name').value;

            try {
                const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
                const uid = userCredential.user.uid;
                const croppedImg = document.getElementById('cropped_image_base64').value;

                await setDoc(doc(db, "drivers", uid), {
                    driver_name: name,
                    driver_email: email,
                    driver_phone: document.getElementById('modal_phone').value,
                    plate_number: document.getElementById('modal_plate').value,
                    car_color: document.getElementById('modal_color').value,
                    vehicle_assigned: document.getElementById('modal_vehicle').value,
                    car_details: document.getElementById('modal_type').value,
                    license_number: document.getElementById('modal_license').value,
                    profile_image_url: croppedImg || "",
                    current_status: "offline",
                    isFirstLogin: true,
                    created_at: serverTimestamp()
                });

                await setDoc(doc(db, "users", uid), {
                    full_name: name,
                    email: email,
                    user_type: "driver",
                    role: "driver",
                    status: "active",
                    isFirstLogin: true,
                    created_at: serverTimestamp()
                });

                await signOut(secondaryAuth);
                alert("Driver onboarded! Temporary password is: driver123");
                location.reload();
            } catch (err) {
                alert("Onboarding failed: " + err.message);
            }
        });
        setTimeout(initModalCropper, 100);
    };
}

window.deleteDriver = async (id) => {
    if (confirm("Permanently remove this driver and their assets? This action cannot be undone.")) {
        await deleteDoc(doc(db, "drivers", id));
        alert("Driver removed from system.");
    }
};

