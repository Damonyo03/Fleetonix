import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot, doc, getDoc, getDocs, orderBy, setDoc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { initLayout, showModal, hideModal } from "./modules/ui.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const userTableBody = document.getElementById('userTableBody');
const userSearch = document.getElementById('userSearch');
const typeFilter = document.getElementById('typeFilter');

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../login.html';
        return;
    }

    const userDoc = await getDoc(doc(db, "users", user.uid));
    const name = userDoc.exists() ? userDoc.data().full_name : user.email.split('@')[0];
    initLayout('User Management', name);

    initUserList();
});

function initUserList() {
    let q = query(collection(db, "users"), orderBy("created_at", "desc"));

    onSnapshot(q, (snapshot) => {
        renderUsers(snapshot.docs);
    });
    
    // Simple filter logic
    const applyFilters = () => {
        const searchTerm = userSearch.value.toLowerCase();
        const role = typeFilter.value;

        // Use the active snapshot or a one-time get
        getDocs(collection(db, "users")).then(snap => {
            const filtered = snap.docs.filter(d => {
                const data = d.data();
                const fullName = data.full_name || '';
                const email = data.email || '';
                const matchesSearch = fullName.toLowerCase().includes(searchTerm) || email.toLowerCase().includes(searchTerm);
                const matchesRole = role === 'all' || data.user_type === role;
                return matchesSearch && matchesRole;
            });
            renderUsers(filtered);
        });
    };

    userSearch.addEventListener('input', applyFilters);
    typeFilter.addEventListener('change', applyFilters);
}

function renderUsers(docs) {
    if (!userTableBody) return;
    if (docs.length === 0) {
        userTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">No users found.</td></tr>';
        return;
    }

    userTableBody.innerHTML = docs.map(d => {
        const user = d.data();
        const id = d.id;
        const createdDate = user.created_at ? new Date(user.created_at.seconds * 1000).toLocaleDateString() : 'N/A';
        return `
            <tr>
                <td>${user.full_name || 'N/A'}</td>
                <td>${user.email || 'N/A'}</td>
                <td><span class="role-badge ${user.user_type}">${user.user_type}</span></td>
                <td><span class="status-badge ${user.status || 'active'}">${user.status || 'active'}</span></td>
                <td>${createdDate}</td>
                <td class="table-actions">
                    <button class="btn-icon edit" onclick="window.editUser('${id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon delete" onclick="window.deleteUser('${id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

// Global functions for HTML onclick
window.editUser = async (id) => {
    try {
        const userSnap = await getDoc(doc(db, "users", id));
        if (!userSnap.exists()) return;
        const user = userSnap.data();

        const content = `
            <div class="form-group">
                <label>Full Name</label>
                <input type="text" id="modal_full_name" class="form-input" value="${user.full_name}" required>
            </div>
            <div class="form-group">
                <label>Status</label>
                <select id="modal_status" class="form-input">
                    <option value="active" ${user.status === 'active' ? 'selected' : ''}>Active</option>
                    <option value="inactive" ${user.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                    <option value="suspended" ${user.status === 'suspended' ? 'selected' : ''}>Suspended</option>
                </select>
            </div>
        `;

        showModal('user-modal', 'Edit User', content, async () => {
            const newName = document.getElementById('modal_full_name').value;
            const newStatus = document.getElementById('modal_status').value;
            await updateDoc(doc(db, "users", id), {
                full_name: newName,
                status: newStatus
            });
        });
    } catch (error) {
        console.error("Error editing user:", error);
        alert("Failed to load user data.");
    }
};

window.deleteUser = async (id) => {
    if (confirm("Are you sure you want to delete this user? This cannot be undone.")) {
        try {
            await deleteDoc(doc(db, "users", id));
        } catch (error) {
            console.error("Error deleting user:", error);
            alert("Failed to delete user: " + error.message);
        }
    }
};

const addUserBtn = document.getElementById('addUserBtn');
if (addUserBtn) {
    addUserBtn.onclick = () => {
        const content = `
            <div class="form-group">
                <label>Full Name</label>
                <input type="text" id="modal_full_name" class="form-input" placeholder="Enter full name" required>
            </div>
            <div class="form-group">
                <label>Email</label>
                <input type="email" id="modal_email" class="form-input" placeholder="user@example.com" required>
            </div>
            <div class="form-group">
                <label>Role</label>
                <select id="modal_user_type" class="form-input">
                    <option value="admin">Admin</option>
                    <option value="client" selected>Client</option>
                    <option value="driver">Driver</option>
                </select>
            </div>
            <p style="font-size: 0.8em; color: var(--text-muted); margin-top: 10px;">
                Note: This creates a database record. The user should register via the sign-up page for Auth.
            </p>
        `;

        showModal('user-modal', 'Add New User', content, async () => {
            const name = document.getElementById('modal_full_name').value;
            const email = document.getElementById('modal_email').value;
            const type = document.getElementById('modal_user_type').value;

            // Generate a document ID from email or let Firebase do it
            const userRef = doc(collection(db, "users"));
            await setDoc(userRef, {
                full_name: name,
                email: email,
                user_type: type,
                status: "active",
                created_at: serverTimestamp(),
                uid: userRef.id // Placeholder UID
            });
        });
    };
}


