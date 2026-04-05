import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot, orderBy, limit, doc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

const dtrLogsBody = document.getElementById('dtrLogsBody');
const dateFilter = document.getElementById('dateFilter');
let currentUserData = null;
let activeCompanies = {};

// Set default date to today
const today = new Date().toISOString().split('T')[0];
dateFilter.value = today;

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../login.html';
        return;
    }

    const userDoc = await getDoc(doc(db, "users", user.uid));
    currentUserData = userDoc.exists() ? userDoc.data() : { role: 'admin' };
    document.getElementById('adminDisplayName').textContent = currentUserData.full_name || "Administrator";

    // Pre-fetch all companies for display names
    const companiesSnap = await getDocs(collection(db, "accredited_companies"));
    companiesSnap.forEach(doc => {
        activeCompanies[doc.id] = doc.data().name;
    });

    initDTRLogs();
});

function initDTRLogs() {
    if (!dtrLogsBody) return;

    const role = currentUserData.role || currentUserData.user_type;
    const companyId = currentUserData.accredited_company_id;
    const selectedDate = dateFilter.value;

    let baseQuery = collection(db, "dtr_logs");
    
    // Construct query filters
    let q;
    if ((role === 'company_admin' || role === 'admin') && companyId) {
        q = query(baseQuery, where("accredited_company_id", "==", companyId), orderBy("timestamp", "desc"), limit(100));
    } else {
        q = query(baseQuery, orderBy("timestamp", "desc"), limit(100));
    }

    onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs;
        
        // Manual date filtering (alternatively could use Firestore storage as YYYY-MM-DD strings for indexed range queries)
        const filteredDocs = docs.filter(doc => {
            if (!doc.data().timestamp) return false;
            const logDate = doc.data().timestamp.toDate().toISOString().split('T')[0];
            return logDate === selectedDate;
        });

        renderLogs(filteredDocs);
    });
}

function renderLogs(docs) {
    if (docs.length === 0) {
        dtrLogsBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">No records found for this date.</td></tr>';
        return;
    }

    dtrLogsBody.innerHTML = docs.map(d => {
        const log = d.data();
        const timestamp = log.timestamp ? log.timestamp.toDate().toLocaleString() : 'N/A';
        const actionLabel = log.action === 'time_in' ? 'Time In' : 'Time Out';
        const companyName = activeCompanies[log.accredited_company_id] || "Unknown Company";
        const gpsLink = (log.latitude && log.longitude) 
            ? `<a href="https://www.google.com/maps?q=${log.latitude},${log.longitude}" target="_blank" class="gps-link"><i class="fas fa-map-marker-alt"></i> View Map</a>`
            : 'N/A';
        
        return `
            <tr>
                <td style="font-weight: 600;">${log.driver_name || 'Driver'}</td>
                <td><span style="font-size: 0.85em; color: var(--text-muted);">${companyName}</span></td>
                <td>
                    <span class="status-pill status-${log.action}">${actionLabel}</span>
                    ${log.is_overtime ? '<span class="ot-badge">OVERTIME</span>' : ''}
                </td>
                <td>${timestamp}</td>
                <td>${gpsLink}</td>
                <td><span style="font-size: 0.85em;">${log.notes || '-'}</span></td>
            </tr>
        `;
    }).join('');
}

dateFilter.addEventListener('change', initDTRLogs);
