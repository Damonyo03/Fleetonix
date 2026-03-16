<?php
/**
 * Fleettonix - Create New Booking
 */

session_start();
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db_connect.php';

requireUserType('client');

$currentUser = getCurrentUser();
$conn = getConnection();
$stmt = $conn->prepare("SELECT id, company_name FROM clients WHERE user_id = ?");
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

$client_id = $client['id'];
$errors = [];
$form_data = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $form_data['pickup_location'] = isset($_POST['pickup_location']) ? trim($_POST['pickup_location']) : '';
    $form_data['pickup_latitude'] = isset($_POST['pickup_latitude']) ? floatval($_POST['pickup_latitude']) : 0;
    $form_data['pickup_longitude'] = isset($_POST['pickup_longitude']) ? floatval($_POST['pickup_longitude']) : 0;
    $form_data['dropoff_location'] = isset($_POST['dropoff_location']) ? trim($_POST['dropoff_location']) : '';
    $form_data['dropoff_latitude'] = isset($_POST['dropoff_latitude']) ? floatval($_POST['dropoff_latitude']) : 0;
    $form_data['dropoff_longitude'] = isset($_POST['dropoff_longitude']) ? floatval($_POST['dropoff_longitude']) : 0;
    $form_data['booking_date'] = isset($_POST['booking_date']) ? trim($_POST['booking_date']) : '';
    $form_data['booking_time'] = isset($_POST['booking_time']) ? trim($_POST['booking_time']) : '';
    $form_data['number_of_passengers'] = isset($_POST['number_of_passengers']) ? (int)$_POST['number_of_passengers'] : 1;
    $form_data['special_instructions'] = isset($_POST['special_instructions']) ? trim($_POST['special_instructions']) : '';
    $form_data['return_to_pickup'] = isset($_POST['return_to_pickup']) ? 1 : 0;
    $form_data['return_pickup_time'] = isset($_POST['return_pickup_time']) ? trim($_POST['return_pickup_time']) : '';
    
    if (empty($form_data['pickup_location'])) {
        $errors[] = 'Pickup location is required';
    }
    if ($form_data['pickup_latitude'] == 0 || $form_data['pickup_longitude'] == 0) {
        $errors[] = 'Please select a valid pickup location from the suggestions';
    }
    
    if (empty($form_data['dropoff_location'])) {
        $errors[] = 'Dropoff location is required';
    }
    if ($form_data['dropoff_latitude'] == 0 || $form_data['dropoff_longitude'] == 0) {
        $errors[] = 'Please select a valid dropoff location from the suggestions';
    }
    
    if (empty($form_data['booking_date'])) {
        $errors[] = 'Booking date is required';
    } elseif (strtotime($form_data['booking_date']) < strtotime('today')) {
        $errors[] = 'Booking date cannot be in the past';
    }
    
    if (empty($form_data['booking_time'])) {
        $errors[] = 'Booking time is required';
    } else {
        $time_str = trim($form_data['booking_time']);
        if (preg_match('/^(\d{1,2}):(\d{2})$/', $time_str, $matches)) {
            $hour = (int)$matches[1];
            $minute = (int)$matches[2];
            if ($hour >= 0 && $hour <= 23 && $minute >= 0 && $minute <= 59) {
                $form_data['booking_time'] = sprintf('%02d:%02d:00', $hour, $minute);
            } else {
                $errors[] = 'Invalid time.';
            }
        } else {
            $errors[] = 'Invalid time format.';
        }
    }
    
    if ($form_data['number_of_passengers'] < 1) {
        $errors[] = 'Number of passengers must be at least 1';
    }

    if ($form_data['return_to_pickup']) {
        if (empty($form_data['return_pickup_time'])) {
            $errors[] = 'Please select a return pickup time.';
        } elseif (!preg_match('/^(\\d{1,2}):(\\d{2})$/', $form_data['return_pickup_time'], $matches)) {
            $errors[] = 'Invalid return pickup time.';
        } else {
            $hour = (int)$matches[1];
            $minute = (int)$matches[2];
            if ($hour < 0 || $hour > 23 || $minute < 0 || $minute > 59) {
                $errors[] = 'Invalid return pickup time.';
            } else {
                $form_data['return_pickup_time'] = sprintf('%02d:%02d:00', $hour, $minute);
            }
        }
    } else {
        $form_data['return_pickup_time'] = null;
    }
    
    if (empty($errors)) {
        $stmt = $conn->prepare("
            INSERT INTO bookings (
                client_id, 
                pickup_location, pickup_latitude, pickup_longitude, 
                dropoff_location, dropoff_latitude, dropoff_longitude, 
                booking_date, booking_time, number_of_passengers, special_instructions, return_to_pickup, return_pickup_time, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        ");
        
        $stmt->bind_param("isddsddssisis", 
            $client_id,
            $form_data['pickup_location'],
            $form_data['pickup_latitude'],
            $form_data['pickup_longitude'],
            $form_data['dropoff_location'],
            $form_data['dropoff_latitude'],
            $form_data['dropoff_longitude'],
            $form_data['booking_date'],
            $form_data['booking_time'],
            $form_data['number_of_passengers'],
            $form_data['special_instructions'],
            $form_data['return_to_pickup'],
            $form_data['return_pickup_time']
        );
        
        if ($stmt->execute()) {
            $booking_id = $conn->insert_id;
            
            // Create notification for all admins about new booking
            $admin_users = $conn->query("SELECT id FROM users WHERE user_type = 'admin' AND status = 'active'");
            while ($admin = $admin_users->fetch_assoc()) {
                $notif_stmt = $conn->prepare("
                    INSERT INTO notifications (user_id, title, message, type)
                    VALUES (?, 'New Booking Request', 'A new booking request has been submitted and requires approval', 'info')
                ");
                $notif_stmt->bind_param("i", $admin['id']);
                $notif_stmt->execute();
                $notif_stmt->close();
            }
            
            $_SESSION['success'] = 'Booking request submitted successfully! It will be reviewed by admin.';
            $stmt->close();
            $conn->close();
            header('Location: bookings.php');
            exit;
        } else {
            $errors[] = 'Failed to create booking. Please try again.';
            $stmt->close();
        }
    }
    
    if (!empty($errors)) {
        $_SESSION['error'] = implode('<br>', $errors);
    }
}

$conn->close();
$page_title = 'New Booking';
include __DIR__ . '/../includes/client_header.php';
?>

<div class="page-header">
    <h1 class="page-title">New Booking</h1>
    <p class="page-subtitle">Create a new booking request</p>
</div>

<div class="form-card">
    <?php if (isset($_SESSION['error'])): ?>
        <div class="alert alert-error">
            <?php echo $_SESSION['error']; unset($_SESSION['error']); ?>
        </div>
    <?php endif; ?>
    
    <?php if (isset($_SESSION['success'])): ?>
        <div class="alert alert-success">
            <?php echo htmlspecialchars($_SESSION['success']); unset($_SESSION['success']); ?>
        </div>
    <?php endif; ?>

    <form method="POST" action="" id="bookingForm" onsubmit="return validateBookingForm()" data-loading="true">
        <div class="form-row">
            <div class="form-group">
                <label for="pickup_location">Pickup Location *</label>
                <input 
                    type="text" 
                    id="pickup_location" 
                    name="pickup_location" 
                    class="form-input" 
                    required
                    placeholder="Enter pickup address"
                    value="<?php echo isset($form_data['pickup_location']) ? htmlspecialchars($form_data['pickup_location']) : ''; ?>"
                >
                <input type="hidden" id="pickup_latitude" name="pickup_latitude" value="<?php echo isset($form_data['pickup_latitude']) && $form_data['pickup_latitude'] != 0 ? htmlspecialchars($form_data['pickup_latitude']) : '0'; ?>">
                <input type="hidden" id="pickup_longitude" name="pickup_longitude" value="<?php echo isset($form_data['pickup_longitude']) && $form_data['pickup_longitude'] != 0 ? htmlspecialchars($form_data['pickup_longitude']) : '0'; ?>">
                <small style="color: var(--text-muted); font-size: 0.85rem; margin-top: 5px; display: block;">
                    <i class="fas fa-info-circle"></i> Type at least 2 characters and select from suggestions
                </small>
            </div>

            <div class="form-group">
                <label for="dropoff_location">Dropoff Location *</label>
                <input 
                    type="text" 
                    id="dropoff_location" 
                    name="dropoff_location" 
                    class="form-input" 
                    required
                    placeholder="Enter dropoff address"
                    value="<?php echo isset($form_data['dropoff_location']) ? htmlspecialchars($form_data['dropoff_location']) : ''; ?>"
                >
                <input type="hidden" id="dropoff_latitude" name="dropoff_latitude" value="<?php echo isset($form_data['dropoff_latitude']) && $form_data['dropoff_latitude'] != 0 ? htmlspecialchars($form_data['dropoff_latitude']) : '0'; ?>">
                <input type="hidden" id="dropoff_longitude" name="dropoff_longitude" value="<?php echo isset($form_data['dropoff_longitude']) && $form_data['dropoff_longitude'] != 0 ? htmlspecialchars($form_data['dropoff_longitude']) : '0'; ?>">
                <small style="color: var(--text-muted); font-size: 0.85rem; margin-top: 5px; display: block;">
                    <i class="fas fa-info-circle"></i> Type at least 2 characters and select from suggestions
                </small>
            </div>
        </div>

        <div class="form-row">
            <div class="form-group">
                <label for="booking_date">Booking Date *</label>
                <input 
                    type="date" 
                    id="booking_date" 
                    name="booking_date" 
                    class="form-input" 
                    required
                    min="<?php echo date('Y-m-d'); ?>"
                    value="<?php echo isset($form_data['booking_date']) ? htmlspecialchars($form_data['booking_date']) : ''; ?>"
                >
            </div>

            <div class="form-group">
                <label for="booking_time">Booking Time *</label>
                <input 
                    type="time" 
                    id="booking_time" 
                    name="booking_time" 
                    class="form-input" 
                    required
                    value="<?php 
                        if (isset($_POST['booking_time'])) {
                            echo htmlspecialchars($_POST['booking_time']);
                        } elseif (isset($form_data['booking_time']) && !empty($form_data['booking_time'])) {
                            $time_parts = explode(':', $form_data['booking_time']);
                            if (count($time_parts) >= 2) {
                                echo htmlspecialchars($time_parts[0] . ':' . $time_parts[1]);
                            }
                        }
                    ?>"
                >
            </div>
        </div>

        <div class="form-group">
            <label for="number_of_passengers">Number of Passengers *</label>
            <input 
                type="number" 
                id="number_of_passengers" 
                name="number_of_passengers" 
                class="form-input" 
                required
                min="1"
                max="50"
                value="<?php echo isset($form_data['number_of_passengers']) ? (int)$form_data['number_of_passengers'] : 1; ?>"
            >
        </div>

        <div class="form-row">
            <div class="form-group">
                <label for="return_to_pickup" style="display: block; margin-bottom: 6px;">
                    Return to Pickup Point
                </label>
                <label style="display: inline-flex; align-items: center; gap: 10px; color: var(--text-primary);">
                    <input 
                        type="checkbox" 
                        id="return_to_pickup" 
                        name="return_to_pickup" 
                        <?php echo !empty($form_data['return_to_pickup']) ? 'checked' : ''; ?>
                    >
                    <span style="font-weight: 500;">
                        Driver should return to Point A after the dropoff
                    </span>
                </label>
            </div>
            <div class="form-group" id="returnTimeGroup" style="display: <?php echo !empty($form_data['return_to_pickup']) ? 'block' : 'none'; ?>;">
                <label for="return_pickup_time">Return Pickup Time</label>
                <input 
                    type="time" 
                    id="return_pickup_time" 
                    name="return_pickup_time" 
                    class="form-input"
                    value="<?php echo isset($form_data['return_pickup_time']) ? htmlspecialchars($form_data['return_pickup_time']) : ''; ?>"
                >
            </div>
        </div>

        <div class="form-group">
            <label for="special_instructions">Special Instructions</label>
            <textarea 
                id="special_instructions" 
                name="special_instructions" 
                class="form-input" 
                rows="4"
                placeholder="Any special requirements or instructions..."
            ><?php echo isset($form_data['special_instructions']) ? htmlspecialchars($form_data['special_instructions']) : ''; ?></textarea>
        </div>

        <div class="page-actions" style="margin-top: 30px;">
            <button type="submit" class="btn btn-primary" id="submitBookingBtn">
                <i class="fas fa-paper-plane"></i> Submit Booking Request
            </button>
            <a href="bookings.php" class="btn btn-secondary">
                <i class="fas fa-times"></i> Cancel
            </a>
        </div>
    </form>

    <div id="routePreviewCard" class="form-card" style="margin-top: 30px; display: none;">
        <h3 style="color: var(--text-primary); margin-bottom: 12px;">Route Preview</h3>
        <div id="clientRouteMap" style="width: 100%; height: 320px; border-radius: 12px; overflow: hidden;"></div>
        <small style="color: var(--text-muted); display: block; margin-top: 8px;">
            This preview helps verify your pickup and dropoff points before submitting.
        </small>
    </div>
</div>

<?php include __DIR__ . '/../includes/client_footer.php'; ?>
<link href="https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css" rel="stylesheet">
<script src="https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js"></script>
<script src="<?php echo strpos($_SERVER['REQUEST_URI'], '/client/') !== false ? '../' : ''; ?>assets/js/address-autocomplete.js?v=<?php echo time(); ?>"></script>
<script>
function validateBookingForm() {
    const pickupLocationInput = document.getElementById('pickup_location');
    const pickupLatInput = document.getElementById('pickup_latitude');
    const pickupLngInput = document.getElementById('pickup_longitude');
    const dropoffLocationInput = document.getElementById('dropoff_location');
    const dropoffLatInput = document.getElementById('dropoff_latitude');
    const dropoffLngInput = document.getElementById('dropoff_longitude');
    const bookingTimeInput = document.getElementById('booking_time');
    
    const pickupLocation = pickupLocationInput ? pickupLocationInput.value.trim() : '';
    const pickupLat = pickupLatInput ? parseFloat(pickupLatInput.value) || 0 : 0;
    const pickupLng = pickupLngInput ? parseFloat(pickupLngInput.value) || 0 : 0;
    const dropoffLocation = dropoffLocationInput ? dropoffLocationInput.value.trim() : '';
    const dropoffLat = dropoffLatInput ? parseFloat(dropoffLatInput.value) || 0 : 0;
    const dropoffLng = dropoffLngInput ? parseFloat(dropoffLngInput.value) || 0 : 0;
    const bookingTime = bookingTimeInput ? bookingTimeInput.value.trim() : '';
    
    if (!pickupLocation) {
        alert('Please enter a pickup location');
        if (pickupLocationInput) pickupLocationInput.focus();
        return false;
    }
    
    if (pickupLat == 0 || pickupLng == 0) {
        alert('Please select a pickup location from the suggestions by clicking on it');
        if (pickupLocationInput) pickupLocationInput.focus();
        return false;
    }
    
    if (!dropoffLocation) {
        alert('Please enter a dropoff location');
        if (dropoffLocationInput) dropoffLocationInput.focus();
        return false;
    }
    
    if (dropoffLat == 0 || dropoffLng == 0) {
        alert('Please select a dropoff location from the suggestions by clicking on it');
        if (dropoffLocationInput) dropoffLocationInput.focus();
        return false;
    }
    
    if (!bookingTime) {
        alert('Please select a booking time');
        if (bookingTimeInput) bookingTimeInput.focus();
        return false;
    }
    
    return true;
}

(function initClientRoutePreview() {
    const routeCard = document.getElementById('routePreviewCard');
    const mapContainerId = 'clientRouteMap';
    if (!routeCard) return;

    const pickupLatInput = document.getElementById('pickup_latitude');
    const pickupLngInput = document.getElementById('pickup_longitude');
    const dropoffLatInput = document.getElementById('dropoff_latitude');
    const dropoffLngInput = document.getElementById('dropoff_longitude');
    const returnCheckbox = document.getElementById('return_to_pickup');

    const pickupAddressInput = document.getElementById('pickup_location');
    const dropoffAddressInput = document.getElementById('dropoff_location');

    const MAPBOX_PK = 'YOUR_MAPBOX_TOKEN';
    mapboxgl.accessToken = MAPBOX_PK;

    let routeMap = null;
    let pickupMarker = null;
    let dropoffMarker = null;

    function getCoords() {
        const pickupLat = parseFloat(pickupLatInput.value);
        const pickupLng = parseFloat(pickupLngInput.value);
        const dropoffLat = parseFloat(dropoffLatInput.value);
        const dropoffLng = parseFloat(dropoffLngInput.value);

        // Check if coordinates are valid (not 0, not NaN, and within valid range)
        if (isNaN(pickupLat) || isNaN(pickupLng) || isNaN(dropoffLat) || isNaN(dropoffLng) ||
            pickupLat === 0 || pickupLng === 0 || dropoffLat === 0 || dropoffLng === 0 ||
            Math.abs(pickupLat) > 90 || Math.abs(pickupLng) > 180 ||
            Math.abs(dropoffLat) > 90 || Math.abs(dropoffLng) > 180) {
            return null;
        }

        return {
            pickup: {
                lat: pickupLat,
                lng: pickupLng,
                label: pickupAddressInput ? pickupAddressInput.value : 'Pickup'
            },
            dropoff: {
                lat: dropoffLat,
                lng: dropoffLng,
                label: dropoffAddressInput ? dropoffAddressInput.value : 'Dropoff'
            },
            returnToPickup: returnCheckbox ? returnCheckbox.checked : false
        };
    }

    function ensureMap(coords) {
        if (routeMap) return;

        routeMap = new mapboxgl.Map({
            container: mapContainerId,
            style: 'mapbox://styles/mapbox/streets-v12',
            center: [coords.pickup.lng, coords.pickup.lat],
            zoom: 12
        });

        routeMap.addControl(new mapboxgl.NavigationControl());
        routeMap.on('load', () => updateRoute(coords));
    }

    function removeRouteSegment(idSuffix) {
        if (!routeMap) return;
        const layerId = `client-route-${idSuffix}-line`;
        const sourceId = `client-route-${idSuffix}`;
        if (routeMap.getLayer(layerId)) {
            routeMap.removeLayer(layerId);
        }
        if (routeMap.getSource(sourceId)) {
            routeMap.removeSource(sourceId);
        }
    }

    async function addRouteSegment(idSuffix, start, end, color) {
        try {
            const resp = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${start.lng},${start.lat};${end.lng},${end.lat}?geometries=geojson&access_token=${MAPBOX_PK}`);
            const data = await resp.json();
            const route = data.routes && data.routes[0];
            if (!route) return;

            const sourceId = `client-route-${idSuffix}`;
            const layerId = `client-route-${idSuffix}-line`;
            const geojson = {
                type: 'Feature',
                geometry: route.geometry
            };

            if (routeMap.getSource(sourceId)) {
                routeMap.getSource(sourceId).setData(geojson);
            } else {
                routeMap.addSource(sourceId, {
                    type: 'geojson',
                    data: geojson
                });
                routeMap.addLayer({
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

    function updateRoute(coords) {
        if (!routeMap || !routeMap.isStyleLoaded()) {
            return routeMap && routeMap.once('load', () => updateRoute(coords));
        }

        const bounds = new mapboxgl.LngLatBounds();
        bounds.extend([coords.pickup.lng, coords.pickup.lat]);
        bounds.extend([coords.dropoff.lng, coords.dropoff.lat]);
        routeMap.fitBounds(bounds, { padding: 50, maxZoom: 14 });

        if (!pickupMarker) {
            pickupMarker = new mapboxgl.Marker({ color: '#00c9a7' })
                .setLngLat([coords.pickup.lng, coords.pickup.lat])
                .setPopup(new mapboxgl.Popup().setText(`Pickup: ${coords.pickup.label}`))
                .addTo(routeMap);
        } else {
            pickupMarker.setLngLat([coords.pickup.lng, coords.pickup.lat])
                .setPopup(new mapboxgl.Popup().setText(`Pickup: ${coords.pickup.label}`));
        }

        if (!dropoffMarker) {
            dropoffMarker = new mapboxgl.Marker({ color: '#ff5864' })
                .setLngLat([coords.dropoff.lng, coords.dropoff.lat])
                .setPopup(new mapboxgl.Popup().setText(`Dropoff: ${coords.dropoff.label}`))
                .addTo(routeMap);
        } else {
            dropoffMarker.setLngLat([coords.dropoff.lng, coords.dropoff.lat])
                .setPopup(new mapboxgl.Popup().setText(`Dropoff: ${coords.dropoff.label}`));
        }

        removeRouteSegment('outbound');
        removeRouteSegment('return');

        addRouteSegment('outbound', coords.pickup, coords.dropoff, '#0d6efd');
        if (coords.returnToPickup) {
            addRouteSegment('return', coords.dropoff, coords.pickup, '#ff6b35');
        }
    }

    function refreshRoutePreview() {
        const coords = getCoords();
        if (!coords) {
            routeCard.style.display = 'none';
            return;
        }

        routeCard.style.display = 'block';
        ensureMap(coords);
        updateRoute(coords);
    }

    ['pickup_latitude', 'pickup_longitude', 'dropoff_latitude', 'dropoff_longitude'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('change', refreshRoutePreview);
        }
    });

    if (returnCheckbox) {
        returnCheckbox.addEventListener('change', refreshRoutePreview);
    }

    // Make the preview function accessible to other scripts
    window.refreshFleetonixRoutePreview = refreshRoutePreview;

    // In case values are already set (form re-submit)
    window.addEventListener('load', () => {
        refreshRoutePreview();
    });
})();

(function initReturnTripControls() {
    const returnCheckbox = document.getElementById('return_to_pickup');
    const returnTimeGroup = document.getElementById('returnTimeGroup');
    const returnTimeInput = document.getElementById('return_pickup_time');
    if (!returnCheckbox || !returnTimeGroup || !returnTimeInput) return;

    function toggleReturnTime() {
        if (returnCheckbox.checked) {
            returnTimeGroup.style.display = 'block';
            returnTimeInput.setAttribute('required', 'required');
        } else {
            returnTimeGroup.style.display = 'none';
            returnTimeInput.removeAttribute('required');
            returnTimeInput.value = '';
        }
    }

    returnCheckbox.addEventListener('change', () => {
        toggleReturnTime();
        if (typeof window.refreshFleetonixRoutePreview === 'function') {
            window.refreshFleetonixRoutePreview();
        }
    });
    toggleReturnTime();
})();

// Ensure address autocomplete is initialized (script auto-initializes, but this is a backup)
(function ensureAutocompleteInit() {
    let retryCount = 0;
    const maxRetries = 5;
    
    function initAutocomplete() {
        // Check if AddressAutocomplete class is available
        if (typeof AddressAutocomplete === 'undefined') {
            retryCount++;
            if (retryCount < maxRetries) {
                setTimeout(initAutocomplete, 200);
            } else {
                console.error('AddressAutocomplete class failed to load after multiple attempts');
            }
            return;
        }
        
        const pickupInput = document.getElementById('pickup_location');
        const pickupLat = document.getElementById('pickup_latitude');
        const pickupLng = document.getElementById('pickup_longitude');
        const dropoffInput = document.getElementById('dropoff_location');
        const dropoffLat = document.getElementById('dropoff_latitude');
        const dropoffLng = document.getElementById('dropoff_longitude');
        
        // Initialize pickup autocomplete if not already initialized
        if (pickupInput && pickupLat && pickupLng && !pickupInput.dataset.autocompleteInitialized) {
            try {
                new AddressAutocomplete(pickupInput, pickupLat, pickupLng);
                pickupInput.dataset.autocompleteInitialized = 'true';
            } catch (e) {
                console.error('Error initializing pickup autocomplete:', e);
            }
        }
        
        // Initialize dropoff autocomplete if not already initialized
        if (dropoffInput && dropoffLat && dropoffLng && !dropoffInput.dataset.autocompleteInitialized) {
            try {
                new AddressAutocomplete(dropoffInput, dropoffLat, dropoffLng);
                dropoffInput.dataset.autocompleteInitialized = 'true';
            } catch (e) {
                console.error('Error initializing dropoff autocomplete:', e);
            }
        }
    }
    
    // Wait for DOM and script to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initAutocomplete, 100);
        });
    } else {
        setTimeout(initAutocomplete, 100);
    }
})();

// Add loading state to booking form submission
(function() {
    const bookingForm = document.getElementById('bookingForm');
    const submitBtn = document.getElementById('submitBookingBtn');
    
    if (bookingForm && submitBtn) {
        bookingForm.addEventListener('submit', function(e) {
            // Only add loading if form validation passes
            if (bookingForm.checkValidity() && typeof validateBookingForm === 'function' && validateBookingForm()) {
                setButtonLoading(submitBtn, true);
                // Form will submit normally
            }
        });
    }
})();
</script>
