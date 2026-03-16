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
const scheduleId = urlParams.get('id');

let map, driverMarker, pickupMarker, dropoffMarker;
let isFirstLoad = true;

// ... (lines 18-42 omitted)

function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: 14.5995, lng: 120.9842 }, // Manila
        zoom: 13,
        disableDefaultUI: false,
        zoomControl: true,
        streetViewControl: false,
        mapTypeControl: false
    });
}

function loadTripStatus() {
    onSnapshot(doc(db, "schedules", scheduleId), async (docSnap) => {
        if (!docSnap.exists()) {
            document.getElementById('tripSubtitle').innerText = "Trip record not found.";
            return;
        }

        const data = docSnap.data();
        updateUI(data);
        updateMap(data);
        updateTimeline(data);
    });
}

// ... (updateUI omitted)

function updateMap(data) {
    const pickup = { lat: data.pickup_latitude, lng: data.pickup_longitude };
    const dropoff = { lat: data.dropoff_latitude, lng: data.dropoff_longitude };
    
    // Pickup Marker
    if (!pickupMarker && data.pickup_latitude) {
        pickupMarker = new google.maps.Marker({
            position: pickup,
            map: map,
            title: 'Pickup Location',
            icon: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png'
        });
        const info = new google.maps.InfoWindow({ content: 'Pickup: ' + data.pickup_location });
        pickupMarker.addListener('click', () => info.open(map, pickupMarker));
    }

    // Dropoff Marker
    if (!dropoffMarker && data.dropoff_latitude) {
        dropoffMarker = new google.maps.Marker({
            position: dropoff,
            map: map,
            title: 'Destination',
            icon: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png'
        });
        const info = new google.maps.InfoWindow({ content: 'Destination: ' + data.dropoff_location });
        dropoffMarker.addListener('click', () => info.open(map, dropoffMarker));
    }

    // Driver Marker
    if (data.driver_lat && data.driver_lng) {
        const driverPos = { lat: data.driver_lat, lng: data.driver_lng };
        if (!driverMarker) {
            driverMarker = new google.maps.Marker({
                position: driverPos,
                map: map,
                title: 'Driver',
                icon: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
                zIndex: 1000
            });
            const info = new google.maps.InfoWindow({ content: 'Driver is here' });
            driverMarker.addListener('click', () => info.open(map, driverMarker));
        } else {
            driverMarker.setPosition(driverPos);
        }

        if (isFirstLoad) {
            fitMapToMarkers();
            isFirstLoad = false;
        }
    } else if (isFirstLoad && pickupMarker && dropoffMarker) {
        fitMapToMarkers();
        isFirstLoad = false;
    }
}

function fitMapToMarkers() {
    const bounds = new google.maps.LatLngBounds();
    if (pickupMarker) bounds.extend(pickupMarker.getPosition());
    if (dropoffMarker) bounds.extend(dropoffMarker.getPosition());
    if (driverMarker) bounds.extend(driverMarker.getPosition());
    
    if (!bounds.isEmpty()) {
        map.fitBounds(bounds, 50); // 50px padding
    }
}

function updateTimeline(data) {
    const phases = ['pending', 'started', 'pickup', 'dropoff', 'completed'];
    const currentPhase = data.trip_phase || 'pending';
    const currentIndex = phases.indexOf(currentPhase);
    
    phases.forEach((p, index) => {
        const el = document.getElementById(`phase-${p}`);
        if (!el) return;
        
        el.className = 'phase-step';
        if (index < currentIndex) {
            el.classList.add('completed');
        } else if (index === currentIndex) {
            el.classList.add('active');
        }
        
        // Update time if available
        if (data[`time_${p}`]) {
            const timeEl = document.getElementById(`time-${p}`);
            if (timeEl) timeEl.innerText = data[`time_${p}`];
        }
    });
}


