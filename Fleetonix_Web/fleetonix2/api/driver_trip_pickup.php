<?php
/**
 * Fleetonix - Driver Mark Pickup API
 * Marks that the driver has picked up the passenger
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

if (!$scheduleId) {
    apiError('Schedule ID is required', 422, ['schedule_id' => 'Schedule ID cannot be empty']);
}

try {
    $conn = getConnection();

    // Get schedule and booking info
    $stmt = $conn->prepare("
        SELECT s.*, b.id AS booking_id, b.return_to_pickup
        FROM schedules s
        JOIN bookings b ON s.booking_id = b.id
        WHERE s.id = ? AND s.driver_id = ?
    ");
    $stmt->bind_param('ii', $scheduleId, $driverId);
    $stmt->execute();
    $result = $stmt->get_result();
    $schedule = $result->fetch_assoc();
    $stmt->close();

    if (!$schedule) {
        $conn->close();
        apiError('Schedule not found or not assigned to you', 404);
    }

    $bookingId = $schedule['booking_id'];
    $tripPhase = $schedule['trip_phase'] ?? 'pending';

    // Check if pickup can be marked
    if ($tripPhase !== 'pickup' && $tripPhase !== 'pending') {
        $conn->close();
        apiError('Pickup cannot be marked. Current phase: ' . $tripPhase, 400);
    }

    // Start transaction
    $conn->begin_transaction();

    // Update schedule phase to dropoff
    $stmt = $conn->prepare("UPDATE schedules SET trip_phase = 'dropoff', status = 'in_progress', started_at = COALESCE(started_at, NOW()) WHERE id = ?");
    $stmt->bind_param('i', $scheduleId);
    if (!$stmt->execute()) {
        throw new Exception('Failed to update schedule');
    }
    $stmt->close();

    // Get driver's current location
    $locationStmt = $conn->prepare("SELECT current_latitude, current_longitude FROM drivers WHERE id = ?");
    $locationStmt->bind_param('i', $driverId);
    $locationStmt->execute();
    $locationResult = $locationStmt->get_result();
    $location = $locationResult->fetch_assoc();
    $locationStmt->close();
    
    $activityLat = $location['current_latitude'] ?? null;
    $activityLon = $location['current_longitude'] ?? null;

    // Log activity with current location
    $stmt = $conn->prepare("
        INSERT INTO driver_activity (driver_id, schedule_id, activity_type, description, location_latitude, location_longitude)
        VALUES (?, ?, 'pickup_completed', 'Driver picked up passenger', ?, ?)
    ");
    $stmt->bind_param('iidd', $driverId, $scheduleId, $activityLat, $activityLon);
    if (!$stmt->execute()) {
        throw new Exception('Failed to log activity');
    }
    $stmt->close();

    // Create notification for client
    $clientStmt = $conn->prepare("SELECT client_id FROM bookings WHERE id = ?");
    $clientStmt->bind_param('i', $bookingId);
    $clientStmt->execute();
    $clientResult = $clientStmt->get_result();
    $booking = $clientResult->fetch_assoc();
    $clientStmt->close();
    
    if ($booking) {
        $clientStmt = $conn->prepare("SELECT user_id FROM clients WHERE id = ?");
        $clientStmt->bind_param('i', $booking['client_id']);
        $clientStmt->execute();
        $clientResult = $clientStmt->get_result();
        $client = $clientResult->fetch_assoc();
        $clientStmt->close();
        
        if ($client) {
            $stmt = $conn->prepare("
                INSERT INTO notifications (user_id, title, message, type)
                VALUES (?, 'Pickup Completed', 'Your driver has picked up the passenger', 'info')
            ");
            $stmt->bind_param('i', $client['user_id']);
            $stmt->execute();
            $stmt->close();
        }
    }

    $conn->commit();
    $conn->close();

    apiSuccess('Pickup marked successfully', [
        'schedule_id' => $scheduleId,
        'trip_phase' => 'dropoff',
        'status' => 'in_progress'
    ]);

} catch (Exception $e) {
    if (isset($conn)) {
        $conn->rollback();
        $conn->close();
    }
    logApiError('driver_trip_pickup', $e->getMessage(), ['driver_id' => $driverId, 'schedule_id' => $scheduleId]);
    apiError('Failed to mark pickup. Please try again.', 500);
}
