import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, serverTimestamp, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { initLayout } from "./modules/ui.js";
import { sanitizeFirestoreData } from "./modules/data.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUserData = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../login.html';
        return;
    }

    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists()) {
        currentUserData = userDoc.data();
        const name = currentUserData.full_name || user.email.split('@')[0];
        initLayout('New Booking', name);
    } else {
        initLayout('New Booking', user.email.split('@')[0]);
    }
});

const bookingForm = document.getElementById('newBookingForm');
const submitBtn = document.getElementById('submitBtn');

if (bookingForm) {
    bookingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!auth.currentUser) {
            alert("You must be logged in to create a booking.");
            return;
        }

        const pickup_location = document.getElementById('pickup_location').value;
        const pickup_lat = parseFloat(document.getElementById('pickup_latitude').value);
        const pickup_lng = parseFloat(document.getElementById('pickup_longitude').value);
        
        const dropoff_location = document.getElementById('dropoff_location').value;
        const dropoff_lat = parseFloat(document.getElementById('dropoff_latitude').value);
        const dropoff_lng = parseFloat(document.getElementById('dropoff_longitude').value);
        
        const pickup_date = document.getElementById('pickup_date').value;
        const pickup_time = document.getElementById('pickup_time').value;
        const passengers = parseInt(document.getElementById('passengers').value);
        const return_to_pickup = document.getElementById('return_to_pickup').checked;
        const special_instructions = document.getElementById('special_instructions').value;

        // Basic validation
        if (pickup_lat === 0 || pickup_lng === 0 || dropoff_lat === 0 || dropoff_lng === 0) {
            alert("Please select valid addresses from the search suggestions.");
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerText = 'Creating Booking...';

        try {
            const bookingData = sanitizeFirestoreData({
                client_id: auth.currentUser.uid,
                client_name: currentUserData ? currentUserData.full_name : auth.currentUser.email,
                client_email: auth.currentUser.email,
                client_phone: currentUserData?.phone,
                company_name: currentUserData?.company_name,
                pickup_location,
                pickup_latitude: pickup_lat,
                pickup_longitude: pickup_lng,
                dropoff_location,
                dropoff_latitude: dropoff_lat,
                dropoff_longitude: dropoff_lng,
                pickup_date,
                pickup_time,
                passengers,
                return_to_pickup,
                special_instructions,
                status: 'pending',
                created_at: serverTimestamp(),
                updated_at: serverTimestamp()
            });

            const docRef = await addDoc(collection(db, "bookings"), bookingData);
            console.log("Booking created with ID:", docRef.id);
            
            // Create a notification for admins? 
            // Better handled by a Cloud Function trigger
            
            alert("Booking created successfully!");
            window.location.href = 'dashboard.html';
        } catch (error) {
            console.error("Error creating booking:", error);
            alert("Failed to create booking: " + error.message);
            submitBtn.disabled = false;
            submitBtn.innerText = 'Create Booking';
        }
    });
}
