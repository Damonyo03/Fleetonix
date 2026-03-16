import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { initLayout } from "./modules/ui.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const urlParams = new URLSearchParams(window.location.search);
const bookingId = urlParams.get('id');

if (!bookingId) {
    window.location.href = 'bookings.html';
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../login.html';
        return;
    }

    // Verify User Data
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const userData = userDoc.exists() ? userDoc.data() : null;
    const name = userData ? userData.full_name : user.email.split('@')[0];

    // Initialize Layout
    initLayout("Booking Details", name);
    setupLogout();
    
    // Initial Load
    document.getElementById('bookingIdTitle').innerText = `Booking #${bookingId.substring(0, 8)}`;
    loadBookingDetails();
});

function loadBookingDetails() {
    const detailsContainer = document.getElementById('bookingDetails');
    
    onSnapshot(doc(db, "bookings", bookingId), (docSnap) => {
        if (!docSnap.exists()) {
            detailsContainer.innerHTML = '<p style="text-align: center; color: #ff6b6b;">Booking not found.</p>';
            return;
        }

        const data = docSnap.data();
        const status = data.status || 'pending';
        
        detailsContainer.innerHTML = `
            <div class="view-row">
                <div class="view-item">
                    <label>Status</label>
                    <div class="value"><span class="status-badge ${status}">${status.toUpperCase()}</span></div>
                </div>
                <div class="view-item">
                    <label>Created At</label>
                    <div class="value">${data.created_at ? data.created_at.toDate().toLocaleString() : 'N/A'}</div>
                </div>
            </div>
            
            <div class="divider"></div>
            
            <div class="view-row">
                <div class="view-item full">
                    <label>Pickup Location</label>
                    <div class="value">${data.pickup_location || 'N/A'}</div>
                </div>
            </div>
            
            <div class="view-row">
                <div class="view-item full">
                    <label>Dropoff Location</label>
                    <div class="value">${data.dropoff_location || 'N/A'}</div>
                </div>
            </div>
            
            <div class="view-row">
                <div class="view-item">
                    <label>Date & Time</label>
                    <div class="value">${data.pickup_date || 'N/A'} at ${data.pickup_time || 'N/A'}</div>
                </div>
                <div class="view-item">
                    <label>Passengers</label>
                    <div class="value">${data.passengers || 0} People</div>
                </div>
            </div>
            
            <div class="divider"></div>
            
            <div class="view-row">
                <div class="view-item">
                    <label>Return to Pickup</label>
                    <div class="value">${data.return_to_pickup ? 'Yes' : 'No'}</div>
                </div>
                <div class="view-item">
                    <label>Company</label>
                    <div class="value">${data.company_name || 'N/A'}</div>
                </div>
            </div>
            
            <div class="view-row">
                <div class="view-item full">
                    <label>Special Instructions</label>
                    <div class="value">${data.special_instructions || 'None provided'}</div>
                </div>
            </div>
        `;
    });
}


