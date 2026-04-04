import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const companyList = document.getElementById('companyList');
const addCompanyBtn = document.getElementById('addCompanyBtn');
const companyModal = document.getElementById('companyModal');
const companyForm = document.getElementById('companyForm');
const closeButtons = document.querySelectorAll('.close-modal, .close-btn');
const modalTitle = document.getElementById('modalTitle');

let currentUserRole = null;

// Auth Guard & Role Setup
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            const data = userDoc.data();
            currentUserRole = data.role || data.user_type;
            document.getElementById('adminName').textContent = data.full_name || "Administrator";
            
            // Only super_admin can add companies
            if (currentUserRole !== 'super_admin' && currentUserRole !== 'admin') {
                addCompanyBtn.style.display = 'none';
            }
        }
    }
});

// Load Companies (Real-time)
const q = query(collection(db, "accredited_companies"), orderBy("created_at", "desc"));
onSnapshot(q, (snapshot) => {
    companyList.innerHTML = '';
    if (snapshot.empty) {
        companyList.innerHTML = '<div style="text-align: center; grid-column: 1/-1; padding: 40px; color: var(--text-muted);">No companies found. Add one to get started.</div>';
        return;
    }

    snapshot.forEach((doc) => {
        const company = doc.data();
        const id = doc.id;
        const card = createCompanyCard(id, company);
        companyList.appendChild(card);
    });
});

function createCompanyCard(id, company) {
    const div = document.createElement('div');
    div.className = 'company-card';
    const statusClass = company.status === 'active' ? 'status-active' : 'status-inactive';
    
    div.innerHTML = `
        <div class="company-header">
            <div>
                <div class="company-name">${company.name}</div>
                <span class="company-shorthand">${company.shorthand || 'N/A'}</span>
            </div>
            <span class="company-status ${statusClass}">${company.status}</span>
        </div>
        
        <div class="company-stats" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; padding: 12px; background: rgba(255,255,255,0.03); border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
            <div style="text-align: center;">
                <span style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; display: block;">Drivers</span>
                <strong style="font-size: 1.1rem; color: var(--accent-orange);">${company.total_drivers || 0}</strong>
            </div>
            <div style="text-align: center; border-left: 1px solid var(--border-color);">
                <span style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; display: block;">Staff</span>
                <strong style="font-size: 1.1rem; color: var(--accent-blue);">${company.total_staff || 0}</strong>
            </div>
        </div>

        <div style="display: flex; gap: 10px; margin-top: 15px;">
            <button class="btn btn-secondary btn-sm edit-btn" data-id="${id}" style="padding: 6px 12px; font-size: 0.8rem; width: 100%;">
                <i class="fas fa-edit"></i> Edit
            </button>
            ${(currentUserRole === 'super_admin' || currentUserRole === 'admin') ? `
            <button class="btn btn-danger btn-sm delete-btn" data-id="${id}" style="padding: 6px 12px; font-size: 0.8rem; background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); width: 100%;">
                <i class="fas fa-trash"></i> Delete
            </button>` : ''}
        </div>
    `;

    // Edit Event
    div.querySelector('.edit-btn').addEventListener('click', () => openEditModal(id, company));
    
    // Delete Event
    if (div.querySelector('.delete-btn')) {
        div.querySelector('.delete-btn').addEventListener('click', () => deleteCompany(id, company.name));
    }

    return div;
}

// Modal Handlers
addCompanyBtn.onclick = () => {
    modalTitle.textContent = 'Add New Company';
    companyForm.reset();
    document.getElementById('companyId').value = '';
    companyModal.style.display = 'block';
};

closeButtons.forEach(btn => {
    btn.onclick = () => companyModal.style.display = 'none';
});

window.onclick = (e) => {
    if (e.target == companyModal) companyModal.style.display = 'none';
};

async function openEditModal(id, company) {
    modalTitle.textContent = 'Edit Company';
    document.getElementById('companyId').value = id;
    document.getElementById('name').value = company.name;
    document.getElementById('shorthand').value = company.shorthand || '';
    document.getElementById('status').value = company.status || 'active';
    companyModal.style.display = 'block';
}

// Form Submission
companyForm.onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('companyId').value;
    const name = document.getElementById('name').value;
    const shorthand = document.getElementById('shorthand').value;
    const status = document.getElementById('status').value;

    try {
        if (id) {
            // Update
            await updateDoc(doc(db, "accredited_companies", id), {
                name, shorthand, status,
                updated_at: serverTimestamp()
            });
            alert("Company updated successfully!");
        } else {
            // Create
            await addDoc(collection(db, "accredited_companies"), {
                name, shorthand, status,
                total_drivers: 0,
                total_staff: 0,
                created_at: serverTimestamp(),
                updated_at: serverTimestamp()
            });
            alert("Company added successfully!");
        }
        companyModal.style.display = 'none';
    } catch (error) {
        console.error("Error saving company:", error);
        alert("Failed to save company: " + error.message);
    }
};

async function deleteCompany(id, name) {
    if (confirm(`Are you sure you want to delete ${name}? This may impact existing users linked to this company.`)) {
        try {
            await deleteDoc(doc(db, "accredited_companies", id));
            alert("Company deleted successfully.");
        } catch (error) {
            console.error("Error deleting company:", error);
            alert("Failed to delete company.");
        }
    }
}
