<?php
/**
 * Fleetonix - Get Pending Accidents API
 * Returns unacknowledged accident reports for admin dashboard
 */

require_once __DIR__ . '/../includes/api_helper.php';
require_once __DIR__ . '/../includes/db_connect.php';
require_once __DIR__ . '/../includes/auth.php';

// Handle CORS preflight
handleCorsPreflight();

// Start session
session_start();

// Require admin access
if (!isset($_SESSION['user_id']) || !isset($_SESSION['user_type']) || $_SESSION['user_type'] !== 'admin') {
    apiError('Unauthorized. Admin access required.', 401);
}

try {
    $conn = getConnection();

    // Get pending (unacknowledged) accidents with driver and client info
    $query = "
        SELECT 
            ar.id as accident_id,
            ar.driver_id,
            ar.schedule_id,
            ar.latitude,
            ar.longitude,
            ar.description,
            ar.reported_at,
            ar.status,
            u.full_name as driver_name,
            u.email as driver_email,
            u.phone as driver_phone,
            d.vehicle_assigned,
            d.plate_number,
            s.booking_id,
            b.client_id,
            c.company_name,
            c.user_id as client_user_id,
            u_client.full_name as client_name,
            u_client.phone as client_phone,
            s.scheduled_date,
            s.scheduled_time,
            b.number_of_passengers
        FROM accident_reports ar
        JOIN drivers d ON ar.driver_id = d.id
        JOIN users u ON d.user_id = u.id
        LEFT JOIN schedules s ON ar.schedule_id = s.id
        LEFT JOIN bookings b ON s.booking_id = b.id
        LEFT JOIN clients c ON b.client_id = c.id
        LEFT JOIN users u_client ON c.user_id = u_client.id
        WHERE ar.status = 'reported'
        ORDER BY ar.reported_at DESC
    ";

    $result = $conn->query($query);
    
    if (!$result) {
        throw new Exception('Query failed: ' . $conn->error);
    }
    
    $accidents = [];

    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $accidents[] = [
                'accident_id' => (int)$row['accident_id'],
                'driver_id' => (int)$row['driver_id'],
                'driver_name' => $row['driver_name'],
                'driver_email' => $row['driver_email'],
                'driver_phone' => $row['driver_phone'],
                'vehicle_assigned' => $row['vehicle_assigned'],
                'plate_number' => $row['plate_number'],
                'latitude' => (float)$row['latitude'],
                'longitude' => (float)$row['longitude'],
                'description' => $row['description'],
                'reported_at' => $row['reported_at'],
                'status' => $row['status'], // Include status in response
                'schedule_id' => $row['schedule_id'] ? (int)$row['schedule_id'] : null,
                'booking_id' => $row['booking_id'] ? (int)$row['booking_id'] : null,
                'client' => $row['company_name'] ? [
                    'company_name' => $row['company_name'],
                    'client_name' => $row['client_name'],
                    'phone' => $row['client_phone'],
                    'passengers' => $row['number_of_passengers'] ? (int)$row['number_of_passengers'] : null
                ] : null,
                'scheduled_date' => $row['scheduled_date'],
                'scheduled_time' => $row['scheduled_time']
            ];
        }
    }

    $conn->close();

    apiSuccess('Pending accidents retrieved', $accidents);
    
} catch (Exception $e) {
    if (isset($conn)) $conn->close();
    logApiError('get_pending_accidents', $e->getMessage());
    apiError('Failed to retrieve pending accidents. Please try again.', 500);
}

