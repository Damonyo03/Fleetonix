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
        updateTimeline(data);
        
        // Ensure static markers are set (pickup/dropoff)
        updateMap(data);

        // Live Driver Tracking from driver_locations
        if (data.driver_email) {
            onSnapshot(doc(db, "driver_locations", data.driver_email), (locSnap) => {
                if (locSnap.exists()) {
                    const locData = locSnap.data();
                    if (locData.current_latitude && locData.current_longitude) {
                        const driverPos = { lat: locData.current_latitude, lng: locData.current_longitude };
                        updateDriverMarker(driverPos);
                    }
                }
            });
        }
    });
}

// ... (updateUI omitted)

function updateMap(data) {
    // Note: Schema uses pickup_location and dropoff_location as objects
    const pickup = data.pickup_location || {};
    const dropoff = data.dropoff_location || {};
    
    // Pickup Marker
    if (!pickupMarker && pickup.latitude) {
        pickupMarker = new google.maps.Marker({
            position: { lat: pickup.latitude, lng: pickup.longitude },
            map: map,
            title: 'Pickup Location',
            icon: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png'
        });
        const info = new google.maps.InfoWindow({ content: 'Pickup: ' + (pickup.text || 'Location A') });
        pickupMarker.addListener('click', () => info.open(map, pickupMarker));
    }

    // Dropoff Marker
    if (!dropoffMarker && dropoff.latitude) {
        dropoffMarker = new google.maps.Marker({
            position: { lat: dropoff.latitude, lng: dropoff.longitude },
            map: map,
            title: 'Destination',
            icon: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png'
        });
        const info = new google.maps.InfoWindow({ content: 'Destination: ' + (dropoff.text || 'Location B') });
        dropoffMarker.addListener('click', () => info.open(map, dropoffMarker));
    }

    if (isFirstLoad && pickupMarker && dropoffMarker) {
        fitMapToMarkers();
        isFirstLoad = false;
    }
}

function updateDriverMarker(driverPos) {
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


