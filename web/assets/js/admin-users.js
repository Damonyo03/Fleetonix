import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot, doc, getDoc, getDocs, orderBy, setDoc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { initLayout, showModal, hideModal } from "./modules/ui.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const usersTableBody = document.getElementById('usersTableBody');
const searchInput = document.getElementById('searchInput');
const roleFilter = document.getElementById('roleFilter');

let currentUserData = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../login.html';
        return;
    }

    const userDoc = await getDoc(doc(db, "users", user.uid));
    currentUserData = userDoc.exists() ? userDoc.data() : { role: 'admin' };
    const name = currentUserData.full_name || user.email.split('@')[0];
    initLayout('User Management', name);

    initUserList();
});

function initUserList() {
    let q = query(collection(db, "users"), orderBy("created_at", "desc"));

    onSnapshot(q, (snapshot) => {
        renderUsers(snapshot.docs);
    });
    
    const applyFilters = () => {
        const searchTerm = searchInput.value.toLowerCase();
        const role = roleFilter.value;

        getDocs(collection(db, "users")).then(snap => {
            const filtered = snap.docs.filter(d => {
                const data = d.data();
                const fullName = data.full_name || '';
                const email = data.email || '';
                const userRole = data.role || data.user_type || '';
                const matchesSearch = fullName.toLowerCase().includes(searchTerm) || email.toLowerCase().includes(searchTerm);
                const matchesRole = role === 'all' || userRole === role;
                return matchesSearch && matchesRole;
            });
            renderUsers(filtered);
        });
    };

    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (roleFilter) roleFilter.addEventListener('change', applyFilters);
}

function renderUsers(docs) {
    if (!usersTableBody) return;
    if (docs.length === 0) {
        usersTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">No matching records found.</td></tr>';
        return;
    }

    usersTableBody.innerHTML = docs.map(d => {
        const user = d.data();
        const id = d.id;
        const role = user.role || user.user_type || 'user';
        const createdDate = user.created_at ? new Date(user.created_at.seconds * 1000).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
        
        return `
            <tr>
                <td><div style="font-weight:700; color:var(--text-primary);">${user.full_name || 'N/A'}</div></td>
                <td><code style="font-size:0.8rem; color:var(--accent-blue);">${user.email || 'N/A'}</code></td>
                <td><span class="role-badge ${role}" style="text-transform: capitalize;">${role.replace('_', ' ')}</span></td>
                <td><span style="font-size:0.85rem; color:var(--text-secondary); font-weight:600;">Jettsan</span></td>
                <td><div style="font-size:0.85rem; color:var(--text-muted);"><i class="fas fa-calendar-alt"></i> ${createdDate}</div></td>
                <td style="text-align: right;">
                    <div style="display:flex; gap:8px; justify-content: flex-end;">
                        <button class="btn-icon edit" onclick="window.editUser('${id}')" style="background: rgba(0,212,255,0.1); color: var(--accent-blue); border: none; padding: 6px; border-radius: 4px;"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon delete" onclick="window.deleteUser('${id}')" style="background: rgba(255,71,87,0.1); color: var(--accent-error); border: none; padding: 6px; border-radius: 4px;"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

window.editUser = async (id) => {
    try {
        const userSnap = await getDoc(doc(db, "users", id));
        if (!userSnap.exists()) return;
        const user = userSnap.data();

        const content = `
            <div class="form-group">
                <label>Display Name</label>
                <input type="text" id="modal_full_name" class="form-input" value="${user.full_name}" required>
            </div>
            <div class="form-group">
                <label>Account Status</label>
                <select id="modal_status" class="form-input">
                    <option value="active" ${user.status === 'active' ? 'selected' : ''}>Active</option>
                    <option value="inactive" ${user.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                    <option value="suspended" ${user.status === 'suspended' ? 'selected' : ''}>Suspended</option>
                </select>
            </div>
        `;

        showModal('user-modal', 'Edit System Access', content, async () => {
            await updateDoc(doc(db, "users", id), {
                full_name: document.getElementById('modal_full_name').value,
                status: document.getElementById('modal_status').value
            });
            alert("User updated successfully.");
        });
    } catch (error) {
        console.error("Error editing user:", error);
    }
};

window.deleteUser = async (id) => {
    // Stage 1: Standard Deletion Confirmation
    if (confirm("Are you sure you want to delete this user? This cannot be undone.")) {
        // Stage 2: Mandatory Backup Confirmation
        const backupConfirm = confirm("CRITICAL: Have you manually backed up this user's profile and transactional history?\n\nProceeding without a backup will result in permanent data loss.");
        
        if (backupConfirm) {
            try {
                await deleteDoc(doc(db, "users", id));
                alert("User record purged successfully.");
            } catch (error) {
                console.error("Error deleting user:", error);
                alert("Deletion failed: " + error.message);
            }
        }
    }
};

const createUserBtn = document.getElementById('createUserBtn');
if (createUserBtn) {
    createUserBtn.onclick = () => {
        const adminRole = currentUserData?.role || currentUserData?.user_type || 'admin';
        
        let roleOptions = '<option value="driver" selected>Driver</option>';
        if (adminRole === 'super_admin') {
            roleOptions = `
                <option value="super_admin">Super Admin</option>
                <option value="admin">Admin</option>
                <option value="client">Client</option>
                <option value="driver">Driver</option>
            `;
        }

        const content = `
            <div class="form-group">
                <label>Full Name</label>
                <input type="text" id="modal_full_name" class="form-input" placeholder="e.g. John Doe" required>
            </div>
            <div class="form-group">
                <label>Email Address</label>
                <input type="email" id="modal_email" class="form-input" placeholder="user@fleetonix.com" required>
            </div>
            <div class="form-group">
                <label>Assign System Role</label>
                <select id="modal_user_type" class="form-input">
                    ${roleOptions}
                </select>
            </div>
            <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 15px; font-style: italic;">
                <i class="fas fa-info-circle"></i> Security Note: Initial account provisioning creates the database profile. The user must proceed with the first-time login flow to set their actual credentials.
            </p>
        `;

        showModal('user-modal', 'Provision System User', content, async () => {
            const name = document.getElementById('modal_full_name').value;
            const email = document.getElementById('modal_email').value.trim().toLowerCase();
            const type = document.getElementById('modal_user_type').value;

            if (!email) return alert("Email is required.");

            try {
                // Check if email already exists
                const q = query(collection(db, "users"), where("email", "==", email));
                const snap = await getDocs(q);
                if (!snap.empty) {
                    return alert(`An account with email ${email} already exists in the system.`);
                }

                const userRef = doc(collection(db, "users"));
                await setDoc(userRef, {
                    full_name: name,
                    email: email,
                    role: type,
                    user_type: type,
                    contractor: "Jettsan",
                    status: "active",
                    created_at: serverTimestamp(),
                    uid: userRef.id
                });
                alert("New system user provisioned successfully.");
            } catch (err) {
                console.error("Provisioning failed:", err);
                alert("Creation failed: " + err.message);
            }
        });
    };
}



