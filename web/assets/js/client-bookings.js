import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot, doc, getDoc, orderBy, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { initLayout } from "./modules/ui.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentEmail = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../login.html';
        return;
    }

    currentEmail = user.email;

    // Verify User Data
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const userData = userDoc.exists() ? userDoc.data() : null;
    const name = userData ? userData.full_name : user.email.split('@')[0];

    // Initialize Layout
    initLayout("My Bookings", name);
    setupLogout();
    
    // Initial Load
    loadBookings('all');
    
    // Filter Listener
    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) {
        statusFilter.addEventListener('change', (e) => {
            loadBookings(e.target.value);
        });
    }
});

function loadBookings(status) {
    let q = query(collection(db, "bookings"), 
        where("client_email", "==", currentEmail), 
        orderBy("created_at", "desc"));
    
    if (status !== 'all') {
        q = query(collection(db, "bookings"), 
            where("client_email", "==", currentEmail), 
            where("status", "==", status),
            orderBy("created_at", "desc"));
    }

    const tableBody = document.getElementById('bookingsTableBody');
    
    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">No bookings found.</td></tr>';
            return;
        }

        tableBody.innerHTML = snapshot.docs.map(doc => {
            const data = doc.data();
            const bookingId = doc.id;
            const status = data.status || 'pending';
            
            return `
                <tr>
                    <td>
                        <div style="max-width: 250px; font-size: 0.9em;">
                            <i class="fas fa-circle-dot" style="color: var(--accent-green); font-size: 0.7em;"></i> ${data.pickup_location || 'N/A'}<br>
                            <i class="fas fa-location-dot" style="color: #ff6b6b; font-size: 0.7em;"></i> ${data.dropoff_location || 'N/A'}
                        </div>
                    </td>
                    <td>
                        <div>${data.pickup_date || 'N/A'}</div>
                        <small style="color: var(--text-muted);">${data.pickup_time || ''}</small>
                    </td>
                    <td>${data.passengers || 0}</td>
                    <td><span class="status-badge ${status}">${status}</span></td>
                    <td>
                        <div class="action-buttons" style="display: flex; gap: 8px;">
                            <a href="booking_view.html?id=${bookingId}" class="btn-icon view" title="View Details"><i class="fas fa-eye"></i></a>
                            ${(status === 'scheduled' || status === 'assigned' || status === 'confirmed') ? `
                                <a href="dashboard.html" class="btn-icon track" title="Track on Map" style="color: var(--accent-blue);"><i class="fas fa-location-arrow"></i></a>
                            ` : ''}
                            ${status === 'pending' ? `
                                <button onclick="cancelBooking('${bookingId}')" class="btn-icon delete" title="Cancel Request"><i class="fas fa-times"></i></button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    });

    // Real-time text counter for Notifications
    onSnapshot(query(collection(db, "notifications"), 
        where("user_email", "==", currentEmail),
        where("status", "==", "unread")), (snapshot) => {
        const counters = document.querySelectorAll('.notif-count');
        counters.forEach(counter => {
            counter.innerText = snapshot.size;
        });
    });
}

window.cancelBooking = async (id) => {
    if (confirm("Are you sure you want to cancel this booking?")) {
        try {
            await updateDoc(doc(db, "bookings", id), {
                status: 'cancelled',
                updated_at: serverTimestamp()
            });
            alert("Booking cancelled successfully.");
        } catch (error) {
            console.error("Error cancelling booking:", error);
            alert("Failed to cancel booking: " + error.message);
        }
    }
};


