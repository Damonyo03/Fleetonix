<?php
/**
 * Fleettonix - Client Helper Functions
 */

require_once __DIR__ . '/db_connect.php';

/**
 * Get client dashboard statistics
 */
function getClientDashboardStats($client_id) {
    $conn = getConnection();
    $stats = [];
    
    // Total Bookings
    $stmt = $conn->prepare("SELECT COUNT(*) as total FROM bookings WHERE client_id = ?");
    $stmt->bind_param("i", $client_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $stats['total_bookings'] = $result->fetch_assoc()['total'];
    $stmt->close();
    
    // Pending Bookings
    $stmt = $conn->prepare("SELECT COUNT(*) as total FROM bookings WHERE client_id = ? AND status = 'pending'");
    $stmt->bind_param("i", $client_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $stats['pending_bookings'] = $result->fetch_assoc()['total'];
    $stmt->close();
    
    // Active Schedules
    $stmt = $conn->prepare("
        SELECT COUNT(*) as total 
        FROM schedules s
        JOIN bookings b ON s.booking_id = b.id
        WHERE b.client_id = ? AND s.status IN ('pending', 'started', 'in_progress')
    ");
    $stmt->bind_param("i", $client_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $stats['active_schedules'] = $result->fetch_assoc()['total'];
    $stmt->close();
    
    // Completed Bookings
    $stmt = $conn->prepare("SELECT COUNT(*) as total FROM bookings WHERE client_id = ? AND status = 'completed'");
    $stmt->bind_param("i", $client_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $stats['completed_bookings'] = $result->fetch_assoc()['total'];
    $stmt->close();
    
    // Today's Schedules
    $today = date('Y-m-d');
    $stmt = $conn->prepare("
        SELECT COUNT(*) as total 
        FROM schedules s
        JOIN bookings b ON s.booking_id = b.id
        WHERE b.client_id = ? AND DATE(s.scheduled_date) = ?
    ");
    $stmt->bind_param("is", $client_id, $today);
    $stmt->execute();
    $result = $stmt->get_result();
    $stats['today_schedules'] = $result->fetch_assoc()['total'];
    $stmt->close();
    
    // Unread Notifications
    $user_id = $_SESSION['user_id'];
    $stmt = $conn->prepare("SELECT COUNT(*) as total FROM notifications WHERE user_id = ? AND is_read = FALSE");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $stats['unread_notifications'] = $result->fetch_assoc()['total'];
    $stmt->close();
    
    $conn->close();
    return $stats;
}

/**
 * Get client's recent bookings
 */
function getClientRecentBookings($client_id, $limit = 5) {
    $conn = getConnection();
    $stmt = $conn->prepare("
        SELECT b.*
        FROM bookings b
        WHERE b.client_id = ?
        ORDER BY b.created_at DESC
        LIMIT ?
    ");
    $stmt->bind_param("ii", $client_id, $limit);
    $stmt->execute();
    $result = $stmt->get_result();
    $bookings = [];
    while ($row = $result->fetch_assoc()) {
        $bookings[] = $row;
    }
    $stmt->close();
    $conn->close();
    return $bookings;
}

/**
 * Get client's active schedules
 */
function getClientActiveSchedules($client_id, $limit = 5) {
    $conn = getConnection();
    $stmt = $conn->prepare("
        SELECT s.*, 
               d.user_id as driver_user_id,
               u_driver.full_name as driver_name,
               u_driver.phone as driver_phone,
               d.vehicle_assigned,
               d.plate_number
        FROM schedules s
        JOIN bookings b ON s.booking_id = b.id
        JOIN drivers d ON s.driver_id = d.id
        JOIN users u_driver ON d.user_id = u_driver.id
        WHERE b.client_id = ? AND s.status IN ('pending', 'started', 'in_progress')
        ORDER BY s.scheduled_date ASC, s.scheduled_time ASC
        LIMIT ?
    ");
    $stmt->bind_param("ii", $client_id, $limit);
    $stmt->execute();
    $result = $stmt->get_result();
    $schedules = [];
    while ($row = $result->fetch_assoc()) {
        $schedules[] = $row;
    }
    $stmt->close();
    $conn->close();
    return $schedules;
}

