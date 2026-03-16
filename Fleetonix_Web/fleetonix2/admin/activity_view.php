<?php
/**
 * Fleettonix - View Activity Details (Completed Trip)
 */

session_start();
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db_connect.php';

// Require admin access
requireUserType('admin');

$currentUser = getCurrentUser();
$activity_id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
$schedule_id = isset($_GET['schedule_id']) ? (int)$_GET['schedule_id'] : 0;

if (!$activity_id || !$schedule_id) {
    $_SESSION['error'] = 'Invalid activity or schedule ID';
    header('Location: activity.php');
    exit;
}

$conn = getConnection();

// Get activity details
$stmt = $conn->prepare("
    SELECT da.*, 
           d.user_id as driver_user_id,
           u.full_name as driver_name,
           u.email as driver_email,
           u.phone as driver_phone,
           d.license_number,
           d.vehicle_assigned,
           d.plate_number
    FROM driver_activity da
    JOIN drivers d ON da.driver_id = d.id
    JOIN users u ON d.user_id = u.id
    WHERE da.id = ?
");
$stmt->bind_param("i", $activity_id);
$stmt->execute();
$result = $stmt->get_result();
$activity = $result->fetch_assoc();
$stmt->close();

if (!$activity) {
    $_SESSION['error'] = 'Activity not found';
    $conn->close();
    header('Location: activity.php');
    exit;
}

// Get schedule and booking details
$stmt = $conn->prepare("
    SELECT s.*,
           b.pickup_location, b.pickup_latitude, b.pickup_longitude,
           b.dropoff_location, b.dropoff_latitude, b.dropoff_longitude,
           b.number_of_passengers, b.special_instructions,
           b.return_to_pickup, b.return_pickup_time,
           c.company_name,
           u_client.full_name as client_name,
           u_client.email as client_email,
           u_client.phone as client_phone
    FROM schedules s
    JOIN bookings b ON s.booking_id = b.id
    JOIN clients c ON b.client_id = c.id
    JOIN users u_client ON c.user_id = u_client.id
    WHERE s.id = ?
");
$stmt->bind_param("i", $schedule_id);
$stmt->execute();
$result = $stmt->get_result();
$schedule = $result->fetch_assoc();
$stmt->close();

if (!$schedule) {
    $_SESSION['error'] = 'Schedule not found';
    $conn->close();
    header('Location: activity.php');
    exit;
}

// Get GPS tracking points for this schedule
$stmt = $conn->prepare("
    SELECT latitude, longitude, speed, heading, accuracy, recorded_at
    FROM gps_tracking
    WHERE schedule_id = ? AND driver_id = ?
    ORDER BY recorded_at ASC
");
$stmt->bind_param("ii", $schedule_id, $activity['driver_id']);
$stmt->execute();
$result = $stmt->get_result();
$gps_points = [];
while ($row = $result->fetch_assoc()) {
    $gps_points[] = $row;
}
$stmt->close();

$conn->close();

$page_title = 'Trip Details - Activity #' . $activity_id;

// Include header
include __DIR__ . '/../includes/admin_header.php';
?>

<div class="page-header">
    <h1 class="page-title">Trip Details</h1>
    <p class="page-subtitle">Completed trip information and route</p>
</div>

<!-- Combined Information Card -->
<div class="form-card" style="max-width: 100% !important; margin-left: 0 !important; margin-right: 0 !important; width: 100%;">
    <h3 style="color: var(--text-primary); margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">Trip Information</h3>
    
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 30px;">
        <!-- Driver Information -->
        <div>
            <h4 style="color: var(--text-primary); margin-bottom: 15px; font-size: 1rem;">Driver Information</h4>
            <div class="form-group">
                <label>Driver Name</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php echo htmlspecialchars($activity['driver_name']); ?>
                </div>
            </div>
            <div class="form-group">
                <label>Email</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary); font-size: 0.9rem;">
                    <?php echo htmlspecialchars($activity['driver_email']); ?>
                </div>
            </div>
            <?php if ($activity['driver_phone']): ?>
            <div class="form-group">
                <label>Phone</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php echo htmlspecialchars($activity['driver_phone']); ?>
                </div>
            </div>
            <?php endif; ?>
            <div class="form-group">
                <label>License Number</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php echo htmlspecialchars($activity['license_number'] ?? 'N/A'); ?>
                </div>
            </div>
            <div class="form-group">
                <label>Vehicle</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php echo htmlspecialchars($activity['vehicle_assigned'] ?? 'N/A'); ?>
                    <?php if ($activity['plate_number']): ?>
                        <br><small style="color: var(--text-muted);">Plate: <?php echo htmlspecialchars($activity['plate_number']); ?></small>
                    <?php endif; ?>
                </div>
            </div>
        </div>

        <!-- Task Information -->
        <div>
            <h4 style="color: var(--text-primary); margin-bottom: 15px; font-size: 1rem;">Task Information</h4>
            <div class="form-group">
                <label>Client</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <strong><?php echo htmlspecialchars($schedule['company_name']); ?></strong><br>
                    <small style="color: var(--text-muted);"><?php echo htmlspecialchars($schedule['client_name']); ?></small>
                </div>
            </div>
            <div class="form-group">
                <label>Scheduled Date & Time</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php echo date('F d, Y', strtotime($schedule['scheduled_date'])); ?><br>
                    <small style="color: var(--text-muted);"><?php echo date('h:i A', strtotime($schedule['scheduled_time'])); ?></small>
                </div>
            </div>
            <?php if ($schedule['started_at']): ?>
            <div class="form-group">
                <label>Started At</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary); font-size: 0.9rem;">
                    <?php echo date('M d, Y h:i A', strtotime($schedule['started_at'])); ?>
                </div>
            </div>
            <?php endif; ?>
            <?php if ($schedule['completed_at']): ?>
            <div class="form-group">
                <label>Completed At</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary); font-size: 0.9rem;">
                    <?php echo date('M d, Y h:i A', strtotime($schedule['completed_at'])); ?>
                </div>
            </div>
            <?php endif; ?>
            <div class="form-group">
                <label>Passengers</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php echo $schedule['number_of_passengers']; ?>
                </div>
            </div>
            <?php if ($schedule['return_to_pickup']): ?>
            <div class="form-group">
                <label>Return to Pickup</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    Yes
                    <?php if ($schedule['return_pickup_time']): ?>
                        <br><small style="color: var(--text-muted);">Return time: <?php echo date('h:i A', strtotime($schedule['return_pickup_time'])); ?></small>
                    <?php endif; ?>
                </div>
            </div>
            <?php endif; ?>
        </div>

        <!-- Route Information -->
        <div>
            <h4 style="color: var(--text-primary); margin-bottom: 15px; font-size: 1rem;">Route Information</h4>
            <div class="form-group">
                <label>Pickup Location</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary); font-size: 0.9rem;">
                    <?php echo htmlspecialchars($schedule['pickup_location']); ?>
                </div>
            </div>
            <div class="form-group">
                <label>Dropoff Location</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary); font-size: 0.9rem;">
                    <?php echo htmlspecialchars($schedule['dropoff_location']); ?>
                </div>
            </div>
        </div>
    </div>

    <!-- Route Map - Only GPS Tracking Line -->
    <h4 style="color: var(--text-primary); margin-bottom: 15px; font-size: 1rem;">Driver Route</h4>
    <div id="routeMap" style="width: 100%; height: 500px; border-radius: 8px; overflow: hidden; background: var(--bg-input);"></div>
</div>

<div class="page-actions" style="margin-top: 20px;">
    <a href="activity.php" class="btn btn-secondary">
        <i class="fas fa-arrow-left"></i> Back to Activity Logs
    </a>
</div>

<script src='https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.js'></script>
<link href='https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.css' rel='stylesheet' />
<script>
    mapboxgl.accessToken = 'YOUR_MAPBOX_TOKEN';
    
    const pickupLat = <?php echo $schedule['pickup_latitude']; ?>;
    const pickupLon = <?php echo $schedule['pickup_longitude']; ?>;
    const dropoffLat = <?php echo $schedule['dropoff_latitude']; ?>;
    const dropoffLon = <?php echo $schedule['dropoff_longitude']; ?>;
    const returnToPickup = <?php echo $schedule['return_to_pickup'] ? 'true' : 'false'; ?>;
    
    // GPS tracking points
    const gpsPoints = <?php echo json_encode($gps_points); ?>;
    
    const map = new mapboxgl.Map({
        container: 'routeMap',
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [pickupLon, pickupLat],
        zoom: 12
    });
    
    map.on('load', function() {
        // Add pickup marker
        new mapboxgl.Marker({ color: '#0d6efd' })
            .setLngLat([pickupLon, pickupLat])
            .setPopup(new mapboxgl.Popup().setHTML('<strong>Pickup Location</strong><br>' + <?php echo json_encode($schedule['pickup_location']); ?>))
            .addTo(map);
        
        // Add dropoff marker
        new mapboxgl.Marker({ color: '#28a745' })
            .setLngLat([dropoffLon, dropoffLat])
            .setPopup(new mapboxgl.Popup().setHTML('<strong>Dropoff Location</strong><br>' + <?php echo json_encode($schedule['dropoff_location']); ?>))
            .addTo(map);
        
        // Add GPS tracking line if available
        if (gpsPoints.length > 0) {
            const gpsCoordinates = gpsPoints.map(point => [point.longitude, point.latitude]);
            map.addSource('gps-track', {
                'type': 'geojson',
                'data': {
                    'type': 'Feature',
                    'geometry': {
                        'type': 'LineString',
                        'coordinates': gpsCoordinates
                    }
                }
            });
            map.addLayer({
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
                        .addTo(map);
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
            map.fitBounds(bounds, { padding: 50 });
        } else {
            // If no GPS points, fit to pickup and dropoff
            const bounds = new mapboxgl.LngLatBounds();
            bounds.extend([pickupLon, pickupLat]);
            bounds.extend([dropoffLon, dropoffLat]);
            map.fitBounds(bounds, { padding: 50 });
        }
    });
</script>

<style>
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

<?php include __DIR__ . '/../includes/admin_footer.php'; ?>

