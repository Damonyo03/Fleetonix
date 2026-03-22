import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot, doc, getDoc, orderBy, updateDoc, writeBatch, getDocs, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { initLayout } from "./modules/ui.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUserId = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../login.html';
        return;
    }

    currentUserId = user.uid;

    // Verify User Data
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const userData = userDoc.exists() ? userDoc.data() : null;
    const name = userData ? userData.full_name : user.email.split('@')[0];

    // Initialize Layout
    initLayout("Notifications", name);
    setupLogout();
    
    // Initial Load
    loadNotifications();
    
    // Mark All Read Btn
    const markAllBtn = document.getElementById('markAllReadBtn');
    if (markAllBtn) {
        markAllBtn.addEventListener('click', markAllNotificationsAsRead);
    }
});

function loadNotifications() {
    const q = query(collection(db, "notifications"), 
        where("user_id", "==", currentUserId), 
        orderBy("created_at", "desc"),
        limit(50));

    const listContainer = document.getElementById('notificationsList');
    
    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            listContainer.innerHTML = `
                <div style="text-align: center; padding: 60px; color: var(--text-muted); background: var(--bg-card); border-radius: 12px; border: 1px dashed var(--border-color);">
                    <i class="fas fa-bell-slash fa-3x" style="margin-bottom: 20px; opacity: 0.3;"></i>
                    <p>You don't have any notifications yet.</p>
                </div>
            `;
            return;
        }

        const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const unreadCount = notifications.filter(n => !n.is_read).length;
        updateBadge(unreadCount);

        const displayItems = groupNotifications(notifications);
        
        listContainer.innerHTML = displayItems.map((item, index) => {
            if (item.type === 'completed_trip') {
                return renderGroupedNotification(item.group, index);
            } else {
                return renderSingleNotification(item.notification);
            }
        }).join('');
    }, (error) => {
        console.error("Notifications fetch error:", error);
        const listContainer = document.getElementById('notificationsList');
        if (listContainer) {
            listContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #ff6b6b;">
                    <i class="fas fa-exclamation-triangle fa-2x"></i>
                    <p style="margin-top: 15px;">Failed to load notifications. Please refresh the page.</p>
                </div>
            `;
        }
    });
}

function groupNotifications(notifications) {
    const tripSubTitles = ['Trip Started', 'Pickup Completed', 'Dropoff Completed', 'Return Pickup Completed'];
    const tripGroups = [];
    const otherNotifications = [];

    // First pass: Create groups for "Trip Completed"
    notifications.forEach(notif => {
        if (notif.title === 'Trip Completed') {
            tripGroups.push({
                main: notif,
                sub: [],
                time: notif.created_at ? notif.created_at.toMillis() : Date.now()
            });
        }
    });

    // Second pass: Associate sub-notifications
    notifications.forEach(notif => {
        if (tripSubTitles.includes(notif.title)) {
            const notifTime = notif.created_at ? notif.created_at.toMillis() : Date.now();
            let bestGroup = null;
            let bestTimeDiff = Infinity;

            tripGroups.forEach(group => {
                const timeDiff = group.time - notifTime;
                // Within 2 hours before completion
                if (timeDiff >= 0 && timeDiff <= 7200000) {
                    if (timeDiff < bestTimeDiff) {
                        bestGroup = group;
                        bestTimeDiff = timeDiff;
                    }
                }
            });

            if (bestGroup) {
                bestGroup.sub.push(notif);
            } else {
                otherNotifications.push(notif);
            }
        } else if (notif.title !== 'Trip Completed') {
            otherNotifications.push(notif);
        }
    });

    // Sort sub-notifications by time
    tripGroups.forEach(group => {
        group.sub.sort((a, b) => {
            const timeA = a.created_at ? a.created_at.toMillis() : 0;
            const timeB = b.created_at ? b.created_at.toMillis() : 0;
            return timeA - timeB;
        });
    });

    const displayItems = [];
    tripGroups.forEach(group => {
        displayItems.push({ type: 'completed_trip', group: group });
    });
    otherNotifications.forEach(notif => {
        displayItems.push({ type: 'other', notification: notif });
    });

    // Sort all display items by time of the main/single notification
    displayItems.sort((a, b) => {
        const timeA = a.type === 'completed_trip' ? a.group.time : (a.notification.created_at ? a.notification.created_at.toMillis() : 0);
        const timeB = b.type === 'completed_trip' ? b.group.time : (b.notification.created_at ? b.notification.created_at.toMillis() : 0);
        return timeB - timeA;
    });

    return displayItems;
}

function renderSingleNotification(data) {
    const id = data.id;
    const isRead = data.is_read || false;
    const type = data.type || 'info';
    const title = data.title || 'Notification';
    const createdAt = data.created_at ? data.created_at.toDate() : new Date();
    
    let icon = 'fa-bell';
    let extraClass = '';
    
    if (title.includes('Trip Completed')) {
        icon = 'fa-check-double';
        extraClass = 'trip-completed';
    } else if (title.includes('Assigned') || title.includes('Started')) {
        icon = 'fa-truck-fast';
    } else if (type === 'important' || type === 'error') {
        icon = 'fa-triangle-exclamation';
        extraClass = 'important';
    }

    return `
        <div class="notification-card ${isRead ? '' : 'unread'} ${extraClass}" onclick="markAsRead('${id}', ${isRead})">
            <div class="notification-icon-wrap">
                <i class="fas ${icon}"></i>
            </div>
            <div class="notification-content">
                <div class="notification-title">${title}</div>
                <div class="notification-message">${data.message || ''}</div>
                <div class="notification-time">
                    <i class="far fa-clock"></i> ${formatTime(createdAt)}
                </div>
            </div>
            ${!isRead ? '<div class="notification-actions"><div class="mark-read-dot"></div></div>' : ''}
        </div>
    `;
}

function renderGroupedNotification(group, index) {
    const main = group.main;
    const subs = group.sub;
    const isRead = main.is_read || false;
    const createdAt = main.created_at ? main.created_at.toDate() : new Date();
    const groupId = `group-${index}`;

    return `
        <div class="notification-card trip-completed ${isRead ? '' : 'unread'}" style="flex-direction: column; cursor: default;">
            <div style="display: flex; gap: 15px; width: 100%; align-items: start;" onclick="markAsRead('${main.id}', ${isRead})">
                <div class="notification-icon-wrap">
                    <i class="fas fa-check-double"></i>
                </div>
                <div class="notification-content">
                    <div class="notification-title">${main.title}</div>
                    <div class="notification-message">${main.message || ''}</div>
                    <div class="notification-time">
                        <i class="far fa-clock"></i> ${formatTime(createdAt)}
                    </div>
                </div>
                <div class="notification-actions">
                    ${!isRead ? '<div class="mark-read-dot"></div>' : ''}
                    ${subs.length > 0 ? `
                        <button onclick="toggleGroup('${groupId}', event)" class="btn-icon" style="background: none; border: none; color: var(--text-muted); cursor: pointer;">
                            <i class="fas fa-chevron-down" id="icon-${groupId}"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
            
            ${subs.length > 0 ? `
                <div id="${groupId}" style="display: none; margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--border-color); width: 100%;">
                    <div style="font-size: 0.85em; font-weight: 600; color: var(--text-muted); margin-bottom: 15px; text-transform: uppercase;">Trip Activities</div>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        ${subs.map(sub => `
                            <div style="display: flex; gap: 12px; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid var(--border-color);">
                                <div style="color: var(--accent-blue);"><i class="fas fa-circle-info"></i></div>
                                <div style="flex-grow: 1;">
                                    <div style="font-weight: 600; font-size: 0.9em; color: var(--text-primary);">${sub.title}</div>
                                    <div style="font-size: 0.85em; color: var(--text-secondary);">${sub.message || ''}</div>
                                    <div style="font-size: 0.75em; color: var(--text-muted); margin-top: 4px;">
                                        ${sub.created_at ? formatTime(sub.created_at.toDate()) : ''}
                                    </div>
                                </div>
                                ${!sub.is_read ? `<button onclick="markAsRead('${sub.id}', false, event)" class="mark-read-dot" style="border: none; cursor: pointer;"></button>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

window.toggleGroup = function(id, event) {
    if (event) event.stopPropagation();
    const el = document.getElementById(id);
    const icon = document.getElementById(`icon-${id}`);
    if (el) {
        if (el.style.display === 'none') {
            el.style.display = 'block';
            icon.classList.replace('fa-chevron-down', 'fa-chevron-up');
        } else {
            el.style.display = 'none';
            icon.classList.replace('fa-chevron-up', 'fa-chevron-down');
        }
    }
}

async function markAsRead(id, isAlreadyRead, event) {
    if (event) event.stopPropagation();
    if (isAlreadyRead) return;
    try {
        await updateDoc(doc(db, "notifications", id), {
            is_read: true
        });
    } catch (error) {
        console.error("Error marking notification as read:", error);
    }
}

async function markAllNotificationsAsRead() {
    const q = query(collection(db, "notifications"), 
        where("user_id", "==", currentUserId), 
        where("is_read", "==", false));
    
    try {
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) return;

        const batch = writeBatch(db);
        querySnapshot.forEach((doc) => {
            batch.update(doc.ref, { is_read: true });
        });
        
        await batch.commit();
    } catch (error) {
        console.error("Error marking all as read:", error);
        alert("Failed to mark notifications as read.");
    }
}

function updateBadge(count) {
    const badge = document.querySelector('.notification-badge');
    if (badge) {
        if (count > 0) {
            badge.innerText = count;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }
    
    // Sidebar text counter
    const sidebarCount = document.querySelector('.notif-count');
    if (sidebarCount) {
        sidebarCount.innerText = count;
    }
}

function formatTime(date) {
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return date.toLocaleDateString();
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
}


