<?php
/**
 * Fleettonix - Approve Booking & Assign Driver
 */

session_start();
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/admin_functions.php';
require_once __DIR__ . '/../includes/db_connect.php';

// Require admin access
requireUserType('admin');

$currentUser = getCurrentUser();
$booking_id = isset($_GET['id']) ? (int)$_GET['id'] : 0;

if (!$booking_id) {
    $_SESSION['error'] = 'Invalid booking ID';
    header('Location: bookings.php');
    exit;
}

$conn = getConnection();

// Get booking info
$stmt = $conn->prepare("
    SELECT b.*, c.company_name
    FROM bookings b
    JOIN clients c ON b.client_id = c.id
    WHERE b.id = ?
");
$stmt->bind_param("i", $booking_id);
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

if ($booking['status'] !== 'pending') {
    $_SESSION['error'] = 'This booking has already been processed';
    $conn->close();
    header('Location: booking_view.php?id=' . $booking_id);
    exit;
}

// Get nearest available drivers sorted by distance from pickup location
$available_drivers = getNearestDrivers(
    (float)$booking['pickup_latitude'],
    (float)$booking['pickup_longitude'],
    'available'
);

// If form submitted
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $driver_id = isset($_POST['driver_id']) ? (int)$_POST['driver_id'] : 0;
    $scheduled_date = isset($_POST['scheduled_date']) ? trim($_POST['scheduled_date']) : '';
    $scheduled_time = isset($_POST['scheduled_time']) ? trim($_POST['scheduled_time']) : '';
    
    if (empty($driver_id) || empty($scheduled_date) || empty($scheduled_time)) {
        $_SESSION['error'] = 'Please fill in all required fields';
    } else {
        // Update booking status
        $stmt = $conn->prepare("UPDATE bookings SET status = 'approved' WHERE id = ?");
        $stmt->bind_param("i", $booking_id);
        $stmt->execute();
        $stmt->close();
        
        // Create schedule
        $stmt = $conn->prepare("
            INSERT INTO schedules (booking_id, driver_id, pickup_location, pickup_latitude, pickup_longitude, 
                                  dropoff_location, dropoff_latitude, dropoff_longitude, scheduled_date, scheduled_time, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        ");
        $stmt->bind_param("iisddsddss", 
            $booking_id, 
            $driver_id,
            $booking['pickup_location'],
            $booking['pickup_latitude'],
            $booking['pickup_longitude'],
            $booking['dropoff_location'],
            $booking['dropoff_latitude'],
            $booking['dropoff_longitude'],
            $scheduled_date,
            $scheduled_time
        );
        
        if ($stmt->execute()) {
            // Update driver status
            $stmt2 = $conn->prepare("UPDATE drivers SET current_status = 'on_schedule' WHERE id = ?");
            $stmt2->bind_param("i", $driver_id);
            $stmt2->execute();
            $stmt2->close();
            
            // Update booking status to assigned
            $stmt3 = $conn->prepare("UPDATE bookings SET status = 'assigned' WHERE id = ?");
            $stmt3->bind_param("i", $booking_id);
            $stmt3->execute();
            $stmt3->close();
            
            // Create notification for client about booking approval
            $client_id = $booking['client_id'];
            $client_user = $conn->query("SELECT user_id FROM clients WHERE id = $client_id")->fetch_assoc();
            if ($client_user) {
                $driver_name = $conn->query("SELECT u.full_name FROM drivers d JOIN users u ON d.user_id = u.id WHERE d.id = $driver_id")->fetch_assoc()['full_name'];
                $notif_stmt = $conn->prepare("
                    INSERT INTO notifications (user_id, title, message, type)
                    VALUES (?, 'Booking Approved', CONCAT('Your booking has been approved and assigned to driver: ', ?), 'success')
                ");
                $notif_stmt->bind_param("is", $client_user['user_id'], $driver_name);
                $notif_stmt->execute();
                $notif_stmt->close();
            }
            
            $_SESSION['success'] = 'Booking approved and driver assigned successfully!';
            $stmt->close();
            $conn->close();
            header('Location: booking_view.php?id=' . $booking_id);
            exit;
        } else {
            $_SESSION['error'] = 'Failed to create schedule. Please try again.';
            $stmt->close();
        }
    }
}

$conn->close();

$page_title = 'Approve Booking #' . $booking_id;

// Include header
include __DIR__ . '/../includes/admin_header.php';
?>

<div class="page-header">
    <h1 class="page-title">Approve Booking</h1>
    <p class="page-subtitle">Assign a driver to booking #<?php echo $booking_id; ?> from <?php echo htmlspecialchars($booking['company_name']); ?></p>
</div>

<div class="form-card">
    <?php if (isset($_SESSION['error'])): ?>
        <div class="alert alert-error">
            <?php 
            echo htmlspecialchars($_SESSION['error']); 
            unset($_SESSION['error']);
            ?>
        </div>
    <?php endif; ?>

    <!-- Booking Summary -->
    <div style="background: var(--bg-input); padding: 20px; border-radius: 8px; margin-bottom: 30px;">
        <h4 style="color: var(--text-primary); margin-bottom: 15px;">Booking Summary</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div>
                <small style="color: var(--text-muted);">Pickup:</small>
                <div style="color: var(--text-primary);"><?php echo htmlspecialchars($booking['pickup_location']); ?></div>
            </div>
            <div>
                <small style="color: var(--text-muted);">Dropoff:</small>
                <div style="color: var(--text-primary);"><?php echo htmlspecialchars($booking['dropoff_location']); ?></div>
            </div>
            <div>
                <small style="color: var(--text-muted);">Date:</small>
                <div style="color: var(--text-primary);"><?php echo date('F d, Y', strtotime($booking['booking_date'])); ?></div>
            </div>
            <div>
                <small style="color: var(--text-muted);">Time:</small>
                <div style="color: var(--text-primary);"><?php echo date('h:i A', strtotime($booking['booking_time'])); ?></div>
            </div>
            <div>
                <small style="color: var(--text-muted);">Return Trip:</small>
                <div style="color: var(--text-primary);">
                    <?php echo !empty($booking['return_to_pickup']) ? 'Yes, back to pickup point' : 'No, one-way'; ?>
                </div>
            </div>
            <?php if (!empty($booking['return_to_pickup']) && !empty($booking['return_pickup_time'])): ?>
            <div>
                <small style="color: var(--text-muted);">Return Pickup Time:</small>
                <div style="color: var(--text-primary);">
                    <?php echo date('h:i A', strtotime($booking['return_pickup_time'])); ?>
                </div>
            </div>
            <?php endif; ?>
        </div>
    </div>

    <form method="POST" action="">
        <div class="form-group">
            <label for="driver_id">Select Driver * <small style="color: var(--text-muted); font-weight: normal;">(Sorted by nearest to pickup location)</small></label>
            <select id="driver_id" name="driver_id" class="form-input" required>
                <option value="">-- Select Available Driver --</option>
                <?php foreach ($available_drivers as $driver): ?>
                    <option value="<?php echo $driver['id']; ?>">
                        <?php echo htmlspecialchars($driver['full_name']); ?> 
                        <?php if ($driver['vehicle_assigned']): ?>
                            - <?php echo htmlspecialchars($driver['vehicle_assigned']); ?>
                        <?php endif; ?>
                        <?php if ($driver['plate_number']): ?>
                            (<?php echo htmlspecialchars($driver['plate_number']); ?>)
                        <?php endif; ?>
                        <?php if (isset($driver['distance_km'])): ?>
                            - <?php echo number_format($driver['distance_km'], 2); ?> km away
                        <?php endif; ?>
                    </option>
                <?php endforeach; ?>
            </select>
            <?php if (empty($available_drivers)): ?>
                <small style="color: var(--text-muted); display: block; margin-top: 5px;">
                    No available drivers with location data. Drivers need to have their GPS location updated within the last hour to appear here.
                </small>
            <?php else: ?>
                <small style="color: var(--text-muted); display: block; margin-top: 5px;">
                    <i class="fas fa-info-circle"></i> Drivers are sorted by distance from pickup location. The nearest driver is shown first.
                </small>
            <?php endif; ?>
        </div>

        <div class="form-group" style="margin-top: 30px;">
            <label>Pickup to Dropoff Route Preview</label>
            <div id="routeMap" style="width: 100%; height: 320px; border-radius: 12px; overflow: hidden; background: var(--bg-input);"></div>
            <small style="color: var(--text-muted); display:block; margin-top:6px;">Use this preview to verify the provided pickup and dropoff points before approving.</small>
        </div>

        <div class="form-row">
            <div class="form-group">
                <label for="scheduled_date">Scheduled Date *</label>
                <input 
                    type="date" 
                    id="scheduled_date" 
                    name="scheduled_date" 
                    class="form-input" 
                    required
                    min="<?php echo date('Y-m-d'); ?>"
                    value="<?php echo $booking['booking_date']; ?>"
                >
            </div>

            <div class="form-group">
                <label for="scheduled_time">Scheduled Time *</label>
                <input 
                    type="time" 
                    id="scheduled_time" 
                    name="scheduled_time" 
                    class="form-input" 
                    required
                    value="<?php echo date('H:i', strtotime($booking['booking_time'])); ?>"
                >
            </div>
        </div>

        <div class="page-actions" style="margin-top: 30px;">
            <button type="submit" class="btn btn-primary" <?php echo empty($available_drivers) ? 'disabled' : ''; ?>>
                <i class="fas fa-check"></i> Approve & Assign Driver
            </button>
            <a href="booking_view.php?id=<?php echo $booking_id; ?>" class="btn btn-secondary">
                <i class="fas fa-times"></i> Cancel
            </a>
        </div>
    </form>
</div>

<?php include __DIR__ . '/../includes/admin_footer.php'; ?>

<link href="https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css" rel="stylesheet">
<script src="https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js"></script>
<script>
(function() {
    const pickup = {
        lat: <?php echo $booking['pickup_latitude']; ?>,
        lng: <?php echo $booking['pickup_longitude']; ?>,
        label: <?php echo json_encode($booking['pickup_location']); ?>
    };
    const dropoff = {
        lat: <?php echo $booking['dropoff_latitude']; ?>,
        lng: <?php echo $booking['dropoff_longitude']; ?>,
        label: <?php echo json_encode($booking['dropoff_location']); ?>
    };
    const returnToPickup = <?php echo !empty($booking['return_to_pickup']) ? 'true' : 'false'; ?>;

    if (!pickup.lat || !pickup.lng || !dropoff.lat || !dropoff.lng) {
        return;
    }

    const MAPBOX_PK = 'YOUR_MAPBOX_TOKEN';
    mapboxgl.accessToken = MAPBOX_PK;

    const map = new mapboxgl.Map({
        container: 'routeMap',
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [(pickup.lng + dropoff.lng) / 2, (pickup.lat + dropoff.lat) / 2],
        zoom: 10
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

                const sourceId = `admin-approve-${idSuffix}`;
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

