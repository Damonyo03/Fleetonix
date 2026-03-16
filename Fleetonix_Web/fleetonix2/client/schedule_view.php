<?php
/**
 * Fleettonix - View Schedule Details
 */

session_start();
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db_connect.php';

// Require client access
requireUserType('client');

$currentUser = getCurrentUser();
$schedule_id = isset($_GET['id']) ? (int)$_GET['id'] : 0;

if (!$schedule_id) {
    $_SESSION['error'] = 'Invalid schedule ID';
    header('Location: schedules.php');
    exit;
}

$conn = getConnection();

// Get client ID
$stmt = $conn->prepare("SELECT id FROM clients WHERE user_id = ?");
$stmt->bind_param("i", $currentUser['id']);
$stmt->execute();
$result = $stmt->get_result();
$client = $result->fetch_assoc();
$stmt->close();

if (!$client) {
    $_SESSION['error'] = 'Client profile not found';
    $conn->close();
    header('Location: ../includes/logout.php');
    exit;
}

// Get schedule info with driver location
$stmt = $conn->prepare("
    SELECT s.*, 
           d.user_id as driver_user_id,
           d.id as driver_id,
           u_driver.full_name as driver_name,
           u_driver.email as driver_email,
           u_driver.phone as driver_phone,
           d.vehicle_assigned,
           d.plate_number,
           d.current_latitude,
           d.current_longitude,
           d.last_location_update,
           TIMESTAMPDIFF(SECOND, d.last_location_update, NOW()) as seconds_since_update,
           b.number_of_passengers,
           b.special_instructions,
           b.return_to_pickup,
           b.return_pickup_time
    FROM schedules s
    JOIN bookings b ON s.booking_id = b.id
    JOIN drivers d ON s.driver_id = d.id
    JOIN users u_driver ON d.user_id = u_driver.id
    WHERE s.id = ? AND b.client_id = ?
");
$stmt->bind_param("ii", $schedule_id, $client['id']);
$stmt->execute();
$result = $stmt->get_result();
$schedule = $result->fetch_assoc();
$stmt->close();

if (!$schedule) {
    $_SESSION['error'] = 'Schedule not found';
    $conn->close();
    header('Location: schedules.php');
    exit;
}

// Get GPS tracking points for completed schedules
$gps_points = [];
if ($schedule['status'] === 'completed') {
    $stmt = $conn->prepare("
        SELECT latitude, longitude, speed, heading, accuracy, recorded_at
        FROM gps_tracking
        WHERE schedule_id = ?
        ORDER BY recorded_at ASC
    ");
    $stmt->bind_param("i", $schedule_id);
    $stmt->execute();
    $result = $stmt->get_result();
    while ($row = $result->fetch_assoc()) {
        $gps_points[] = $row;
    }
    $stmt->close();
}

$conn->close();

$page_title = 'Schedule Details #' . $schedule_id;

// Include header
include __DIR__ . '/../includes/client_header.php';
?>

<div class="page-header">
    <h1 class="page-title">Schedule Details</h1>
    <p class="page-subtitle">Schedule #<?php echo $schedule_id; ?></p>
</div>

<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
    <!-- Schedule Information -->
    <div class="form-card">
        <h3 style="color: var(--text-primary); margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">Schedule Information</h3>
        
        <div class="form-group">
            <label>Status</label>
            <div style="padding: 12px; background: var(--bg-input); border-radius: 8px;">
                <span class="status-badge <?php echo strtolower($schedule['status']); ?>">
                    <?php echo ucfirst(str_replace('_', ' ', $schedule['status'])); ?>
                </span>
            </div>
        </div>

        <div class="form-group">
            <label>Assigned Driver</label>
            <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                <strong><?php echo htmlspecialchars($schedule['driver_name']); ?></strong>
                <?php if ($schedule['driver_phone']): ?>
                    <br><small style="color: var(--text-muted);"><?php echo htmlspecialchars($schedule['driver_phone']); ?></small>
                <?php endif; ?>
                <?php if ($schedule['driver_email']): ?>
                    <br><small style="color: var(--text-muted);"><?php echo htmlspecialchars($schedule['driver_email']); ?></small>
                <?php endif; ?>
            </div>
        </div>

        <?php if ($schedule['vehicle_assigned']): ?>
            <div class="form-group">
                <label>Vehicle</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php echo htmlspecialchars($schedule['vehicle_assigned']); ?>
                    <?php if ($schedule['plate_number']): ?>
                        <br><small style="color: var(--text-muted);">Plate: <?php echo htmlspecialchars($schedule['plate_number']); ?></small>
                    <?php endif; ?>
                </div>
            </div>
        <?php endif; ?>

        <div class="form-row">
            <div class="form-group">
                <label>Scheduled Date</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php echo date('F d, Y', strtotime($schedule['scheduled_date'])); ?>
                </div>
            </div>

            <div class="form-group">
                <label>Scheduled Time</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                        <?php 
                        $time = $schedule['scheduled_time'];
                        if (preg_match('/^(\d{1,2}):(\d{2})$/', $time, $matches)) {
                            $hour = (int)$matches[1];
                            $minute = $matches[2];
                            $ampm = $hour >= 12 ? 'PM' : 'AM';
                            $hour12 = $hour > 12 ? $hour - 12 : ($hour == 0 ? 12 : $hour);
                            echo sprintf('%d:%s %s', $hour12, $minute, $ampm);
                        } else {
                            echo date('h:i A', strtotime($time));
                        }
                        ?>
                </div>
            </div>
        </div>

        <div class="form-group">
            <label>Number of Passengers</label>
            <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                <?php echo $schedule['number_of_passengers']; ?>
            </div>
        </div>

        <?php if ($schedule['started_at']): ?>
            <div class="form-group">
                <label>Started At</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php echo date('F d, Y h:i A', strtotime($schedule['started_at'])); ?>
                </div>
            </div>
        <?php endif; ?>

        <?php if ($schedule['completed_at']): ?>
            <div class="form-group">
                <label>Completed At</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php echo date('F d, Y h:i A', strtotime($schedule['completed_at'])); ?>
                </div>
            </div>
        <?php endif; ?>

        <?php if ($schedule['special_instructions']): ?>
            <div class="form-group">
                <label>Special Instructions</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php echo nl2br(htmlspecialchars($schedule['special_instructions'])); ?>
                </div>
            </div>
        <?php endif; ?>

        <div class="page-actions" style="margin-top: 20px;">
            <a href="schedules.php" class="btn btn-secondary">
                <i class="fas fa-arrow-left"></i> Back to Schedules
            </a>
        </div>
    </div>

    <!-- Location Information -->
    <div class="form-card">
        <h3 style="color: var(--text-primary); margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">Location Information</h3>
        
        <h4 style="color: var(--text-primary); margin: 20px 0 15px 0;">Pickup Location</h4>
        <div class="form-group">
            <label>Address</label>
            <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                <?php echo htmlspecialchars($schedule['pickup_location']); ?>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Coordinates</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary); font-size: 0.9rem;">
                    <?php echo $schedule['pickup_latitude']; ?>, <?php echo $schedule['pickup_longitude']; ?>
                </div>
            </div>
        </div>

        <h4 style="color: var(--text-primary); margin: 20px 0 15px 0;">Dropoff Location</h4>
        <div class="form-group">
            <label>Address</label>
            <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                <?php echo htmlspecialchars($schedule['dropoff_location']); ?>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Coordinates</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary); font-size: 0.9rem;">
                    <?php echo $schedule['dropoff_latitude']; ?>, <?php echo $schedule['dropoff_longitude']; ?>
                </div>
            </div>
        </div>

        <?php if ($schedule['estimated_arrival_time']): ?>
            <div class="form-group">
                <label>Estimated Arrival Time</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php 
                    $time = $schedule['estimated_arrival_time'];
                    if (preg_match('/^(\d{1,2}):(\d{2})$/', $time, $matches)) {
                        $hour = (int)$matches[1];
                        $minute = $matches[2];
                        $ampm = $hour >= 12 ? 'PM' : 'AM';
                        $hour12 = $hour > 12 ? $hour - 12 : ($hour == 0 ? 12 : $hour);
                        echo sprintf('%d:%s %s', $hour12, $minute, $ampm);
                    } else {
                        echo date('h:i A', strtotime($time));
                    }
                    ?>
                </div>
            </div>
        <?php endif; ?>

        <?php if ($schedule['actual_arrival_time']): ?>
            <div class="form-group">
                <label>Actual Arrival Time</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php 
                    $time = $schedule['actual_arrival_time'];
                    if (preg_match('/^(\d{1,2}):(\d{2})$/', $time, $matches)) {
                        $hour = (int)$matches[1];
                        $minute = $matches[2];
                        $ampm = $hour >= 12 ? 'PM' : 'AM';
                        $hour12 = $hour > 12 ? $hour - 12 : ($hour == 0 ? 12 : $hour);
                        echo sprintf('%d:%s %s', $hour12, $minute, $ampm);
                    } else {
                        echo date('h:i A', strtotime($time));
                    }
                    ?>
                </div>
            </div>
        <?php endif; ?>
        
        <!-- Driver Location Map (only for active schedules) -->
        <?php if (in_array($schedule['status'], ['pending', 'started', 'in_progress'])): ?>
            <div class="form-group" style="margin-top: 30px;">
                <label>Driver Location & Route</label>
                <div id="schedule-map" style="width: 100%; height: 400px; border-radius: 8px; overflow: hidden; background: var(--bg-secondary); margin-top: 10px;"></div>
                <div id="map-status" style="margin-top: 10px; color: var(--text-muted); font-size: 0.9em; text-align: center;"></div>
            </div>
        <?php endif; ?>
        
        <!-- Driver Route (only for completed schedules) -->
        <?php if ($schedule['status'] === 'completed'): ?>
            <div class="form-group" style="margin-top: 30px;">
                <label>Driver Route</label>
                <div id="driver-route-map" style="width: 100%; height: 400px; border-radius: 8px; overflow: hidden; background: var(--bg-secondary); margin-top: 10px;"></div>
            </div>
        <?php endif; ?>
    </div>
</div>

<?php include __DIR__ . '/../includes/client_footer.php'; ?>

<!-- Mapbox GL JS for Schedule View -->
<?php if (in_array($schedule['status'], ['pending', 'started', 'in_progress'])): ?>
<script src="https://api.mapbox.com/mapbox-gl-js/v3.0.0/mapbox-gl.js"></script>
<link href="https://api.mapbox.com/mapbox-gl-js/v3.0.0/mapbox-gl.css" rel="stylesheet" />

<script>
const MAPBOX_TOKEN = 'YOUR_MAPBOX_TOKEN';
mapboxgl.accessToken = MAPBOX_TOKEN;

let scheduleMap = null;
let driverMarker = null;
let pickupMarker = null;
let dropoffMarker = null;
let updateInterval = null;

// Schedule data from PHP
const scheduleData = {
    pickup: {
        lat: <?php echo $schedule['pickup_latitude']; ?>,
        lng: <?php echo $schedule['pickup_longitude']; ?>,
        address: <?php echo json_encode($schedule['pickup_location']); ?>
    },
    dropoff: {
        lat: <?php echo $schedule['dropoff_latitude']; ?>,
        lng: <?php echo $schedule['dropoff_longitude']; ?>,
        address: <?php echo json_encode($schedule['dropoff_location']); ?>
    },
    driver: {
        id: <?php echo $schedule['driver_id']; ?>,
        name: <?php echo json_encode($schedule['driver_name']); ?>,
        vehicle: <?php echo json_encode($schedule['vehicle_assigned']); ?>,
        plate: <?php echo json_encode($schedule['plate_number']); ?>,
        currentLat: <?php echo $schedule['current_latitude'] ? $schedule['current_latitude'] : 'null'; ?>,
        currentLng: <?php echo $schedule['current_longitude'] ? $schedule['current_longitude'] : 'null'; ?>,
        lastUpdate: <?php echo json_encode($schedule['last_location_update']); ?>,
        secondsSinceUpdate: <?php echo $schedule['seconds_since_update'] ? $schedule['seconds_since_update'] : 'null'; ?>
    },
    returnToPickup: <?php echo $schedule['return_to_pickup'] ? 'true' : 'false'; ?>,
    returnPickupTime: <?php echo json_encode($schedule['return_pickup_time']); ?>
};

function initScheduleMap() {
    if (!document.getElementById('schedule-map')) return;
    
    // Calculate center point
    const centerLat = (scheduleData.pickup.lat + scheduleData.dropoff.lat) / 2;
    const centerLng = (scheduleData.pickup.lng + scheduleData.dropoff.lng) / 2;
    
    scheduleMap = new mapboxgl.Map({
        container: 'schedule-map',
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [centerLng, centerLat],
        zoom: 12
    });

    scheduleMap.on('load', () => {
        displayRouteAndDriver();
        // Update driver location every 10 seconds
        updateInterval = setInterval(updateDriverLocation, 10000);
    });
}

function displayRouteAndDriver() {
    // Clear existing markers
    if (driverMarker) driverMarker.remove();
    if (pickupMarker) pickupMarker.remove();
    if (dropoffMarker) dropoffMarker.remove();
    
    // Add pickup marker
    const pickupEl = document.createElement('div');
    pickupEl.innerHTML = '<i class="fas fa-map-marker-alt" style="color: #10b981; font-size: 32px;"></i>';
    pickupMarker = new mapboxgl.Marker(pickupEl)
        .setLngLat([scheduleData.pickup.lng, scheduleData.pickup.lat])
        .setPopup(new mapboxgl.Popup({ offset: 25 })
            .setHTML(`<div style="padding: 8px;"><strong>Pickup Location</strong><br>${scheduleData.pickup.address}</div>`))
        .addTo(scheduleMap);
    
    // Add dropoff marker
    const dropoffEl = document.createElement('div');
    dropoffEl.innerHTML = '<i class="fas fa-map-marker-alt" style="color: #ef4444; font-size: 32px;"></i>';
    dropoffMarker = new mapboxgl.Marker(dropoffEl)
        .setLngLat([scheduleData.dropoff.lng, scheduleData.dropoff.lat])
        .setPopup(new mapboxgl.Popup({ offset: 25 })
            .setHTML(`<div style="padding: 8px;"><strong>Dropoff Location</strong><br>${scheduleData.dropoff.address}</div>`))
        .addTo(scheduleMap);
    
    // Add driver marker if location available
    if (scheduleData.driver.currentLat && scheduleData.driver.currentLng) {
        const driverEl = document.createElement('div');
        driverEl.className = 'driver-marker';
        driverEl.style.width = '32px';
        driverEl.style.height = '32px';
        driverEl.style.borderRadius = '50%';
        driverEl.style.backgroundColor = '#14b8a6';
        driverEl.style.border = '3px solid white';
        driverEl.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
        driverEl.style.cursor = 'pointer';
        driverEl.style.animation = 'pulse 2s infinite';
        
        const updateText = scheduleData.driver.secondsSinceUpdate !== null 
            ? `Updated ${scheduleData.driver.secondsSinceUpdate}s ago`
            : 'Location available';
        
        driverMarker = new mapboxgl.Marker(driverEl)
            .setLngLat([scheduleData.driver.currentLng, scheduleData.driver.currentLat])
            .setPopup(new mapboxgl.Popup({ offset: 25 })
                .setHTML(`
                    <div style="padding: 8px;">
                        <strong>${scheduleData.driver.name}</strong><br>
                        ${scheduleData.driver.vehicle ? 'Vehicle: ' + scheduleData.driver.vehicle + '<br>' : ''}
                        ${scheduleData.driver.plate ? 'Plate: ' + scheduleData.driver.plate + '<br>' : ''}
                        <small>${updateText}</small>
                    </div>
                `))
            .addTo(scheduleMap);
    }
    
    // Draw route
    drawRoute();
    
    // Fit map to show all points
    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend([scheduleData.pickup.lng, scheduleData.pickup.lat]);
    bounds.extend([scheduleData.dropoff.lng, scheduleData.dropoff.lat]);
    if (scheduleData.driver.currentLat && scheduleData.driver.currentLng) {
        bounds.extend([scheduleData.driver.currentLng, scheduleData.driver.currentLat]);
    }
    scheduleMap.fitBounds(bounds, { padding: 50, maxZoom: 15 });
}

function drawRoute() {
    // Remove existing route layers
    ['route-pickup-dropoff', 'route-return'].forEach(layerId => {
        if (scheduleMap.getLayer(layerId)) {
            scheduleMap.removeLayer(layerId);
            scheduleMap.removeSource(layerId);
        }
    });
    
    // Draw pickup to dropoff route
    fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${scheduleData.pickup.lng},${scheduleData.pickup.lat};${scheduleData.dropoff.lng},${scheduleData.dropoff.lat}?geometries=geojson&access_token=${MAPBOX_TOKEN}`)
        .then(response => response.json())
        .then(data => {
            if (data.routes && data.routes[0]) {
                scheduleMap.addSource('route-pickup-dropoff', {
                    type: 'geojson',
                    data: {
                        type: 'Feature',
                        properties: {},
                        geometry: data.routes[0].geometry
                    }
                });
                
                scheduleMap.addLayer({
                    id: 'route-pickup-dropoff',
                    type: 'line',
                    source: 'route-pickup-dropoff',
                    layout: {
                        'line-join': 'round',
                        'line-cap': 'round'
                    },
                    paint: {
                        'line-color': '#14b8a6',
                        'line-width': 4
                    }
                });
            }
        });
    
    // Draw return route if applicable
    if (scheduleData.returnToPickup) {
        fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${scheduleData.dropoff.lng},${scheduleData.dropoff.lat};${scheduleData.pickup.lng},${scheduleData.pickup.lat}?geometries=geojson&access_token=${MAPBOX_TOKEN}`)
            .then(response => response.json())
            .then(data => {
                if (data.routes && data.routes[0]) {
                    scheduleMap.addSource('route-return', {
                        type: 'geojson',
                        data: {
                            type: 'Feature',
                            properties: {},
                            geometry: data.routes[0].geometry
                        }
                    });
                    
                    scheduleMap.addLayer({
                        id: 'route-return',
                        type: 'line',
                        source: 'route-return',
                        layout: {
                            'line-join': 'round',
                            'line-cap': 'round'
                        },
                    paint: {
                        'line-color': '#14b8a6',
                        'line-width': 4,
                        'line-dasharray': [2, 2]
                    }
                    });
                }
            });
    }
}

function updateDriverLocation() {
    fetch(`../api/client_driver_location.php?schedule_id=<?php echo $schedule_id; ?>`)
        .then(response => response.json())
        .then(data => {
            if (data.success && data.data && data.data.driver && data.data.driver.latitude) {
                // Update driver location
                if (driverMarker) {
                    driverMarker.setLngLat([data.data.driver.longitude, data.data.driver.latitude]);
                } else if (data.data.driver.latitude && data.data.driver.longitude) {
                    // Create driver marker if it doesn't exist
                    const driverEl = document.createElement('div');
                    driverEl.className = 'driver-marker';
                    driverEl.style.width = '32px';
                    driverEl.style.height = '32px';
                    driverEl.style.borderRadius = '50%';
                    driverEl.style.backgroundColor = '#14b8a6';
                    driverEl.style.border = '3px solid white';
                    driverEl.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
                    driverEl.style.cursor = 'pointer';
                    driverEl.style.animation = 'pulse 2s infinite';
                    
                    const updateText = data.data.driver.seconds_since_update !== null 
                        ? `Updated ${data.data.driver.seconds_since_update}s ago`
                        : 'Location available';
                    
                    driverMarker = new mapboxgl.Marker(driverEl)
                        .setLngLat([data.data.driver.longitude, data.data.driver.latitude])
                        .setPopup(new mapboxgl.Popup({ offset: 25 })
                            .setHTML(`
                                <div style="padding: 8px;">
                                    <strong>${data.data.driver.driver_name}</strong><br>
                                    ${data.data.driver.vehicle_assigned ? 'Vehicle: ' + data.data.driver.vehicle_assigned + '<br>' : ''}
                                    ${data.data.driver.plate_number ? 'Plate: ' + data.data.driver.plate_number + '<br>' : ''}
                                    <small>${updateText}</small>
                                </div>
                            `))
                        .addTo(scheduleMap);
                }
                
                updateStatus('Last updated: ' + new Date().toLocaleTimeString());
            } else {
                updateStatus('Driver location not available');
            }
        })
        .catch(error => {
            console.error('Error fetching driver location:', error);
            updateStatus('Error loading driver location');
        });
}

function updateStatus(message) {
    const statusEl = document.getElementById('map-status');
    if (statusEl) {
        statusEl.textContent = message;
    }
}

// Initialize map when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScheduleMap);
} else {
    initScheduleMap();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
});
</script>

<style>
.driver-marker {
    transition: transform 0.2s;
}
.driver-marker:hover {
    transform: scale(1.2);
}
@keyframes pulse {
    0%, 100% {
        transform: scale(1);
        opacity: 1;
    }
    50% {
        transform: scale(1.1);
        opacity: 0.8;
    }
}
</style>
<?php endif; ?>

<!-- Driver Route Map (for completed schedules with GPS data) -->
<?php if ($schedule['status'] === 'completed' && !empty($gps_points)): ?>
<script src="https://api.mapbox.com/mapbox-gl-js/v3.0.0/mapbox-gl.js"></script>
<link href="https://api.mapbox.com/mapbox-gl-js/v3.0.0/mapbox-gl.css" rel="stylesheet" />
<script>
const MAPBOX_TOKEN_ROUTE = 'YOUR_MAPBOX_TOKEN';
mapboxgl.accessToken = MAPBOX_TOKEN_ROUTE;

const pickupLat = <?php echo $schedule['pickup_latitude']; ?>;
const pickupLon = <?php echo $schedule['pickup_longitude']; ?>;
const dropoffLat = <?php echo $schedule['dropoff_latitude']; ?>;
const dropoffLon = <?php echo $schedule['dropoff_longitude']; ?>;
const gpsPoints = <?php echo json_encode($gps_points); ?>;

const routeMap = new mapboxgl.Map({
    container: 'driver-route-map',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [pickupLon, pickupLat],
    zoom: 12
});

routeMap.on('load', function() {
    // Add pickup marker
    new mapboxgl.Marker({ color: '#0d6efd' })
        .setLngLat([pickupLon, pickupLat])
        .setPopup(new mapboxgl.Popup().setHTML('<strong>Pickup Location</strong><br>' + <?php echo json_encode($schedule['pickup_location']); ?>))
        .addTo(routeMap);
    
    // Add dropoff marker
    new mapboxgl.Marker({ color: '#28a745' })
        .setLngLat([dropoffLon, dropoffLat])
        .setPopup(new mapboxgl.Popup().setHTML('<strong>Dropoff Location</strong><br>' + <?php echo json_encode($schedule['dropoff_location']); ?>))
        .addTo(routeMap);
    
        // Add GPS tracking line if available
        if (gpsPoints.length > 0) {
            const gpsCoordinates = gpsPoints.map(point => [point.longitude, point.latitude]);
            routeMap.addSource('gps-track', {
                'type': 'geojson',
                'data': {
                    'type': 'Feature',
                    'geometry': {
                        'type': 'LineString',
                        'coordinates': gpsCoordinates
                    }
                }
            });
            routeMap.addLayer({
                'id': 'gps-track',
                'type': 'line',
                'source': 'gps-track',
                'layout': {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                'paint': {
                    'line-color': '#14b8a6',
                    'line-width': 4,
                    'line-opacity': 0.8
                }
            });
            
            // Animate car along GPS track
            let animatedCarMarker = null;
            let currentPointIndex = 0;
            const animationSpeed = 50; // milliseconds per point
            
            function animateCar() {
                if (currentPointIndex >= gpsPoints.length) {
                    // Stop at final location - don't loop
                    return;
                }
                
                const point = gpsPoints[currentPointIndex];
                
                if (!animatedCarMarker) {
                    const markerEl = document.createElement('div');
                    markerEl.className = 'driver-marker';
                    markerEl.style.width = '32px';
                    markerEl.style.height = '32px';
                    markerEl.style.borderRadius = '50%';
                    markerEl.style.backgroundColor = '#14b8a6';
                    markerEl.style.border = '3px solid white';
                    markerEl.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
                    markerEl.style.cursor = 'pointer';
                    markerEl.style.animation = 'pulse 1s infinite';
                    
                    animatedCarMarker = new mapboxgl.Marker(markerEl)
                        .setLngLat([point.longitude, point.latitude])
                        .setPopup(new mapboxgl.Popup({ offset: 25 })
                            .setHTML(`
                                <div style="padding: 8px;">
                                    <strong>Driver Location</strong><br>
                                    ${currentPointIndex === gpsPoints.length - 1 ? 'Trip completed' : 'Moving along route'}
                                </div>
                            `))
                        .addTo(routeMap);
                } else {
                    animatedCarMarker.setLngLat([point.longitude, point.latitude]);
                    
                    // Update popup text and remove animation when reaching final point
                    if (currentPointIndex === gpsPoints.length - 1) {
                        const markerEl = animatedCarMarker.getElement();
                        markerEl.style.animation = 'none';
                        animatedCarMarker.setPopup(new mapboxgl.Popup({ offset: 25 })
                            .setHTML(`
                                <div style="padding: 8px;">
                                    <strong>Driver Location</strong><br>
                                    Trip completed
                                </div>
                            `));
                    }
                }
                
                currentPointIndex++;
                if (currentPointIndex < gpsPoints.length) {
                    setTimeout(animateCar, animationSpeed);
                }
            }
            
            // Start animation
            animateCar();
            
            // Fit bounds to show entire GPS track
            const bounds = new mapboxgl.LngLatBounds();
            bounds.extend([pickupLon, pickupLat]);
            bounds.extend([dropoffLon, dropoffLat]);
            gpsPoints.forEach(point => {
                bounds.extend([point.longitude, point.latitude]);
            });
            routeMap.fitBounds(bounds, { padding: 50 });
        } else {
            // If no GPS points, fit to pickup and dropoff
            const bounds = new mapboxgl.LngLatBounds();
            bounds.extend([pickupLon, pickupLat]);
            bounds.extend([dropoffLon, dropoffLat]);
            routeMap.fitBounds(bounds, { padding: 50 });
        }
});
</script>
<?php endif; ?>

