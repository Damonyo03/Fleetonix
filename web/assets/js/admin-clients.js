import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot, doc, getDoc, updateDoc, deleteDoc, getDocs, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { initLayout, showModal, hideModal } from "./modules/ui.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Secondary app for creating users without logging out the admin
const secondaryApp = initializeApp(firebaseConfig, "SecondaryClient");
const secondaryAuth = getAuth(secondaryApp);

const clientTableBody = document.getElementById('clientTableBody');
const clientSearch = document.getElementById('clientSearch');

let allClients = [];

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../login.html';
        return;
    }

    const userDoc = await getDoc(doc(db, "users", user.uid));
    const name = userDoc.exists() ? userDoc.data().full_name : user.email.split('@')[0];
    initLayout('Client Management', name);

    initClientList();
});

function initClientList() {
    const q = query(collection(db, "users"), where("user_type", "==", "client"));

    onSnapshot(q, (snapshot) => {
        allClients = snapshot.docs;
        applyFilters();
    });

    if (clientSearch) {
        clientSearch.addEventListener('input', applyFilters);
    }
}

function applyFilters() {
    if (!clientTableBody) return;
    const term = clientSearch.value.toLowerCase();
    const filtered = allClients.filter(d => {
        const data = d.data();
        return (data.company_name || '').toLowerCase().includes(term) || 
               (data.full_name || '').toLowerCase().includes(term) ||
               (data.email || '').toLowerCase().includes(term);
    });
    renderClients(filtered);
}

function renderClients(docs) {
    if (docs.length === 0) {
        clientTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px;">No clients found.</td></tr>';
        return;
    }

    clientTableBody.innerHTML = docs.map(d => {
        const client = d.data();
        const id = d.id;
        return `
            <tr>
                <td>${client.company_name || 'N/A'}</td>
                <td>${client.full_name || 'N/A'}</td>
                <td>${client.email}</td>
                <td>${client.address || 'N/A'}</td>
                <td class="table-actions">
                    <button class="btn-icon edit" onclick="window.editClient('${id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon delete" onclick="window.deleteClient('${id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

window.editClient = async (id) => {
    const snap = await getDoc(doc(db, "users", id));
    if (!snap.exists()) return;
    const client = snap.data();

    const content = `
        <div class="form-group">
            <label>Company Name</label>
            <input type="text" id="modal_company_name" class="form-input" value="${client.company_name || ''}" required>
        </div>
        <div class="form-group">
            <label>Contact Person</label>
            <input type="text" id="modal_full_name" class="form-input" value="${client.full_name || ''}" required>
        </div>
        <div class="form-group">
            <label>Address</label>
            <input type="text" id="modal_address" class="form-input" value="${client.address || ''}" required>
        </div>
    `;

    showModal('client-modal', 'Edit Client', content, async () => {
        await updateDoc(doc(db, "users", id), {
            company_name: document.getElementById('modal_company_name').value,
            full_name: document.getElementById('modal_full_name').value,
            address: document.getElementById('modal_address').value
        });
    });
};

window.deleteClient = async (id) => {
    if (confirm("Are you sure you want to delete this client?")) {
        try {
            await deleteDoc(doc(db, "users", id));
        } catch(error) {
            console.error("Delete client error:", error);
            alert("Failed to delete client: " + error.message);
        }
    }
};

const addClientBtn = document.getElementById('addClientBtn');
if (addClientBtn) {
    addClientBtn.onclick = () => {
        const content = `
            <div class="form-group">
                <label>Company Name</label>
                <input type="text" id="modal_company_name" class="form-input">
            </div>
            <div class="form-group">
                <label>Contact Person (Full Name)</label>
                <input type="text" id="modal_full_name" class="form-input" required>
            </div>
            <div class="form-group">
                <label>Address</label>
                <input type="text" id="modal_address" class="form-input">
            </div>
            <div class="form-group">
                <label>Email (for Web Login)</label>
                <input type="email" id="modal_email" class="form-input" required>
            </div>
            <div class="form-group">
                <label>Password (At least 6 characters)</label>
                <input type="password" id="modal_password" class="form-input" required minlength="6">
            </div>
        `;

        showModal('client-modal', 'Add New Client', content, async () => {
            const company = document.getElementById('modal_company_name').value;
            const name = document.getElementById('modal_full_name').value;
            const address = document.getElementById('modal_address').value;
            const email = document.getElementById('modal_email').value.toLowerCase().trim();
            const password = document.getElementById('modal_password').value;

            if (password.length < 6) {
                alert("Password must be at least 6 characters long.");
                return;
            }

            try {
                const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
                const clientId = userCredential.user.uid;

                await setDoc(doc(db, "users", clientId), {
                    company_name: company,
                    full_name: name,
                    address: address,
                    email: email,
                    user_type: "client",
                    status: "active",
                    created_at: serverTimestamp()
                });

                await signOut(secondaryAuth);
                alert("Client created successfully!");
            } catch (error) {
                console.error("Error creating client:", error);
                alert("Failed to create client: " + error.message);
            }
        });
    };
}


