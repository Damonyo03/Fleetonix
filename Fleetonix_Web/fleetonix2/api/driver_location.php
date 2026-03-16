<?php
/**
 * Fleetonix - Driver Location Update API
 * Receives GPS coordinates from Android app and stores them
 */

require_once __DIR__ . '/../includes/api_helper.php';
require_once __DIR__ . '/../includes/db_connect.php';

// Handle CORS preflight
handleCorsPreflight();

// Start session
session_start();

// Validate request method
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    apiError('Invalid request method. Use POST.', 405);
}

// Get session token and validate
$sessionToken = null;
if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
    $parts = explode(' ', $_SERVER['HTTP_AUTHORIZATION']);
    if (count($parts) === 2 && strtolower($parts[0]) === 'bearer') {
        $sessionToken = trim($parts[1]);
    }
}

if (!$sessionToken && isset($_GET['session_token'])) {
    $sessionToken = trim($_GET['session_token']);
}

if ($sessionToken) {
    session_write_close();
    session_id($sessionToken);
    session_start();
}

if (!isset($_SESSION['driver_id']) || !isset($_SESSION['driver_user_id'])) {
    apiError('Unauthorized. Please login again.', 401);
}

$driverId = (int)$_SESSION['driver_id'];

// Get and validate input
$payload = getJsonInput();

// Validate required fields
$required = ['latitude', 'longitude'];
$validationErrors = validateRequired($payload, $required);
if ($validationErrors) {
    apiError('Validation failed', 422, $validationErrors);
}

// Extract and validate coordinates
$latitude = (float)$payload['latitude'];
$longitude = (float)$payload['longitude'];
$speed = isset($payload['speed']) ? (float)$payload['speed'] : null;
$heading = isset($payload['heading']) ? (float)$payload['heading'] : null;
$accuracy = isset($payload['accuracy']) ? (float)$payload['accuracy'] : null;
$scheduleId = isset($payload['schedule_id']) && $payload['schedule_id'] !== null ? (int)$payload['schedule_id'] : null;

// Log for debugging
error_log("GPS Location Update - Driver: $driverId, ScheduleId: " . ($scheduleId ?? 'NULL') . ", Lat: $latitude, Lng: $longitude");

// Validate coordinate ranges
if ($latitude < -90 || $latitude > 90 || $longitude < -180 || $longitude > 180) {
    apiError('Invalid coordinates. Latitude must be between -90 and 90, longitude between -180 and 180.', 422);
}

// Validate coordinates are reasonable for Philippines
// Philippines approximate bounds: Lat 4.2-21.1, Lng 116.9-127.0
// If coordinates are outside this range, they might be swapped or wrong
if (($latitude < 4 || $latitude > 21) || ($longitude < 116 || $longitude > 127)) {
    // Log warning but still accept (in case driver is outside Philippines)
    error_log("Warning: Driver location outside Philippines bounds: Lat=$latitude, Lng=$longitude");
}

$conn = getConnection();

// Insert GPS tracking record
// Handle NULL schedule_id properly
// Explicitly set recorded_at to use session timezone (UTC+8)
if ($scheduleId !== null) {
    $stmt = $conn->prepare("
        INSERT INTO gps_tracking (driver_id, schedule_id, latitude, longitude, speed, heading, accuracy, recorded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    ");
    $stmt->bind_param('iiddddd', $driverId, $scheduleId, $latitude, $longitude, $speed, $heading, $accuracy);
} else {
    $stmt = $conn->prepare("
        INSERT INTO gps_tracking (driver_id, schedule_id, latitude, longitude, speed, heading, accuracy, recorded_at)
        VALUES (?, NULL, ?, ?, ?, ?, ?, NOW())
    ");
    $stmt->bind_param('iddddd', $driverId, $latitude, $longitude, $speed, $heading, $accuracy);
}

try {
    if (!$stmt->execute()) {
        throw new Exception('Failed to execute GPS tracking insert');
    }
    $stmt->close();

    // Update driver's current location
    // NOW() uses the session timezone (UTC+8) set in getConnection()
    $stmt = $conn->prepare("
        UPDATE drivers 
        SET current_latitude = ?, current_longitude = ?, last_location_update = NOW()
        WHERE id = ?
    ");
    $stmt->bind_param('ddi', $latitude, $longitude, $driverId);
    
    if (!$stmt->execute()) {
        throw new Exception('Failed to update driver location');
    }
    $stmt->close();
    $conn->close();

    apiSuccess('Location updated successfully', [
        'driver_id' => $driverId,
        'latitude' => $latitude,
        'longitude' => $longitude,
        'timestamp' => date('Y-m-d H:i:s')
    ]);
    
} catch (Exception $e) {
    if (isset($stmt)) $stmt->close();
    if (isset($conn)) $conn->close();
    logApiError('driver_location', $e->getMessage(), ['driver_id' => $driverId]);
    apiError('Failed to save location. Please try again.', 500);
}

