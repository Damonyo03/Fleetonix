import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot, doc, getDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { initLayout } from "./modules/ui.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const notificationList = document.getElementById('notificationList');

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../login.html';
        return;
    }

    const userDoc = await getDoc(doc(db, "users", user.uid));
    const name = userDoc.exists() ? userDoc.data().full_name : user.email.split('@')[0];
    initLayout('Notifications', name);

    initNotificationList(user.uid);
});

function initNotificationList(uid) {
    onSnapshot(query(collection(db, "notifications"), where("user_id", "==", uid), orderBy("created_at", "desc")), (snapshot) => {
        renderNotifications(snapshot.docs);
    });
}

function renderNotifications(docs) {
    if (docs.length === 0) {
        notificationList.innerHTML = '<p style="text-align: center; padding: 40px;">No notifications yet.</p>';
        return;
    }

    notificationList.innerHTML = docs.map(d => {
        const notif = d.data();
        const time = notif.created_at ? new Date(notif.created_at.seconds * 1000).toLocaleString() : 'N/A';
        return `
            <div class="notification-card ${notif.is_read ? '' : 'unread'}">
                <div class="notif-icon ${notif.type || 'info'}">
                    <i class="fas ${notif.type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i>
                </div>
                <div class="notif-content">
                    <h4>${notif.title}</h4>
                    <p>${notif.message}</p>
                    <div class="notif-time">${time}</div>
                </div>
            </div>
        `;
    }).join('');
}


