import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot, doc, getDoc, updateDoc, deleteDoc, setDoc, addDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadString, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js";
import { initLayout, showModal, hideModal } from "./modules/ui.js";

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

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
    // initLayout handles header display

    initDriverList();
});

function initDriverList() {
    // 1. Listen to the Assets (drivers collection)
    onSnapshot(collection(db, "drivers"), (snapshot) => {
        allDrivers = snapshot.docs;
        applyFilters();
    });

    // 2. Cross-reference with the Users collection to find "Orphan" drivers
    // This solves the issue where existing drivers are not being "read" because they lack an asset profile.
    onSnapshot(query(collection(db, "users"), where("role", "==", "driver")), async (snapshot) => {
        const onboardedUids = allDrivers.map(d => d.id);
        const orphanDocs = snapshot.docs.filter(doc => !onboardedUids.includes(doc.id));

        if (orphanDocs.length > 0) {
            console.log(`Found ${orphanDocs.length} orphan drivers. Auto-provisioning basic asset profiles...`);
            for (const userDoc of orphanDocs) {
                const userData = userDoc.data();
                try {
                    await setDoc(doc(db, "drivers", userDoc.id), {
                        driver_name: userData.full_name || userData.fullName || 'Fleet Driver',
                        driver_email: userData.email?.toLowerCase()?.trim() || '',
                        driver_phone: userData.phone || '09xxxxxxxxx',
                        plate_number: 'PENDING',
                        car_color: 'N/A',
                        vehicle_assigned: 'Unassigned',
                        car_details: 'Standard',
                        license_number: 'PENDING',
                        current_status: "offline",
                        isAutoProvisioned: true,
                        created_at: serverTimestamp()
                    });
                } catch (e) {
                    console.error("Auto-provisioning failed for:", userDoc.id, e);
                }
            }
        }
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
                        <span>Odometer</span>
                        <strong>${(driver.current_mileage || 0).toFixed(2)} KM</strong>
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
                <label>Actual Odometer (KM)</label>
                <input type="number" step="0.01" id="modal_mileage" class="form-input" value="${driver.current_mileage || 0}" required>
            </div>
        </div>

        <div class="form-grid-2">
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
        <div class="form-grid-2">
            <div class="form-group">
                <label>Driver Email (Account login)</label>
                <input type="email" id="modal_email" class="form-input" required placeholder="driver@fleetonix.com">
            </div>
            <div class="form-group">
                <label>Set Temporary Password</label>
                <input type="text" id="modal_password" class="form-input" required placeholder="Minimum 6 chars">
            </div>
        </div>
        `}

        <div class="form-group">
            <label>Operating Status</label>
            <div class="alert" id="status-alert-box" style="font-size: 0.8rem; padding: 10px; border-radius: 8px; border: 1px dashed">
                <i class="fas fa-sync"></i> Current Status: <strong id="status-text-val" style="text-transform: uppercase;">${(driver.current_status || 'Offline').replace('_',' ')}</strong>
                <p style="margin: 4px 0 0; font-size: 0.7rem; color: var(--text-muted);">This status is synchronized with the Driver's Android application activity.</p>
            </div>
            <script>
                (function() {
                    const status = "${driver.current_status || 'offline'}".toLowerCase();
                    const box = document.getElementById('status-alert-box');
                    const text = document.getElementById('status-text-val');
                    let color = 'var(--accent-blue)';
                    if (status === 'available' || status === 'online') color = 'var(--accent-green)';
                    else if (status.includes('pickup')) color = 'var(--accent-orange)';
                    else if (status.includes('dropoff') || status === 'busy') color = 'var(--accent-teal-bright)';
                    else if (status.includes('completed')) color = 'var(--accent-emerald)';
                    else if (status === 'offline') color = 'var(--accent-stale)';
                    
                    box.style.borderColor = color;
                    box.style.background = color.replace('var(', 'rgba(').replace(')', ', 0.05)');
                    if (box.style.background.startsWith('var')) { // Fallback for raw var replacement if not simple
                         box.style.backgroundColor = 'rgba(255,255,255,0.02)';
                    }
                    text.style.color = color;
                })();
            </script>
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
            
            if (cropperInstance) {
                cropperInstance.destroy();
                cropperInstance = null;
            }
            if (typeof Cropper === 'undefined') {
                console.error("Cropper library not loaded");
                return;
            }
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
        if (!cropperInstance) return;
        const canvas = cropperInstance.getCroppedCanvas({ width: 256, height: 256 });
        const dataUrl = canvas.toDataURL();
        
        let previewImg = document.getElementById('preview-image');
        if (!previewImg) {
            // Replace placeholder with img
            const placeholder = document.getElementById('preview-placeholder');
            if (placeholder) {
                previewImg = document.createElement('img');
                previewImg.id = 'preview-image';
                previewImg.style.width = '100px';
                previewImg.style.height = '100px';
                previewImg.style.borderRadius = '50%';
                previewImg.style.objectFit = 'cover';
                previewImg.style.border = '2px solid var(--accent-blue)';
                placeholder.parentNode.replaceChild(previewImg, placeholder);
            }
        }
        
        if (previewImg) previewImg.src = dataUrl;
        document.getElementById('cropped_image_base64').value = dataUrl;
        
        cropperContainer.style.display = 'none';
        cropperInstance.destroy();
        cropperInstance = null;
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
            current_mileage: parseFloat(document.getElementById('modal_mileage').value) || 0,
            updated_at: serverTimestamp()
        };
        if (croppedImg) {
            try {
                const storageRef = ref(storage, `profile_photos/${id}.jpg`);
                await uploadString(storageRef, croppedImg, 'data_url');
                updateData.profile_image_url = await getDownloadURL(storageRef);
            } catch (e) {
                console.error("Image upload failed:", e);
                alert("Image upload failed, but other details will be saved.");
            }
        }

        await updateDoc(doc(db, "drivers", id), updateData);
        
        // SYNC: Update users collection as well
        const userUpdate = {
            full_name: updateData.driver_name,
            phone: updateData.driver_phone,
            updated_at: serverTimestamp()
        };
        if (updateData.profile_image_url) userUpdate.profile_image_url = updateData.profile_image_url;

        await updateDoc(doc(db, "users", id), userUpdate).catch(err => console.warn("Sync to users failed:", err));

        alert("Profile updated successfully!");
    });
    setTimeout(initModalCropper, 100);
};

const addDriverBtn = document.getElementById('addDriverBtn');
if (addDriverBtn) {
    addDriverBtn.onclick = () => {
        showModal('add-driver-modal', 'Onboard New Driver', getDriverFormContent(), async () => {
            const email = document.getElementById('modal_email').value.toLowerCase().trim();
            const password = document.getElementById('modal_password').value.trim();
            const name = document.getElementById('modal_name').value;

            if (password.length < 6) {
                alert("Password must be at least 6 characters.");
                return;
            }

            try {
                const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
                const uid = userCredential.user.uid;
                const croppedImg = document.getElementById('cropped_image_base64').value;
                let finalImageUrl = "";
                if (croppedImg) {
                    try {
                        const storageRef = ref(storage, `profile_photos/${uid}.jpg`);
                        await uploadString(storageRef, croppedImg, 'data_url');
                        finalImageUrl = await getDownloadURL(storageRef);
                    } catch (e) {
                        console.error("Image upload failed:", e);
                    }
                }

                await setDoc(doc(db, "drivers", uid), {
                    driver_name: name,
                    driver_email: email,
                    driver_phone: document.getElementById('modal_phone').value,
                    plate_number: document.getElementById('modal_plate').value,
                    car_color: document.getElementById('modal_color').value,
                    vehicle_assigned: document.getElementById('modal_vehicle').value,
                    car_details: document.getElementById('modal_type').value,
                    license_number: document.getElementById('modal_license').value,
                    profile_image_url: finalImageUrl,
                    current_status: "offline",
                    isFirstLogin: true,
                    created_at: serverTimestamp()
                });

                await setDoc(doc(db, "users", uid), {
                    full_name: name,
                    email: email,
                    phone: document.getElementById('modal_phone').value,
                    user_type: "driver",
                    role: "driver",
                    status: "pending_approval",
                    profile_image_url: finalImageUrl,
                    isFirstLogin: true,
                    created_at: serverTimestamp()
                });

                await signOut(secondaryAuth);
                alert(`Driver onboarded! Please provide the driver with their temporary password: ${password}`);
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
        await deleteDoc(doc(db, "users", id)).catch(err => console.warn("User deletion failed:", err));
        alert("Driver removed from system.");
    }
};

