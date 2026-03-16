<?php
/**
 * Fleetonix - Get Client's Assigned Driver Location API
 * Returns location of driver assigned to client's active schedule
 */

// Suppress any output before JSON
ob_start();

require_once __DIR__ . '/../includes/api_helper.php';
require_once __DIR__ . '/../includes/db_connect.php';
require_once __DIR__ . '/../includes/auth.php';

// Handle CORS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    ob_end_clean();
    handleCorsPreflight();
}

// Start session if not already started
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Require client access
if (!isset($_SESSION['user_id']) || $_SESSION['user_type'] !== 'client') {
    ob_end_clean();
    apiError('Unauthorized. Client access required.', 401);
}

try {
    if (!isset($_SESSION['user_id'])) {
        throw new Exception('Session not initialized');
    }
    
    $client_user_id = $_SESSION['user_id'];
    
    // Get connection
    $conn = getConnection();

    // Get client ID
    $stmt = $conn->prepare("SELECT id FROM clients WHERE user_id = ?");
    $stmt->bind_param("i", $client_user_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $client = $result->fetch_assoc();
    $stmt->close();

    if (!$client) {
        $conn->close();
        ob_end_clean();
        apiSuccess('No active schedule', null);
    }

    $client_id = $client['id'];
    
    // Check if specific schedule_id is requested
    $schedule_id = isset($_GET['schedule_id']) ? (int)$_GET['schedule_id'] : null;

    // Get schedule with driver location (specific schedule or most recent active)
    if ($schedule_id) {
        // Get specific schedule
        $query = "
            SELECT 
                s.id as schedule_id,
                s.status as schedule_status,
                s.pickup_latitude,
                s.pickup_longitude,
                s.dropoff_latitude,
                s.dropoff_longitude,
                d.id as driver_id,
                u.full_name as driver_name,
                d.vehicle_assigned,
                d.plate_number,
                d.current_latitude,
                d.current_longitude,
                d.last_location_update,
                TIMESTAMPDIFF(SECOND, d.last_location_update, NOW()) as seconds_since_update
            FROM schedules s
            JOIN bookings b ON s.booking_id = b.id
            JOIN drivers d ON s.driver_id = d.id
            JOIN users u ON d.user_id = u.id
            WHERE s.id = ? AND b.client_id = ?
        ";
        $stmt = $conn->prepare($query);
        $stmt->bind_param("ii", $schedule_id, $client_id);
    } else {
        // Get most recent active schedule
        $query = "
            SELECT 
                s.id as schedule_id,
                s.status as schedule_status,
                s.pickup_latitude,
                s.pickup_longitude,
                s.dropoff_latitude,
                s.dropoff_longitude,
                d.id as driver_id,
                u.full_name as driver_name,
                d.vehicle_assigned,
                d.plate_number,
                d.current_latitude,
                d.current_longitude,
                d.last_location_update,
                TIMESTAMPDIFF(SECOND, d.last_location_update, NOW()) as seconds_since_update
            FROM schedules s
            JOIN bookings b ON s.booking_id = b.id
            JOIN drivers d ON s.driver_id = d.id
            JOIN users u ON d.user_id = u.id
            WHERE b.client_id = ?
                AND s.status IN ('pending', 'started', 'in_progress')
            ORDER BY s.scheduled_date DESC, s.scheduled_time DESC
            LIMIT 1
        ";
        $stmt = $conn->prepare($query);
        $stmt->bind_param("i", $client_id);
    }
    $stmt->execute();
    $result = $stmt->get_result();
    $schedule = $result->fetch_assoc();
    $stmt->close();
    $conn->close();

    if (!$schedule) {
        ob_end_clean();
        apiSuccess('No active schedule', null);
    }

    $response_data = [
        'schedule_id' => (int)$schedule['schedule_id'],
        'schedule_status' => $schedule['schedule_status'],
        'pickup' => [
            'latitude' => $schedule['pickup_latitude'] ? (float)$schedule['pickup_latitude'] : null,
            'longitude' => $schedule['pickup_longitude'] ? (float)$schedule['pickup_longitude'] : null
        ],
        'dropoff' => [
            'latitude' => $schedule['dropoff_latitude'] ? (float)$schedule['dropoff_latitude'] : null,
            'longitude' => $schedule['dropoff_longitude'] ? (float)$schedule['dropoff_longitude'] : null
        ],
        'driver' => [
            'driver_id' => (int)$schedule['driver_id'],
            'driver_name' => $schedule['driver_name'],
            'vehicle_assigned' => $schedule['vehicle_assigned'],
            'plate_number' => $schedule['plate_number'],
            'latitude' => $schedule['current_latitude'] ? (float)$schedule['current_latitude'] : null,
            'longitude' => $schedule['current_longitude'] ? (float)$schedule['current_longitude'] : null,
            'last_update' => $schedule['last_location_update'],
            'seconds_since_update' => $schedule['seconds_since_update'] ? (int)$schedule['seconds_since_update'] : null
        ]
    ];

    ob_end_clean();
    apiSuccess('Driver location retrieved', $response_data);
    
} catch (Exception $e) {
    if (isset($conn)) $conn->close();
    ob_end_clean();
    logApiError('client_driver_location', $e->getMessage(), ['client_user_id' => $client_user_id ?? null]);
    apiError('Failed to retrieve driver location. Please try again.', 500);
} catch (Error $e) {
    if (isset($conn)) $conn->close();
    ob_end_clean();
    logApiError('client_driver_location', 'Fatal error: ' . $e->getMessage(), ['client_user_id' => $client_user_id ?? null]);
    apiError('Fatal error occurred. Please try again.', 500);
}

