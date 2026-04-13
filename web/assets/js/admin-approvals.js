import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, collection, query, where, onSnapshot, doc, getDoc, updateDoc, serverTimestamp, 
    addDoc, orderBy 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { initLayout } from "./modules/ui.js";

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

let pendingUsersCount = 0;

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../login.html';
        return;
    }

    const userDoc = await getDoc(doc(db, "users", user.uid));
    const userData = userDoc.exists() ? userDoc.data() : null;
    const adminRoles = ['admin', 'super_admin'];
    const role = userData?.role || userData?.user_type;

    if (!userData || !adminRoles.includes(role)) {
        window.location.href = '../login.html?error=unauthorized';
        return;
    }

    const name = userData.full_name || user.email.split('@')[0];
    initLayout('Enrollment Approvals', name, 0, role);
    
    // Load Pending Approvals
    initPendingApprovals();
});

function initPendingApprovals() {
    const tbody = document.getElementById('approvalsTableBody');
    const badge = document.getElementById('pendingCountBadge');

    const q = query(
        collection(db, "users"), 
        where("status", "==", "pending_approval")
    );

    onSnapshot(q, (snapshot) => {
        let users = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // Sort in-memory to avoid composite index requirement
        users.sort((a, b) => {
            const timeA = a.created_at?.toMillis ? a.created_at.toMillis() : 0;
            const timeB = b.created_at?.toMillis ? b.created_at.toMillis() : 0;
            return timeB - timeA;
        });

        pendingUsersCount = users.length;
        
        if (badge) {
            badge.textContent = `${pendingUsersCount} Pending`;
            badge.style.background = pendingUsersCount > 0 ? 'var(--accent-orange)' : 'var(--bg-slate-800)';
        }

        renderApprovals(users);
    }, (error) => {
        console.error("Snapshot error:", error);
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-accent-red">Error loading approvals. Check console.</td></tr>`;
    });
}

function renderApprovals(users) {
    const tbody = document.getElementById('approvalsTableBody');
    if (!tbody) return;

    if (users.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-20 text-slate-500 italic">
                    <i class="fas fa-check-circle text-accent-green mb-3 text-3xl block"></i>
                    All caught up! No pending approvals at this time.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = users.map(u => {
        const date = u.activated_at?.toDate ? u.activated_at.toDate().toLocaleString('en-PH', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : 'Recently';
        
        return `
            <tr class="hover:bg-white/5 transition-colors">
                <td class="font-semibold text-slate-100">${u.full_name || '—'}</td>
                <td class="text-slate-400 font-mono text-sm">${u.email}</td>
                <td><span class="bg-blue-500/10 text-blue-400 px-2 py-1 rounded text-[10px] font-bold uppercase">${u.role || 'driver'}</span></td>
                <td class="text-slate-500 text-sm">${date}</td>
                <td><span class="status-badge status-pending">PENDING</span></td>
                <td class="text-right">
                    <button onclick="approveUser('${u.id}', '${u.full_name || u.email}')" 
                            class="bg-accent-green/10 hover:bg-accent-green text-accent-green hover:text-white border border-accent-green/20 px-4 py-2 rounded-lg text-sm font-bold transition-all">
                        <i class="fas fa-check mr-1"></i> Approve
                    </button>
                    <button onclick="rejectUser('${u.id}', '${u.full_name || u.email}')" 
                            class="ml-2 bg-accent-red/10 hover:bg-accent-red text-accent-red hover:text-white border border-accent-red/20 px-2 py-2 rounded-lg text-sm transition-all">
                        <i class="fas fa-times"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

window.approveUser = async (uid, name) => {
    if (!confirm(`Confirm activation for ${name}? This will grant them full system access.`)) return;

    try {
        const userRef = doc(db, "users", uid);
        const driverRef = doc(db, "drivers", uid);

        await updateDoc(userRef, {
            status: "active",
            approved_at: serverTimestamp(),
            approved_by: auth.currentUser.email
        });

        // Check if driver doc exists before updating
        const dSnap = await getDoc(driverRef);
        if (dSnap.exists()) {
            await updateDoc(driverRef, {
                status: "active"
            });
        }

        // Log Activity
        await addDoc(collection(db, "activity"), {
            type: "system",
            title: "Account Activated",
            message: `Admin approved enrollment for ${name}`,
            timestamp: serverTimestamp()
        });

        alert(`Successfully activated ${name}'s account.`);
    } catch (error) {
        console.error("Approval error:", error);
        alert("Failed to approve user: " + error.message);
    }
};

window.rejectUser = async (uid, name) => {
    if (!confirm(`Are you sure you want to REJECT and DELETE ${name}'s pending enrollment?`)) return;
    
    // In a production app, we might use adminDeleteUser Cloud Function here
    // For now, let's keep it simple or redirect to registered-users
    alert("Please use the Registered Users page to delete or manage users.");
};
