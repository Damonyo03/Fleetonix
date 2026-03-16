<?php
/**
 * Fleetonix - Driver Logout API
 * Handles driver logout and updates status to offline
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

try {
    $conn = getConnection();

    // Update driver status to offline and clear location
    $stmt = $conn->prepare("
        UPDATE drivers 
        SET current_status = 'offline',
            current_latitude = NULL,
            current_longitude = NULL,
            last_location_update = NULL
        WHERE id = ?
    ");
    $stmt->bind_param('i', $driverId);

    if (!$stmt->execute()) {
        throw new Exception('Failed to update driver status: ' . $stmt->error);
    }

    $stmt->close();

    // Destroy session
    session_unset();
    session_destroy();

    $conn->close();

    apiSuccess('Logout successful', [
        'driver_id' => $driverId,
        'message' => 'Driver status set to offline'
    ]);
    
} catch (Exception $e) {
    if (isset($stmt)) $stmt->close();
    if (isset($conn)) $conn->close();
    logApiError('driver_logout', $e->getMessage(), ['driver_id' => $driverId]);
    apiError('Failed to logout. Please try again.', 500);
}

