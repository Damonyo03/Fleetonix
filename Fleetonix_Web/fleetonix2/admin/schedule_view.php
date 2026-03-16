<?php
/**
 * Fleettonix - View Schedule Details
 */

session_start();
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db_connect.php';

// Require admin access
requireUserType('admin');

$currentUser = getCurrentUser();
$schedule_id = isset($_GET['id']) ? (int)$_GET['id'] : 0;

if (!$schedule_id) {
    $_SESSION['error'] = 'Invalid schedule ID';
    header('Location: schedules.php');
    exit;
}

$conn = getConnection();

// Get schedule info
$stmt = $conn->prepare("
    SELECT s.*, 
           d.user_id as driver_user_id,
           u_driver.full_name as driver_name,
           u_driver.email as driver_email,
           u_driver.phone as driver_phone,
           d.vehicle_assigned,
           d.plate_number,
           c.company_name,
           u_client.full_name as client_name,
           b.number_of_passengers,
           b.special_instructions,
           b.return_to_pickup,
           b.return_pickup_time
    FROM schedules s
    JOIN drivers d ON s.driver_id = d.id
    JOIN users u_driver ON d.user_id = u_driver.id
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
    header('Location: schedules.php');
    exit;
}

$conn->close();

$page_title = 'Schedule Details #' . $schedule_id;

// Include header
include __DIR__ . '/../includes/admin_header.php';
?>

<div class="page-header">
    <h1 class="page-title">Schedule Details</h1>
    <p class="page-subtitle">Schedule #<?php echo $schedule_id; ?> - <?php echo htmlspecialchars($schedule['company_name']); ?></p>
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
                <strong><?php echo htmlspecialchars($schedule['driver_name']); ?></strong><br>
                <small style="color: var(--text-muted);">
                    <?php echo htmlspecialchars($schedule['driver_email']); ?><br>
                    <?php if ($schedule['vehicle_assigned']): ?>
                        Vehicle: <?php echo htmlspecialchars($schedule['vehicle_assigned']); ?>
                        <?php if ($schedule['plate_number']): ?>
                            (<?php echo htmlspecialchars($schedule['plate_number']); ?>)
                        <?php endif; ?>
                    <?php endif; ?>
                </small>
            </div>
        </div>

        <div class="form-group">
            <label>Client</label>
            <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                <strong><?php echo htmlspecialchars($schedule['company_name']); ?></strong><br>
                <small style="color: var(--text-muted);"><?php echo htmlspecialchars($schedule['client_name']); ?></small>
            </div>
        </div>

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
                    <?php echo date('h:i A', strtotime($schedule['scheduled_time'])); ?>
                </div>
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

        <div class="form-group">
            <label>Number of Passengers</label>
            <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                <?php echo $schedule['number_of_passengers']; ?>
            </div>
        </div>

        <?php if ($schedule['special_instructions']): ?>
            <div class="form-group">
                <label>Special Instructions</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php echo nl2br(htmlspecialchars($schedule['special_instructions'])); ?>
                </div>
            </div>
        <?php endif; ?>

        <div class="page-actions" style="margin-top: 20px;">
            <a href="schedule_edit.php?id=<?php echo $schedule_id; ?>" class="btn btn-primary">
                <i class="fas fa-edit"></i> Edit Schedule
            </a>
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

        <div class="form-group">
            <label>Return to Pickup Point</label>
            <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary); display: flex; justify-content: space-between; align-items: center;">
                <span>
                    <?php if (!empty($schedule['return_to_pickup'])): ?>
                        <strong style="color: #ff6b35;">Yes</strong>
                        <?php if (!empty($schedule['return_pickup_time'])): ?>
                            <span style="color: var(--text-muted); margin-left: 8px;">
                                Return Pickup Time: <?php echo date('h:i A', strtotime($schedule['return_pickup_time'])); ?>
                            </span>
                        <?php endif; ?>
                    <?php else: ?>
                        <span style="color: var(--text-muted);">No return trip required</span>
                    <?php endif; ?>
                </span>
            </div>
        </div>

        <div class="form-group">
            <label>Route Preview</label>
            <div id="scheduleRouteMap" style="width: 100%; height: 320px; border-radius: 12px; overflow: hidden;"></div>
            <small style="color: var(--text-muted); display: block; margin-top: 8px;">
                Visual preview of the pickup and dropoff locations.
            </small>
        </div>

        <?php if ($schedule['estimated_arrival_time']): ?>
            <div class="form-group">
                <label>Estimated Arrival Time</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php echo date('h:i A', strtotime($schedule['estimated_arrival_time'])); ?>
                </div>
            </div>
        <?php endif; ?>

        <?php if ($schedule['actual_arrival_time']): ?>
            <div class="form-group">
                <label>Actual Arrival Time</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php echo date('h:i A', strtotime($schedule['actual_arrival_time'])); ?>
                </div>
            </div>
        <?php endif; ?>
    </div>
</div>

<?php include __DIR__ . '/../includes/admin_footer.php'; ?>

<link href="https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css" rel="stylesheet">
<script src="https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js"></script>
<script>
(function() {
    const pickup = {
        lat: <?php echo (float)$schedule['pickup_latitude']; ?>,
        lng: <?php echo (float)$schedule['pickup_longitude']; ?>,
        label: <?php echo json_encode($schedule['pickup_location']); ?>
    };
    const dropoff = {
        lat: <?php echo (float)$schedule['dropoff_latitude']; ?>,
        lng: <?php echo (float)$schedule['dropoff_longitude']; ?>,
        label: <?php echo json_encode($schedule['dropoff_location']); ?>
    };
    const returnToPickup = <?php echo !empty($schedule['return_to_pickup']) ? 'true' : 'false'; ?>;

    if (!pickup.lat || !pickup.lng || !dropoff.lat || !dropoff.lng) return;

    const MAPBOX_PK = 'YOUR_MAPBOX_TOKEN';
    mapboxgl.accessToken = MAPBOX_PK;

    const map = new mapboxgl.Map({
        container: 'scheduleRouteMap',
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [(pickup.lng + dropoff.lng) / 2, (pickup.lat + dropoff.lat) / 2],
        zoom: 11
    });

    map.addControl(new mapboxgl.NavigationControl());

    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend([pickup.lng, pickup.lat]);
    bounds.extend([dropoff.lng, dropoff.lat]);

    map.on('load', async () => {
        map.fitBounds(bounds, { padding: 50, maxZoom: 14 });

        new mapboxgl.Marker({ color: '#00c9a7' })
            .setLngLat([pickup.lng, pickup.lat])
            .setPopup(new mapboxgl.Popup().setText(`Pickup: ${pickup.label}`))
            .addTo(map);

        new mapboxgl.Marker({ color: '#ff5864' })
            .setLngLat([dropoff.lng, dropoff.lat])
            .setPopup(new mapboxgl.Popup().setText(`Dropoff: ${dropoff.label}`))
            .addTo(map);

        async function addSegment(idSuffix, start, end, color) {
            try {
                const resp = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${start.lng},${start.lat};${end.lng},${end.lat}?geometries=geojson&access_token=${MAPBOX_PK}`);
                const data = await resp.json();
                const route = data.routes && data.routes[0];
                if (!route) return;

                const sourceId = `schedule-${idSuffix}`;
                const layerId = `${sourceId}-line`;
                const geojson = {
                    type: 'Feature',
                    geometry: route.geometry
                };

                if (map.getSource(sourceId)) {
                    map.getSource(sourceId).setData(geojson);
                } else {
                    map.addSource(sourceId, {
                        type: 'geojson',
                        data: geojson
                    });
                    map.addLayer({
                        id: layerId,
                        type: 'line',
                        source: sourceId,
                        paint: {
                            'line-color': color,
                            'line-width': 4
                        }
                    });
                }
            } catch (err) {
                console.warn('Unable to load schedule route preview', err);
            }
        }

        addSegment('outbound', pickup, dropoff, '#0d6efd');
        if (returnToPickup) {
            addSegment('return', dropoff, pickup, '#ff6b35');
        }
    });
})();
</script>

