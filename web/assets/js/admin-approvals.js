import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    getFirestore, collection, query, where, onSnapshot, orderBy,
    doc, getDoc, updateDoc, deleteDoc, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { initLayout } from "./modules/ui.js";

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

let currentAdmin = null;
let pendingDrivers = [];

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../login.html';
        return;
    }

    const userDoc = await getDoc(doc(db, "users", user.uid));
    const userData = userDoc.exists() ? userDoc.data() : {};
    if (userData.role !== 'super_admin') {
        alert("Access Denied: Only Super Admins can manage approvals.");
        window.location.href = 'dashboard.html';
        return;
    }

    currentAdmin = { uid: user.uid, ...userData };
    initLayout('Enrollment Approvals', userData.full_name || "Admin");
    loadApprovals();
});

function loadApprovals() {
    const q = query(
        collection(db, "users"),
        where("status", "==", "pending"),
        where("user_type", "==", "driver")
    );

    onSnapshot(q, (snapshot) => {
        pendingDrivers = snapshot.docs.map(d => ({ uid: d.id, ...d.data() }));
        renderApprovals();
        updateBadgeCount(pendingDrivers.length);
    });
}

function renderApprovals() {
    const container = document.getElementById('approvalsList');
    if (!container) return;

    if (pendingDrivers.length === 0) {
        container.innerHTML = `
            <div class="glass-card" style="text-align: center; padding: 64px; grid-column: 1 / -1;">
                <i class="fas fa-check-circle" style="font-size: 3rem; color: var(--accent-green); margin-bottom: 16px;"></i>
                <h3 style="font-size: 1.25rem; font-weight: 700;">No Pending Approvals</h3>
                <p style="color: var(--text-muted);">All driver applications have been processed.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = pendingDrivers.map(driver => `
        <div class="glass-card" style="padding: 24px; display: flex; flex-direction: column; gap: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; gap: 16px; align-items: center;">
                    <div class="avatar" style="width: 48px; height: 48px; font-size: 1.25rem;">${driver.full_name[0]}</div>
                    <div>
                        <div style="font-weight: 700; font-size: 1.125rem;">${driver.full_name}</div>
                        <div style="color: var(--text-muted); font-size: 0.875rem;">${driver.email}</div>
                    </div>
                </div>
                <div class="status-badge" style="background: rgba(255, 171, 0, 0.1); color: #ffab00; border: 1px solid rgba(255, 171, 0, 0.2);">PENDING</div>
            </div>

            <div style="background: rgba(255,255,255,0.02); padding: 16px; border-radius: 8px; border: 1px solid var(--border-color); font-size: 0.875rem;">
                <div style="margin-bottom: 8px;"><strong>Phone:</strong> ${driver.phone || 'Not provided'}</div>
                <div style="margin-bottom: 8px;"><strong>Applied:</strong> ${formatDate(driver.created_at)}</div>
                <div><strong>Company:</strong> ${driver.company_name || 'Jettsan'}</div>
            </div>

            <div style="display: flex; gap: 12px; margin-top: auto;">
                <button class="btn btn-secondary" onclick="handleDecline('${driver.uid}', '${driver.full_name}', '${driver.email}')" style="flex: 1; border-color: #ff6b6b; color: #ff6b6b;">
                    <i class="fas fa-times"></i> Decline
                </button>
                <button class="btn btn-primary" onclick="handleApprove('${driver.uid}', '${driver.full_name}', '${driver.email}')" style="flex: 1;">
                    <i class="fas fa-check"></i> Approve
                </button>
            </div>
        </div>
    `).join('');
}

window.handleApprove = (uid, name, email) => {
    showModal('approve', { uid, name, email });
};

window.handleDecline = (uid, name, email) => {
    showModal('decline', { uid, name, email });
};

function showModal(action, driver) {
    const modal = document.getElementById('approvalModal');
    const icon = document.getElementById('approvalIcon');
    const title = document.getElementById('approvalTitle');
    const message = document.getElementById('approvalMessage');
    const confirmBtn = document.getElementById('confirmApprovalBtn');

    if (action === 'approve') {
        icon.innerHTML = '<i class="fas fa-user-check" style="color: var(--accent-green);"></i>';
        title.innerText = 'Approve Driver';
        message.innerText = `Are you sure you want to authorize ${driver.name} for platform access?`;
        confirmBtn.className = 'btn btn-primary';
        confirmBtn.innerText = 'Approve Enrollment';
        confirmBtn.onclick = () => processApproval(driver);
    } else {
        icon.innerHTML = '<i class="fas fa-user-times" style="color: #ff6b6b;"></i>';
        title.innerText = 'Decline Application';
        message.innerText = `Are you sure you want to reject the application for ${driver.name}? This will purge their credentials.`;
        confirmBtn.className = 'btn btn-secondary';
        confirmBtn.style.background = '#ff6b6b';
        confirmBtn.style.borderColor = '#ff6b6b';
        confirmBtn.style.color = '#fff';
        confirmBtn.innerText = 'Reject & Purge';
        confirmBtn.onclick = () => processDecline(driver);
    }

    modal.style.display = 'flex';
}

async function processApproval(driver) {
    try {
        // 1. Update user document
        await updateDoc(doc(db, "users", driver.uid), {
            status: "active",
            approved_by: currentAdmin.email,
            approved_at: serverTimestamp()
        });

        // 2. Update driver document (key is email)
        const driverRef = doc(db, "drivers", driver.email.toLowerCase().trim());
        await updateDoc(driverRef, {
            status: "active",
            approved_by: currentAdmin.email,
            approved_at: serverTimestamp()
        });

        // 3. Log notification
        await addDoc(collection(db, "notifications"), {
            title: "Enrollment Approved",
            message: `Account for ${driver.name} has been authorized by ${currentAdmin.full_name}.`,
            type: "system",
            timestamp: serverTimestamp()
        });

        hideModal();
    } catch (e) {
        console.error("Approval error:", e);
        alert("Failed to approve driver: " + e.message);
    }
}

async function processDecline(driver) {
    try {
        // In a real scenario, we might move to 'declined' or delete entirely
        await deleteDoc(doc(db, "users", driver.uid));
        await deleteDoc(doc(db, "drivers", driver.email.toLowerCase().trim()));
        
        // Log rejection
        await addDoc(collection(db, "activity"), {
            type: "system",
            title: "Application Rejected",
            message: `The enrollment request for ${driver.name} (${driver.email}) was declined.`,
            timestamp: serverTimestamp()
        });

        hideModal();
    } catch (e) {
        console.error("Decline error:", e);
        alert("Failed to reject application: " + e.message);
    }
}

function formatDate(ts) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString();
}

function updateBadgeCount(count) {
    const badges = document.querySelectorAll('.approval-count');
    badges.forEach(b => {
        if (count > 0) {
            b.innerText = count;
            b.style.display = 'inline-block';
        } else {
            b.style.display = 'none';
        }
    });
}

function hideModal() {
    document.getElementById('approvalModal').style.display = 'none';
}

document.getElementById('cancelApprovalBtn').onclick = hideModal;
window.onclick = (e) => {
    if (e.target == document.getElementById('approvalModal')) hideModal();
};
