import { initializeApp, getApps, getApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    getFirestore, collection, query, onSnapshot, doc, getDoc, orderBy, addDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { initLayout, showModal } from "./modules/ui.js";

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

let allUsers = [];

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = '../login.html'; return; }
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const name = userDoc.exists() ? (userDoc.data().full_name || user.email.split('@')[0]) : user.email.split('@')[0];
    initLayout('Registered Users', name);

    // Load all users from 'users' collection in real-time
    onSnapshot(query(collection(db, "users"), orderBy("full_name")), (snapshot) => {
        allUsers = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        applyFilters();
    });

    // Filter + Search listeners
    document.getElementById('roleFilter')?.addEventListener('change', applyFilters);
    document.getElementById('searchInput')?.addEventListener('input', applyFilters);

    // Create User Button
    document.getElementById('createUserBtn')?.addEventListener('click', showCreateUserModal);
});

function applyFilters() {
    const role   = document.getElementById('roleFilter')?.value || 'all';
    const search = (document.getElementById('searchInput')?.value || '').toLowerCase();

    let filtered = allUsers;
    if (role !== 'all') {
        filtered = filtered.filter(u => {
            const uRole = u.role || u.user_type || '';
            return uRole === role;
        });
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
        const badgeColor = role === 'admin' ? 'var(--accent-blue)' :
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
                    <button class="btn-icon view" title="View Details" onclick="viewUser('${u.id}')">
                        <i class="fas fa-eye"></i>
                    </button>
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

    // Log the view action as a system event
    try {
        await addDoc(collection(db, "activity"), {
            type: 'system',
            title: 'User Profile Viewed',
            message: `Admin viewed profile of: ${u.full_name || u.email}`,
            timestamp: serverTimestamp()
        });
    } catch (e) { console.error("Error logging activity:", e); }

    // Switch save to a close button
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
        <div style="background: rgba(59, 130, 246, 0.05); padding: 12px; border-radius: 8px; border: 1px solid rgba(59, 130, 246, 0.1); margin-top: 10px;">
            <p style="margin:0; font-size:0.85em; color:var(--text-secondary); line-height:1.4;">
                <i class="fas fa-info-circle" style="color:var(--accent-blue);"></i> 
                This will create a new account in Firebase Auth and a corresponding profile in Firestore.
            </p>
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

        if (password.length < 8) {
            throw new Error("Password must be at least 8 characters long.");
        }

        try {
            // Use the Cloud Function to create the user (avoids secondary app complexity)
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

            // The Cloud Function already creates the Firestore document, 
            // but we can log the activity on the client side for immediate feedback if needed,
            // though the function could also handle it. For now, just show success.
            alert(`User account for ${fullName} created successfully!`);
        } catch (err) {
            console.error("User creation error:", err);
            const msg = getFriendlyErrorMessage(err);
            throw new Error(msg);
        }
    });

    // Toggle Eye Logic for Modal
    setTimeout(() => {
        const toggleBtn = document.getElementById('toggleModalPassword');
        const passInput = document.getElementById('modal_password');
        if (toggleBtn && passInput) {
            toggleBtn.addEventListener('click', () => {
                const isPass = passInput.type === 'password';
                passInput.type = isPass ? 'text' : 'password';
                toggleBtn.classList.toggle('fa-eye');
                toggleBtn.classList.toggle('fa-eye-slash');
                toggleBtn.style.color = isPass ? 'var(--accent-blue)' : 'var(--text-muted)';
            });
        }
    }, 100);
}

function getFriendlyErrorMessage(error) {
    const code = error.code || error.message || "";
    if (code.includes('email-already-in-use')) return "This email is already registered.";
    if (code.includes('invalid-email')) return "Please enter a valid email address.";
    if (code.includes('weak-password')) return "The password is too weak. Use at least 8 characters.";
    if (code.includes('network-request-failed')) return "Connection error. Please check your internet.";
    if (code.includes('too-many-requests')) return "Too many attempts. Please try again later.";
    return "An unexpected error occurred. Please try again.";
}
