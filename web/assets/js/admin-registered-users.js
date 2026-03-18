import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    getFirestore, collection, query, onSnapshot, doc, getDoc, orderBy
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { initLayout, showModal } from "./modules/ui.js";

const app = initializeApp(firebaseConfig);
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
});

function applyFilters() {
    const role   = document.getElementById('roleFilter')?.value || 'all';
    const search = (document.getElementById('searchInput')?.value || '').toLowerCase();

    let filtered = allUsers;
    if (role !== 'all') filtered = filtered.filter(u => (u.role || u.user_type || '') === role);
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

    // Switch save to a close button
    setTimeout(() => {
        const btn = document.querySelector('.save-modal');
        if (btn) { btn.textContent = 'Close'; btn.classList.replace('btn-primary', 'btn-secondary'); }
    }, 50);
};
