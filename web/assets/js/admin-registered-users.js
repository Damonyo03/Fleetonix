import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    getFirestore, collection, query, onSnapshot, doc, getDoc, orderBy, addDoc, getDocs, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { initLayout, showModal } from "./modules/ui.js";

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

let allUsers = [];
let currentUserRole = null;
let currentAccreditedCompanyId = null;

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
    currentUserRole = role;
    currentAccreditedCompanyId = userData.accredited_company_id || null;

    if (!userData || !adminRoles.includes(role)) {
        console.error("Access Denied: Not an administrator.");
        window.location.href = '../login.html?error=unauthorized';
        return;
    }

    const name = userData.full_name || user.email.split('@')[0];
    initLayout('Registered Users', name);

    // Load all users from 'users' collection in real-time
    onSnapshot(query(collection(db, "users"), orderBy("full_name")), (snapshot) => {
        allUsers = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        applyFilters();
    });

    // Filter + Search listeners
    document.getElementById('roleFilter')?.addEventListener('change', applyFilters);
    document.getElementById('searchInput')?.addEventListener('input', applyFilters);
    document.getElementById('companyFilter')?.addEventListener('change', applyFilters);

    // Create User Button
    document.getElementById('createUserBtn')?.addEventListener('click', showCreateUserModal);
    
    // Populate Companies Filter
    initCompanyFilter();
});

async function initCompanyFilter() {
    const filter = document.getElementById('companyFilter');
    if (!filter) return;

    try {
        const companiesSnap = await getDocs(query(collection(db, "accredited_companies"), where("status", "==", "active")));
        companiesSnap.forEach(doc => {
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = doc.data().name;
            filter.appendChild(option);
        });
    } catch (error) {
        console.error("Error loading companies for filter:", error);
    }
}

function applyFilters() {
    const role   = document.getElementById('roleFilter')?.value || 'all';
    const company = document.getElementById('companyFilter')?.value || 'all';
    const search = (document.getElementById('searchInput')?.value || '').toLowerCase();

    let filtered = allUsers;
    if (role !== 'all') {
        filtered = filtered.filter(u => {
            const uRole = u.role || u.user_type || '';
            return uRole === role;
        });
    }
    if (company !== 'all') {
        filtered = filtered.filter(u => u.accredited_company_id === company);
    }
    if (search) filtered = filtered.filter(u =>
        (u.full_name || '').toLowerCase().includes(search) ||
        (u.email || '').toLowerCase().includes(search) ||
        (u.company_name || '').toLowerCase().includes(search)
    );
    renderUsers(filtered);
}

function renderUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px; color:var(--text-muted);">No users found.</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(u => {
        const role = u.role || u.user_type || 'unknown';
        const badgeColor = role === 'admin' || role === 'super_admin' ? 'var(--accent-blue)' :
                           role === 'client' ? 'var(--accent-green)' :
                           role === 'driver' ? 'var(--accent-orange)' : 'var(--text-muted)';
        const registered = u.created_at?.toDate
            ? u.created_at.toDate().toLocaleDateString('en-PH', { year:'numeric', month:'short', day:'numeric' })
            : (u.created_at ? new Date(u.created_at).toLocaleDateString('en-PH') : 'N/A');

        return `
            <tr>
                <td>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="width:32px; height:32px; border-radius:50%; background:${badgeColor}22; border:1px solid ${badgeColor}; display:flex; align-items:center; justify-content:center; font-weight:700; color:${badgeColor}; flex-shrink:0;">
                            ${(u.full_name || '?').charAt(0).toUpperCase()}
                        </div>
                        <span style="font-weight:600;">${u.full_name || '—'}</span>
                    </div>
                </td>
                <td style="color:var(--text-secondary);">${u.email || '—'}</td>
                <td>
                    <span style="background:${badgeColor}22; color:${badgeColor}; padding:3px 10px; border-radius:20px; font-size:0.8em; font-weight:700; text-transform:uppercase;">
                        ${role}
                    </span>
                </td>
                <td>${u.company_name || '—'}</td>
                <td style="color:var(--text-muted); font-size:0.85em;">${registered}</td>
                <td>
                    <div style="display: flex; gap: 8px; justify-content: flex-end;">
                        <button class="btn-icon view" title="View Details" onclick="viewUser('${u.id}')">
                            <i class="fas fa-eye"></i>
                        </button>
                        ${currentUserRole === 'super_admin' ? `
                            <button class="btn-icon delete" title="Delete User" onclick="deleteUser('${u.id}')" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2);">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

window.viewUser = async (id) => {
    const u = allUsers.find(u => u.id === id);
    if (!u) return;
    const role = u.role || u.user_type || 'unknown';

    showModal('view-user-modal', `User Profile`, `
        <div style="display:grid; gap:12px;">
            <div style="display:flex; align-items:center; gap:14px; padding-bottom:14px; border-bottom:1px solid var(--border-color);">
                <div style="width:52px; height:52px; border-radius:50%; background:var(--accent-blue); display:flex; align-items:center; justify-content:center; font-size:1.4em; font-weight:700; color:#fff; flex-shrink:0;">
                    ${(u.full_name || '?').charAt(0).toUpperCase()}
                </div>
                <div>
                    <div style="font-size:1.1em; font-weight:700; color:var(--text-primary);">${u.full_name || '—'}</div>
                    <div style="font-size:0.85em; color:var(--text-muted);">${u.email || '—'}</div>
                </div>
            </div>
            <div><strong>Role:</strong> <span style="text-transform:capitalize;">${role}</span></div>
            <div><strong>Phone:</strong> ${u.phone || u.contact_number || '—'}</div>
            <div><strong>Company:</strong> ${u.company_name || '—'}</div>
            <div><strong>Address:</strong> ${u.address || '—'}</div>
        </div>
    `, async () => { /* read-only */ });

    try {
        await addDoc(collection(db, "activity"), {
            type: 'system',
            title: 'User Profile Viewed',
            message: `Admin viewed profile of: ${u.full_name || u.email}`,
            timestamp: serverTimestamp()
        });
    } catch (e) { console.error("Error logging activity:", e); }

    setTimeout(() => {
        const btn = document.querySelector('.save-modal');
        if (btn) { btn.textContent = 'Close'; btn.classList.replace('btn-primary', 'btn-secondary'); }
    }, 50);
};

// --- Create New User Modal ---
async function showCreateUserModal() {
    const roleOptions = `
        <option value="client">Client</option>
        <option value="driver">Driver</option>
        <option value="admin">Administrator</option>
    `;

    const content = `
        <div class="form-group">
            <label>Full Name</label>
            <input type="text" id="modal_full_name" class="form-input" placeholder="e.g. Juan De La Cruz" required>
        </div>
        <div class="form-group">
            <label>Email Address</label>
            <input type="email" id="modal_email" class="form-input" placeholder="email@example.com" required>
        </div>
        <div class="form-group">
            <label>Password (Temporary)</label>
            <div style="position:relative;">
                <input type="password" id="modal_password" class="form-input" placeholder="Min. 8 characters" required style="padding-right: 40px;">
                <i class="fas fa-eye" id="toggleModalPassword" style="position:absolute; right:12px; top:50%; transform:translateY(-50%); cursor:pointer; color:var(--text-muted); transition:color 0.2s;"></i>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>User Role</label>
                <select id="modal_role" class="form-input" required>
                    ${roleOptions}
                </select>
            </div>
            <div class="form-group">
                <label>Company/Organization</label>
                <input type="text" id="modal_company" class="form-input" placeholder="Optional">
            </div>
        </div>
    `;

    showModal('create-user-modal', 'Create New User', content, async () => {
        const fullName = document.getElementById('modal_full_name').value.trim();
        const email = document.getElementById('modal_email').value.trim();
        const password = document.getElementById('modal_password').value;
        const role = document.getElementById('modal_role').value;
        const companyName = document.getElementById('modal_company').value.trim();

        if (!fullName || !email || !password || !role) {
            throw new Error("Please fill in all required fields.");
        }

        try {
            const response = await fetch('https://us-central1-appfleetonix.cloudfunctions.net/adminCreateUser', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email.toLowerCase().trim(),
                    password: password,
                    fullName: fullName,
                    role: role,
                    companyName: companyName || ""
                })
            });

            const result = await response.json();
            if (!result.success) {
                throw new Error(result.message || "Failed to create user");
            }

            alert(`User account for ${fullName} created successfully!`);

            // Increment Company Staff Counter if applicable
            if (companyName) {
                const companySnap = await getDocs(query(collection(db, "accredited_companies"), where("name", "==", companyName)));
                if (!companySnap.empty) {
                    const companyId = companySnap.docs[0].id;
                    const companyDoc = companySnap.docs[0].data();
                    await updateDoc(doc(db, "accredited_companies", companyId), {
                        total_staff: (companyDoc.total_staff || 0) + 1,
                        updated_at: serverTimestamp()
                    });
                }
            }
        } catch (err) {
            console.error("User creation error:", err);
            throw new Error(err.message);
        }
    });

    setTimeout(() => {
        const toggleBtn = document.getElementById('toggleModalPassword');
        const passInput = document.getElementById('modal_password');
        if (toggleBtn && passInput) {
            toggleBtn.addEventListener('click', () => {
                const isPass = passInput.type === 'password';
                passInput.type = isPass ? 'text' : 'password';
                toggleBtn.classList.toggle('fa-eye');
                toggleBtn.classList.toggle('fa-eye-slash');
            });
        }
    }, 100);
}

// --- Administrative Deletion Protocol ---
window.deleteUser = async (id) => {
    const user = allUsers.find(u => u.id === id);
    if (!user) return;

    if (!confirm(`Are you sure you want to permanently delete the account for ${user.full_name || user.email}? This action cannot be undone and will recalibrate organizational fleet counts.`)) {
        return;
    }

    try {
        // 1. Backend Purge (Auth + Logic)
        const response = await fetch('https://us-central1-appfleetonix.cloudfunctions.net/adminDeleteUser', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                uid: id,
                email: user.email
            })
        });

        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message || "Failed to purge user account.");
        }

        // 2. Recalibrate Organizational Counters
        const role = user.role || user.user_type || 'client';
        const companyId = user.accredited_company_id;

        if (companyId) {
            const companyRef = doc(db, "accredited_companies", companyId);
            const companySnap = await getDoc(companyRef);
            
            if (companySnap.exists()) {
                const updateData = {};
                if (role === 'driver') {
                    updateData.total_drivers = Math.max(0, (companySnap.data().total_drivers || 0) - 1);
                } else if (role === 'staff' || role === 'admin') {
                    updateData.total_staff = Math.max(0, (companySnap.data().total_staff || 0) - 1);
                }
                
                if (Object.keys(updateData).length > 0) {
                    await updateDoc(companyRef, {
                        ...updateData,
                        updated_at: serverTimestamp()
                    });
                }
            }
        }

        // 3. Activity Audit
        await addDoc(collection(db, "activity"), {
            type: 'system',
            title: 'User Deleted',
            message: `Super Admin purged user account: ${user.full_name} (${user.email})`,
            timestamp: serverTimestamp()
        });

        alert("User account successfully purged.");
    } catch (error) {
        console.error("Purge error:", error);
        alert("CRITICAL ERROR: Failed to purge user account. " + error.message);
    }
};
