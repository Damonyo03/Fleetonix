<?php
/**
 * Fleetonix - Driver Vehicle Issue Report API
 * Allows drivers to report vehicle issues
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
$issueType = isset($payload['issue_type']) ? trim($payload['issue_type']) : '';
$description = isset($payload['description']) ? trim($payload['description']) : '';
$latitude = isset($payload['latitude']) ? (float)$payload['latitude'] : null;
$longitude = isset($payload['longitude']) ? (float)$payload['longitude'] : null;

// Validation
$errors = [];
if (empty($issueType)) {
    $errors['issue_type'] = 'Issue type is required';
}
if (empty($description)) {
    $errors['description'] = 'Description is required';
}
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

    // Insert vehicle issue report
    $stmt = $conn->prepare("
        INSERT INTO vehicle_issues (driver_id, schedule_id, issue_type, description, latitude, longitude, status)
        VALUES (?, ?, ?, ?, ?, ?, 'reported')
    ");
    $stmt->bind_param('iissdd', $driverId, $scheduleId, $issueType, $description, $latitude, $longitude);
    
    if (!$stmt->execute()) {
        $stmt->close();
        $conn->close();
        apiError('Failed to create vehicle issue report', 500);
    }

    $issueId = $conn->insert_id;
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
            VALUES (?, 'Vehicle Issue Reported', CONCAT('Driver ', ?, ' has reported a vehicle issue: ', ?), 'warning')
        ");
        $notifStmt->bind_param('iss', $admin['id'], $driverName, $issueType);
        $notifStmt->execute();
        $notifStmt->close();
    }

    // Get driver's user_id for notification
    $driverUserStmt = $conn->query("SELECT user_id FROM drivers WHERE id = $driverId");
    $driverUser = $driverUserStmt->fetch_assoc();
    if ($driverUser) {
        $notifStmt = $conn->prepare("
            INSERT INTO notifications (user_id, title, message, type)
            VALUES (?, 'Vehicle Issue Submitted', 'Your vehicle issue report has been submitted. Support team will contact you shortly.', 'info')
        ");
        $notifStmt->bind_param('i', $driverUser['user_id']);
        $notifStmt->execute();
        $notifStmt->close();
    }

    $conn->close();

    apiSuccess('Vehicle issue report submitted successfully. Support team has been notified.', [
        'issue_id' => $issueId,
        'driver_id' => $driverId,
        'reported_at' => date('Y-m-d H:i:s')
    ]);

} catch (Exception $e) {
    error_log("Vehicle issue report error: " . $e->getMessage());
    apiError('An error occurred while processing your request', 500);
}

