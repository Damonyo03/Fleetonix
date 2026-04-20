import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, collection, query, where, onSnapshot, doc, getDoc, updateDoc, deleteDoc,
    serverTimestamp, addDoc, orderBy 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { initLayout } from "./modules/ui.js";

const CLOUD_REGION = "us-central1";
const PROJECT_ID = "appfleetonix";
const getFunctionUrl = (fn) => `https://${CLOUD_REGION}-${PROJECT_ID}.cloudfunctions.net/${fn}`;

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

let currentAdminRole = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = '../login.html'; return; }

    const userDoc = await getDoc(doc(db, "users", user.uid));
    const userData = userDoc.exists() ? userDoc.data() : null;
    const adminRoles = ['admin', 'super_admin'];
    const role = userData?.role || userData?.user_type;

    if (!userData || !adminRoles.includes(role)) {
        window.location.href = '../login.html?error=unauthorized';
        return;
    }

    currentAdminRole = role;
    const name = userData.full_name || user.email.split('@')[0];
    initLayout('Enrollment Approvals', name, 0, role);
    initPendingApprovals();
});

function initPendingApprovals() {
    const tbody = document.getElementById('approvalsTableBody');
    const badge = document.getElementById('pendingCountBadge');

    // Listen to driver_applications with pending_approval status
    const q = query(
        collection(db, "driver_applications"),
        where("status", "==", "pending_approval")
    );

    onSnapshot(q, (snapshot) => {
        let applications = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        applications.sort((a, b) => {
            const timeA = a.submitted_at?.toMillis ? a.submitted_at.toMillis() : 0;
            const timeB = b.submitted_at?.toMillis ? b.submitted_at.toMillis() : 0;
            return timeB - timeA;
        });

        if (badge) {
            badge.textContent = `${applications.length} Pending`;
            badge.style.background = applications.length > 0 ? 'var(--accent-orange)' : 'var(--bg-slate-800)';
        }

        renderApprovals(applications);
    }, (error) => {
        console.error("Snapshot error:", error);
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--accent-red);">Error loading approvals. Check console.</td></tr>`;
    });
}

function renderApprovals(applications) {
    const tbody = document.getElementById('approvalsTableBody');
    if (!tbody) return;

    if (applications.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center;padding:60px;color:var(--text-muted);">
                    <i class="fas fa-check-circle" style="font-size:2rem;color:var(--accent-teal);display:block;margin-bottom:12px;"></i>
                    All caught up! No pending applications at this time.
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = applications.map(app => {
        const date = app.submitted_at?.toDate
            ? app.submitted_at.toDate().toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : 'Recently';

        // Escape data for safe inline onclick attributes
        const safeName     = (app.full_name || '').replace(/'/g, "\\'");
        const safeEmail    = (app.email || '').replace(/'/g, "\\'");
        const safeVehicle  = (app.vehicle_type || '').replace(/'/g, "\\'");
        const safePlate    = (app.plate_number || '').replace(/'/g, "\\'");
        const safePhone    = (app.phone || '').replace(/'/g, "\\'");

        return `
            <tr>
                <td style="font-weight:600;">${app.full_name || '—'}</td>
                <td style="color:var(--text-secondary);font-size:0.85em;">${app.email || '—'}</td>
                <td style="color:var(--text-secondary);">${app.phone || '—'}</td>
                <td><span style="background:var(--accent-blue)22;color:var(--accent-blue);padding:2px 8px;border-radius:12px;font-size:0.75em;font-weight:700;text-transform:uppercase;">${app.vehicle_type || 'sedan'}</span></td>
                <td style="color:var(--text-muted);font-size:0.82em;">${date}</td>
                <td><span style="background:rgba(245,158,11,0.1);color:#f59e0b;padding:3px 10px;border-radius:20px;font-size:0.8em;font-weight:700;">PENDING</span></td>
                <td style="text-align:right;">
                    <button onclick="approveApplication('${app.id}', '${safeName}', '${safeEmail}', '${safePhone}', '${safeVehicle}', '${safePlate}')"
                            style="background:rgba(16,185,129,0.1);color:#10b981;border:1px solid rgba(16,185,129,0.3);padding:6px 14px;border-radius:8px;font-size:0.82em;font-weight:700;cursor:pointer;transition:all 0.2s;" 
                            onmouseover="this.style.background='#10b981';this.style.color='#fff';" 
                            onmouseout="this.style.background='rgba(16,185,129,0.1)';this.style.color='#10b981';">
                        <i class="fas fa-check"></i> Approve & Create Account
                    </button>
                    <button onclick="rejectApplication('${app.id}', '${safeName}')"
                            style="margin-left:8px;background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.3);padding:6px 10px;border-radius:8px;font-size:0.82em;cursor:pointer;transition:all 0.2s;"
                            onmouseover="this.style.background='#ef4444';this.style.color='#fff';"
                            onmouseout="this.style.background='rgba(239,68,68,0.1)';this.style.color='#ef4444';">
                        <i class="fas fa-times"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

window.approveApplication = async (appId, fullName, email, phone, vehicleType, plateNumber) => {
    if (!confirm(`Create a Fleetonix account for ${fullName} (${email})?\n\nA temporary password will be automatically generated and emailed to them.`)) return;

    try {
        const idToken = await auth.currentUser.getIdToken();

        // Call adminCreateUser — password is auto-generated on the backend
        const response = await fetch(getFunctionUrl('adminCreateUser'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
                email: email,
                fullName: fullName,
                role: 'driver',
                phone: phone || '',
                vehicle_type: vehicleType || 'sedan',
                plate_number: plateNumber || '',
            })
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.message || "Failed to create user account.");

        // 2. Mark the application as approved
        await updateDoc(doc(db, "driver_applications", appId), {
            status: "approved",
            approved_at: serverTimestamp(),
            approved_by: auth.currentUser.email,
            created_uid: result.uid || null
        });

        // 3. Activity audit
        await addDoc(collection(db, "activity"), {
            type: "system",
            title: "Driver Account Created",
            message: `Admin created account and approved enrollment for ${fullName} (${email})`,
            timestamp: serverTimestamp()
        });

        alert(`✅ Account for ${fullName} created successfully!\n\nTemporary credentials have been emailed to ${email}.`);
    } catch (error) {
        console.error("Approval error:", error);
        alert("❌ Failed to approve application: " + error.message);
    }
};

window.rejectApplication = async (appId, name) => {
    if (!confirm(`Reject and delete the application from ${name}? This cannot be undone.`)) return;

    try {
        await updateDoc(doc(db, "driver_applications", appId), {
            status: "rejected",
            rejected_at: serverTimestamp(),
            rejected_by: auth.currentUser.email
        });

        await addDoc(collection(db, "activity"), {
            type: "system",
            title: "Application Rejected",
            message: `Admin rejected enrollment application from ${name}`,
            timestamp: serverTimestamp()
        });

        alert(`Application from ${name} has been rejected.`);
    } catch (error) {
        console.error("Rejection error:", error);
        alert("Failed to reject application: " + error.message);
    }
};
