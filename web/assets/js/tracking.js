import { initializeApp } from "firebase/app";
import { getFirestore, doc, onSnapshot, getDoc } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

// Using the same config as the rest of the app
const firebaseConfig = {
    apiKey: "AIzaSyBWal4kXhImWNvJL2jV4LG0FvftdN2J9DQ",
    authDomain: "appfleetonix.firebaseapp.com",
    projectId: "appfleetonix",
    storageBucket: "appfleetonix.appspot.com",
    messagingSenderId: "565011667041",
    appId: "1:565011667041:web:d824d6215904fc7728ce83"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let googleMap = null;
let driverMarker = null;
let destinationMarker = null;
let tripId = new URLSearchParams(window.location.search).get('tripId');

async function initTracking() {
    if (!tripId) {
        showError("Invalid or missing Trip ID.");
        return;
    }

    document.getElementById('trip-id-display').textContent = `TRIP-ID: ${tripId.substring(0, 8).toUpperCase()}`;

    // ADD THIS BLOCK to satisfy your firestore.rules
    try {
        await signInAnonymously(auth);
    } catch (error) {
        showError("Authentication failed: " + error.message);
        return;
    }

    // 1. Fetch Trip Details
    const tripSnap = await getDoc(doc(db, "schedules", tripId));
    if (!tripSnap.exists()) {
        showError("Trip not found or has been completed.");
        return;
    }

    const tripData = tripSnap.data();
    updateTripUI(tripData);

    // 2. Initialize Google Map
    initMap(tripData);

        // 3. Keep Trip Data in Sync (Real-time for Re-routing)
        onSnapshot(doc(db, "schedules", tripId), (tripSnap) => {
            if (tripSnap.exists()) {
                const updatedTripData = tripSnap.data();
                updateRecommendedPath(updatedTripData.route_polyline || updatedTripData.recommended_route_polyline);
                updateTripUI(updatedTripData);
            }
        });

        // 4. Listen to Driver Location
        onSnapshot(doc(db, "driver_locations", tripData.driver_id), (locSnap) => {
            if (locSnap.exists()) {
                const loc = locSnap.data();
                updateDriverLocation(loc);
                document.getElementById('loading-overlay').style.display = 'none';
            }
        });
}

let recommendedPath = null;
let actualPathLine = null;
let actualPathPoints = [];

function initMap(tripData) {
    const defaultPos = { lat: 14.5995, lng: 120.9842 }; // Manila
    
    googleMap = new google.maps.Map(document.getElementById("map"), {
        zoom: 15,
        center: defaultPos,
        styles: [
            { "elementType": "geometry", "stylers": [{ "color": "#212121" }] },
            { "elementType": "labels.icon", "stylers": [{ "visibility": "off" }] },
            { "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
            { "elementType": "labels.text.stroke", "stylers": [{ "color": "#212121" }] },
            { "featureType": "administrative", "elementType": "geometry", "stylers": [{ "color": "#757575" }] },
            { "featureType": "poi", "elementType": "geometry", "stylers": [{ "color": "#181818" }] },
            { "featureType": "road", "elementType": "geometry.fill", "stylers": [{ "color": "#2c2c2c" }] },
            { "featureType": "road", "elementType": "labels.text.fill", "stylers": [{ "color": "#8a8a8a" }] },
            { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#000000" }] }
        ],
        disableDefaultUI: true
    });

    // Destination Marker
    if (tripData.dropoff_location && tripData.dropoff_location.lat) {
        destinationMarker = new google.maps.Marker({
            position: { lat: tripData.dropoff_location.lat, lng: tripData.dropoff_location.lng },
            map: googleMap,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 10,
                fillColor: "#00ff88",
                fillOpacity: 1,
                strokeWeight: 2,
                strokeColor: "#ffffff",
            },
            title: "Destination"
        });
    }

    // Recommended Route (Dashed)
    const poly = tripData.recommended_route_polyline || tripData.route_polyline;
    if (poly) {
        try {
            const decodedPath = google.maps.geometry.encoding.decodePath(poly);
            recommendedPath = new google.maps.Polyline({
                path: decodedPath,
                strokeColor: "#64748b",
                strokeOpacity: 0.6,
                strokeWeight: 4,
                map: googleMap,
                icons: [{
                    icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 2 },
                    offset: '0',
                    repeat: '10px'
                }]
            });
        } catch (e) {
            console.error("Error decoding recommended path:", e);
        }
    }

    // Initialize Actual Route Line (With history if exists)
    if (tripData.actual_route_polyline) {
        try {
            actualPathPoints = google.maps.geometry.encoding.decodePath(tripData.actual_route_polyline).map(p => ({ lat: p.lat(), lng: p.lng() }));
        } catch (e) {
            console.warn("Could not load historical breadcrumbs:", e);
        }
    }

    actualPathLine = new google.maps.Polyline({
        path: actualPathPoints,
        strokeColor: "#00d4ff",
        strokeOpacity: 1.0,
        strokeWeight: 6,
        map: googleMap
    });
}

function updateRecommendedPath(poly) {
    if (!poly || !googleMap) return;
    
    try {
        const decodedPath = google.maps.geometry.encoding.decodePath(poly);
        if (recommendedPath) {
            recommendedPath.setPath(decodedPath);
        } else {
            recommendedPath = new google.maps.Polyline({
                path: decodedPath,
                strokeColor: "#64748b",
                strokeOpacity: 0.6,
                strokeWeight: 4,
                map: googleMap,
                icons: [{
                    icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 2 },
                    offset: '0',
                    repeat: '10px'
                }]
            });
        }
    } catch (e) {
        console.error("Error updating recommended path:", e);
    }
}

function updateDriverLocation(loc) {
    const pos = { 
        lat: loc.current_latitude || loc.latitude, 
        lng: loc.current_longitude || loc.longitude 
    };

    if (!pos.lat || !pos.lng) return;

    // Update actual path
    actualPathPoints.push(pos);
    actualPathLine.setPath(actualPathPoints);

    if (!driverMarker) {
        driverMarker = new google.maps.Marker({
            position: pos,
            map: googleMap,
            icon: {
                url: 'img/car-marker.png',
                scaledSize: new google.maps.Size(40, 40),
                anchor: new google.maps.Point(20, 20)
            }
        });
        googleMap.setCenter(pos);
    } else {
        animateMarker(driverMarker, pos);
    }

    // Adjust bounds
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(pos);
    if (destinationMarker) bounds.extend(destinationMarker.getPosition());
    if (actualPathPoints.length > 1) {
        actualPathPoints.forEach(p => bounds.extend(p));
    }
    googleMap.fitBounds(bounds, 100);
}

function animateMarker(marker, newPos) {
    const frames = 60;
    const startPos = marker.getPosition().toJSON();
    let currentFrame = 0;

    const animate = () => {
        currentFrame++;
        const lat = startPos.lat + (newPos.lat - startPos.lat) * (currentFrame / frames);
        const lng = startPos.lng + (newPos.lng - startPos.lng) * (currentFrame / frames);
        marker.setPosition({ lat, lng });

        if (currentFrame < frames) {
            requestAnimationFrame(animate);
        }
    };
    animate();
}

function updateTripUI(data) {
    document.getElementById('pickup-text').textContent = data.pickup_location?.address || 'Standard Terminal';
    document.getElementById('dropoff-text').textContent = data.dropoff_location?.address || 'Assigned Dropoff';
    document.getElementById('driver-name').textContent = data.driver_name || 'Driver Assigned';
    document.getElementById('vehicle-details').textContent = data.vehicle_details || 'Official Fleet Vehicle';
    
    if (data.driver_phone) {
        document.getElementById('call-link').href = `tel:${data.driver_phone}`;
    }
    
    if (data.driver_image) {
        document.getElementById('driver-avatar').src = data.driver_image;
    }
}

function showError(msg) {
    const loader = document.getElementById('loading-overlay');
    loader.innerHTML = `
        <i class="fas fa-exclamation-triangle" style="font-size:3rem; color:#ff4757; margin-bottom:20px;"></i>
        <p style="font-weight:700;">TRACKING UNAVAILABLE</p>
        <p style="color:var(--text-muted); padding:0 40px; text-align:center;">${msg}</p>
        <button onclick="location.reload()" class="btn btn-secondary" style="margin-top:20px;">Retry Connection</button>
    `;
}

// Global initialization
window.addEventListener('load', initTracking);
