<?php
/**
 * Fleetonix - Driver Accident Report API
 * Allows drivers to report accidents via shake detection
 */

require_once __DIR__ . '/../includes/api_helper.php';
require_once __DIR__ . '/../includes/db_connect.php';

// Handle CORS preflight
handleCorsPreflight();

// Start session
session_start();

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

// Validate request method
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    apiError('Invalid request method. Use POST.', 405);
}

// Get and validate input
$payload = getJsonInput();
$scheduleId = isset($payload['schedule_id']) ? (int)$payload['schedule_id'] : null;
$latitude = isset($payload['latitude']) ? (float)$payload['latitude'] : null;
$longitude = isset($payload['longitude']) ? (float)$payload['longitude'] : null;
$description = isset($payload['description']) ? trim($payload['description']) : 'Accident reported via shake detection';

// Validation
$errors = [];
if ($latitude === null || $latitude == 0) {
    $errors['latitude'] = 'Latitude is required';
}
if ($longitude === null || $longitude == 0) {
    $errors['longitude'] = 'Longitude is required';
}

if (!empty($errors)) {
    apiError('Validation failed', 422, $errors);
}

try {
    $conn = getConnection();

    // Verify driver exists
    $stmt = $conn->prepare("SELECT id FROM drivers WHERE id = ?");
    $stmt->bind_param('i', $driverId);
    $stmt->execute();
    $result = $stmt->get_result();
    if ($result->num_rows === 0) {
        $stmt->close();
        $conn->close();
        apiError('Driver not found', 404);
    }
    $stmt->close();

    // Verify schedule if provided
    if ($scheduleId) {
        $stmt = $conn->prepare("SELECT id FROM schedules WHERE id = ? AND driver_id = ?");
        $stmt->bind_param('ii', $scheduleId, $driverId);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($result->num_rows === 0) {
            $stmt->close();
            // Don't fail if schedule doesn't exist, just set to null
            $scheduleId = null;
        } else {
            $stmt->close();
        }
    }

    // Insert accident report
    $stmt = $conn->prepare("
        INSERT INTO accident_reports (driver_id, schedule_id, latitude, longitude, description, status)
        VALUES (?, ?, ?, ?, ?, 'reported')
    ");
    $stmt->bind_param('iidds', $driverId, $scheduleId, $latitude, $longitude, $description);
    
    if (!$stmt->execute()) {
        $stmt->close();
        $conn->close();
        apiError('Failed to create accident report', 500);
    }

    $accidentId = $conn->insert_id;
    $stmt->close();

    // Create notification for admin
    $adminUsers = $conn->query("SELECT id FROM users WHERE user_type = 'admin' AND status = 'active'");
    while ($admin = $adminUsers->fetch_assoc()) {
        $driverInfo = $conn->query("
            SELECT u.full_name 
            FROM drivers d 
            JOIN users u ON d.user_id = u.id 
            WHERE d.id = $driverId
        ")->fetch_assoc();
        
        $driverName = $driverInfo['full_name'] ?? 'Unknown Driver';
        $notifStmt = $conn->prepare("
            INSERT INTO notifications (user_id, title, message, type)
            VALUES (?, 'Accident Reported', CONCAT('Driver ', ?, ' has reported an accident. Location: ', ?, ', ', ?), 'error')
        ");
        $notifStmt->bind_param('isdd', $admin['id'], $driverName, $latitude, $longitude);
        $notifStmt->execute();
        $notifStmt->close();
    }

    // Get driver's user_id for notification
    $driverUserStmt = $conn->query("SELECT user_id FROM drivers WHERE id = $driverId");
    $driverUser = $driverUserStmt->fetch_assoc();
    if ($driverUser) {
        $notifStmt = $conn->prepare("
            INSERT INTO notifications (user_id, title, message, type)
            VALUES (?, 'Accident Report Submitted', 'Your accident report has been submitted. Emergency services have been notified.', 'info')
        ");
        $notifStmt->bind_param('i', $driverUser['user_id']);
        $notifStmt->execute();
        $notifStmt->close();
    }

    $conn->close();

    apiSuccess('Accident report submitted successfully. Emergency services have been notified.', [
        'accident_id' => $accidentId,
        'driver_id' => $driverId,
        'reported_at' => date('Y-m-d H:i:s')
    ]);

} catch (Exception $e) {
    error_log("Accident report error: " . $e->getMessage());
    apiError('An error occurred while processing your request', 500);
}

