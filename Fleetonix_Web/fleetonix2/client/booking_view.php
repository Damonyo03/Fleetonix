<?php
/**
 * Fleettonix - View Booking Details
 */

session_start();
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db_connect.php';

// Require client access
requireUserType('client');

$currentUser = getCurrentUser();
$booking_id = isset($_GET['id']) ? (int)$_GET['id'] : 0;

if (!$booking_id) {
    $_SESSION['error'] = 'Invalid booking ID';
    header('Location: bookings.php');
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

// Get booking info
$stmt = $conn->prepare("
    SELECT b.*
    FROM bookings b
    WHERE b.id = ? AND b.client_id = ?
");
$stmt->bind_param("ii", $booking_id, $client['id']);
$stmt->execute();
$result = $stmt->get_result();
$booking = $result->fetch_assoc();
$stmt->close();

if (!$booking) {
    $_SESSION['error'] = 'Booking not found';
    $conn->close();
    header('Location: bookings.php');
    exit;
}

// Check if booking has a schedule
$stmt = $conn->prepare("
    SELECT s.*, 
           d.user_id as driver_user_id,
           u_driver.full_name as driver_name,
           u_driver.phone as driver_phone,
           d.vehicle_assigned,
           d.plate_number
    FROM schedules s
    JOIN drivers d ON s.driver_id = d.id
    JOIN users u_driver ON d.user_id = u_driver.id
    WHERE s.booking_id = ?
");
$stmt->bind_param("i", $booking_id);
$stmt->execute();
$schedule_result = $stmt->get_result();
$schedule = $schedule_result->fetch_assoc();
$stmt->close();

$conn->close();

$page_title = 'Booking Details #' . $booking_id;

// Include header
include __DIR__ . '/../includes/client_header.php';
?>

<div class="page-header">
    <h1 class="page-title">Booking Details</h1>
    <p class="page-subtitle">Booking #<?php echo $booking_id; ?></p>
</div>

<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
    <!-- Booking Information -->
    <div class="form-card">
        <h3 style="color: var(--text-primary); margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">Booking Information</h3>
        
        <div class="form-group">
            <label>Status</label>
            <div style="padding: 12px; background: var(--bg-input); border-radius: 8px;">
                <span class="status-badge <?php echo strtolower($booking['status']); ?>">
                    <?php echo ucfirst($booking['status']); ?>
                </span>
            </div>
        </div>

        <div class="form-row">
            <div class="form-group">
                <label>Booking Date</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php echo date('F d, Y', strtotime($booking['booking_date'])); ?>
                </div>
            </div>

            <div class="form-group">
                <label>Booking Time</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php 
                    $time = $booking['booking_time'];
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
                <?php echo $booking['number_of_passengers']; ?>
            </div>
        </div>

        <div class="form-group">
            <label>Return to Pickup Point</label>
            <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                <?php echo !empty($booking['return_to_pickup']) ? 'Yes, return to Point A' : 'No, one-way trip'; ?>
            </div>
        </div>

        <?php if (!empty($booking['return_to_pickup']) && !empty($booking['return_pickup_time'])): ?>
            <div class="form-group">
                <label>Return Pickup Time</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php echo date('h:i A', strtotime($booking['return_pickup_time'])); ?>
                </div>
            </div>
        <?php endif; ?>

        <h4 style="color: var(--text-primary); margin: 20px 0 15px 0;">Pickup Location</h4>
        <div class="form-group">
            <label>Address</label>
            <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                <?php echo htmlspecialchars($booking['pickup_location']); ?>
            </div>
        </div>

        <h4 style="color: var(--text-primary); margin: 20px 0 15px 0;">Dropoff Location</h4>
        <div class="form-group">
            <label>Address</label>
            <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                <?php echo htmlspecialchars($booking['dropoff_location']); ?>
            </div>
        </div>

        <?php if ($booking['special_instructions']): ?>
            <div class="form-group">
                <label>Special Instructions</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php echo nl2br(htmlspecialchars($booking['special_instructions'])); ?>
                </div>
            </div>
        <?php endif; ?>

        <div class="form-group">
            <label>Created At</label>
            <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                <?php echo date('F d, Y h:i A', strtotime($booking['created_at'])); ?>
            </div>
        </div>

        <div class="page-actions" style="margin-top: 20px;">
            <?php if ($booking['status'] === 'pending'): ?>
                <a href="booking_cancel.php?id=<?php echo $booking_id; ?>" class="btn btn-secondary" onclick="return confirm('Are you sure you want to cancel this booking?');">
                    <i class="fas fa-times"></i> Cancel Booking
                </a>
            <?php endif; ?>
            <a href="bookings.php" class="btn btn-secondary">
                <i class="fas fa-arrow-left"></i> Back to Bookings
            </a>
        </div>
    </div>

    <!-- Schedule Information -->
    <div class="form-card">
        <h3 style="color: var(--text-primary); margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">Schedule Information</h3>
        
        <?php if ($schedule): ?>
            <div class="form-group">
                <label>Assigned Driver</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <strong><?php echo htmlspecialchars($schedule['driver_name']); ?></strong>
                    <?php if ($schedule['driver_phone']): ?>
                        <br><small style="color: var(--text-muted);"><?php echo htmlspecialchars($schedule['driver_phone']); ?></small>
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
                <label>Schedule Status</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px;">
                    <span class="status-badge <?php echo strtolower($schedule['status']); ?>">
                        <?php echo ucfirst(str_replace('_', ' ', $schedule['status'])); ?>
                    </span>
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

            <div class="page-actions" style="margin-top: 20px;">
                <a href="schedule_view.php?id=<?php echo $schedule['id']; ?>" class="btn btn-primary">
                    <i class="fas fa-eye"></i> View Schedule Details
                </a>
            </div>
        <?php else: ?>
            <div class="empty-state">
                <div class="empty-state-icon"><i class="fas fa-calendar-times"></i></div>
                <div class="empty-state-title">No Schedule Assigned</div>
                <div class="empty-state-text">
                    <?php if ($booking['status'] === 'pending'): ?>
                        Your booking is pending approval. A schedule will be created once approved.
                    <?php else: ?>
                        This booking doesn't have an assigned schedule yet
                    <?php endif; ?>
                </div>
            </div>
        <?php endif; ?>
    </div>
</div>

<?php if (!empty($booking['pickup_latitude']) && !empty($booking['pickup_longitude']) && !empty($booking['dropoff_latitude']) && !empty($booking['dropoff_longitude'])): ?>
<div class="form-card" style="margin-top: 30px;">
    <h3 style="color: var(--text-primary); margin-bottom: 12px;">Route Preview</h3>
    <div id="clientBookingRouteMap" style="width: 100%; height: 320px; border-radius: 12px; overflow: hidden;"></div>
    <small style="color: var(--text-muted); display: block; margin-top: 8px;">
        Visual preview of your pickup and dropoff locations.
    </small>
</div>
<?php endif; ?>

<?php include __DIR__ . '/../includes/client_footer.php'; ?>

<?php if (!empty($booking['pickup_latitude']) && !empty($booking['pickup_longitude']) && !empty($booking['dropoff_latitude']) && !empty($booking['dropoff_longitude'])): ?>
<link href="https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css" rel="stylesheet">
<script src="https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js"></script>
<script>
(function() {
    const pickup = {
        lat: <?php echo (float)$booking['pickup_latitude']; ?>,
        lng: <?php echo (float)$booking['pickup_longitude']; ?>,
        label: <?php echo json_encode($booking['pickup_location']); ?>
    };
    const dropoff = {
        lat: <?php echo (float)$booking['dropoff_latitude']; ?>,
        lng: <?php echo (float)$booking['dropoff_longitude']; ?>,
        label: <?php echo json_encode($booking['dropoff_location']); ?>
    };
    const returnToPickup = <?php echo !empty($booking['return_to_pickup']) ? 'true' : 'false'; ?>;

    const MAPBOX_PK = 'YOUR_MAPBOX_TOKEN';
    mapboxgl.accessToken = MAPBOX_PK;

    const map = new mapboxgl.Map({
        container: 'clientBookingRouteMap',
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

                const sourceId = `client-booking-${idSuffix}`;
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
                console.warn('Unable to load route preview', err);
            }
        }

        addSegment('outbound', pickup, dropoff, '#0d6efd');
        if (returnToPickup) {
            addSegment('return', dropoff, pickup, '#ff6b35');
        }
    });
})();
</script>
<?php endif; ?>
