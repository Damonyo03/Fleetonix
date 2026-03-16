import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, query, onSnapshot, doc, getDoc, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { initLayout } from "./modules/ui.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const activityTableBody = document.getElementById('activityTableBody');

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../login.html';
        return;
    }

    const userDoc = await getDoc(doc(db, "users", user.uid));
    const name = userDoc.exists() ? userDoc.data().full_name : user.email.split('@')[0];
    initLayout('Activity Logs', name);

    initActivityList();
});

function initActivityList() {
    onSnapshot(query(collection(db, "driver_activity"), orderBy("created_at", "desc"), limit(50)), (snapshot) => {
        const docs = snapshot.docs;
        renderActivities(docs);
    });
}

function renderActivities(docs) {
    if (docs.length === 0) {
        activityTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 40px;">No recent activity.</td></tr>';
        return;
    }

    activityTableBody.innerHTML = docs.map(d => {
        const act = d.data();
        const time = act.created_at ? new Date(act.created_at.seconds * 1000).toLocaleString() : 'N/A';
        return `
            <tr>
                <td>${time}</td>
                <td>${act.driver_name || 'Driver'}</td>
                <td><span class="status-badge ${act.activity_type}">${act.activity_type.replace('_', ' ')}</span></td>
                <td>${act.description || 'N/A'}</td>
            </tr>
        `;
    }).join('');
}


