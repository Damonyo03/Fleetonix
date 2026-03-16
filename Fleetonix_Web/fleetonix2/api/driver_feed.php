<?php
/**
 * Fleetonix - Driver Schedule Feed API
 * Returns upcoming schedules/bookings for authenticated drivers
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

$driverUserId = (int)$_SESSION['driver_user_id'];
$driverId = (int)$_SESSION['driver_id'];

try {
    $conn = getConnection();

    $stmt = $conn->prepare('SELECT id FROM drivers WHERE id = ? AND user_id = ? LIMIT 1');
    $stmt->bind_param('ii', $driverId, $driverUserId);
    $stmt->execute();
    $driverCheck = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$driverCheck) {
        $conn->close();
        apiError('Driver profile not found for session.', 404);
    }

    $sql = "
        SELECT s.id AS schedule_id,
               s.status AS schedule_status,
               s.trip_phase,
               s.scheduled_date,
               s.scheduled_time,
               s.started_at,
               s.completed_at,
               s.estimated_arrival_time,
               s.actual_arrival_time,
               s.pickup_location,
               s.pickup_latitude,
               s.pickup_longitude,
               s.dropoff_location,
               s.dropoff_latitude,
               s.dropoff_longitude,
               b.id AS booking_id,
               b.return_to_pickup,
               b.return_pickup_time,
               b.number_of_passengers,
               b.special_instructions,
               b.status AS booking_status,
               c.company_name,
               u_client.full_name AS client_name,
               u_client.phone AS client_phone,
               u_client.email AS client_email
        FROM schedules s
        JOIN bookings b ON s.booking_id = b.id
        JOIN clients c ON b.client_id = c.id
        JOIN users u_client ON c.user_id = u_client.id
        WHERE s.driver_id = ?
          AND s.status != 'cancelled'
          AND (
              s.trip_phase != 'completed'
              OR (s.trip_phase = 'completed' AND s.completed_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE))
          )
        ORDER BY 
            CASE 
                WHEN s.status = 'in_progress' AND s.trip_phase IN ('pickup', 'dropoff', 'return_pickup') THEN 1
                WHEN s.status = 'pending' THEN 2
                WHEN s.status = 'started' THEN 3
                WHEN s.status = 'completed' THEN 4
                ELSE 5
            END,
            s.scheduled_date ASC,
            s.scheduled_time ASC,
            s.created_at DESC
        LIMIT 10
    ";

    $stmt = $conn->prepare($sql);
    $stmt->bind_param('i', $driverId);
    $stmt->execute();
    $result = $stmt->get_result();

    $schedules = [];
    while ($row = $result->fetch_assoc()) {
        $schedules[] = [
            'schedule_id' => (int)$row['schedule_id'],
            'booking_id' => (int)$row['booking_id'],
            'schedule_status' => $row['schedule_status'],
            'trip_phase' => $row['trip_phase'] ?? 'pending',
            'scheduled_date' => $row['scheduled_date'],
            'scheduled_time' => $row['scheduled_time'],
            'started_at' => $row['started_at'],
            'completed_at' => $row['completed_at'],
            'estimated_arrival_time' => $row['estimated_arrival_time'],
            'actual_arrival_time' => $row['actual_arrival_time'],
            'pickup' => [
                'address' => $row['pickup_location'],
                'latitude' => (float)$row['pickup_latitude'],
                'longitude' => (float)$row['pickup_longitude']
            ],
            'dropoff' => [
                'address' => $row['dropoff_location'],
                'latitude' => (float)$row['dropoff_latitude'],
                'longitude' => (float)$row['dropoff_longitude']
            ],
            'return_to_pickup' => (bool)$row['return_to_pickup'],
            'return_pickup_time' => $row['return_pickup_time'],
            'passengers' => (int)$row['number_of_passengers'],
            'special_instructions' => $row['special_instructions'],
            'booking_status' => $row['booking_status'],
            'client' => [
                'company' => $row['company_name'],
                'name' => $row['client_name'],
                'phone' => $row['client_phone'],
                'email' => $row['client_email']
            ]
        ];
    }

    $stmt->close();
    $conn->close();

    apiSuccess('Driver schedule feed retrieved', [
        'count' => count($schedules),
        'schedules' => $schedules
    ]);
    
} catch (Exception $e) {
    if (isset($stmt)) $stmt->close();
    if (isset($conn)) $conn->close();
    logApiError('driver_feed', $e->getMessage(), ['driver_id' => $driverId]);
    apiError('Failed to retrieve schedule feed. Please try again.', 500);
}
