<?php
/**
 * Fleettonix - Admin Helper Functions
 */

require_once __DIR__ . '/db_connect.php';

/**
 * Get dashboard statistics
 * Optimized with prepared statements and combined queries where possible
 */
function getDashboardStats() {
    try {
        $conn = getConnection();
        $stats = [];
        
        // Combined query for drivers stats
        $result = $conn->query("
            SELECT 
                COUNT(*) as total_drivers,
                SUM(CASE WHEN current_status IN ('available', 'on_schedule', 'in_progress') THEN 1 ELSE 0 END) as active_drivers
            FROM drivers
        ");
        $driver_stats = $result->fetch_assoc();
        $stats['total_drivers'] = $driver_stats['total_drivers'] ?? 0;
        $stats['active_drivers'] = $driver_stats['active_drivers'] ?? 0;
        
        // Total Clients
        $result = $conn->query("SELECT COUNT(*) as total FROM clients");
        $stats['total_clients'] = $result->fetch_assoc()['total'] ?? 0;
        
        // Pending Bookings (from bookings table)
        $result = $conn->query("SELECT COUNT(*) as total FROM bookings WHERE status = 'pending'");
        $stats['pending_bookings'] = $result->fetch_assoc()['total'] ?? 0;
        
        // Active Schedules
        $result = $conn->query("SELECT COUNT(*) as total FROM schedules WHERE status IN ('pending', 'started', 'in_progress')");
        $stats['active_schedules'] = $result->fetch_assoc()['total'] ?? 0;
        
        // Today's Completed Trips
        $result = $conn->query("SELECT COUNT(*) as total FROM schedules WHERE DATE(completed_at) = CURDATE() AND status = 'completed'");
        $stats['today_completed'] = $result->fetch_assoc()['total'] ?? 0;
        
        // Unread Notifications (using prepared statement for security)
        $user_id = $_SESSION['user_id'] ?? 0;
        $stmt = $conn->prepare("SELECT COUNT(*) as total FROM notifications WHERE user_id = ? AND is_read = FALSE");
        $stmt->bind_param("i", $user_id);
        $stmt->execute();
        $result = $stmt->get_result();
        $stats['unread_notifications'] = $result->fetch_assoc()['total'] ?? 0;
        $stmt->close();
        
        $conn->close();
        return $stats;
    } catch (Exception $e) {
        error_log("Error in getDashboardStats: " . $e->getMessage());
        // Return default values on error
        return [
            'total_drivers' => 0,
            'active_drivers' => 0,
            'total_clients' => 0,
            'pending_bookings' => 0,
            'active_schedules' => 0,
            'today_completed' => 0,
            'unread_notifications' => 0
        ];
    }
}

/**
 * Get recent bookings
 */
function getRecentBookings($limit = 5) {
    $conn = getConnection();
    $stmt = $conn->prepare("
        SELECT b.*, c.company_name, u.full_name as client_name
        FROM bookings b
        JOIN clients c ON b.client_id = c.id
        JOIN users u ON c.user_id = u.id
        ORDER BY b.created_at DESC
        LIMIT ?
    ");
    $stmt->bind_param("i", $limit);
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
 * Get recent activities
 */
function getRecentActivities($limit = 10) {
    $conn = getConnection();
    $stmt = $conn->prepare("
        SELECT da.*, 
               d.user_id, 
               u.full_name as driver_name,
               s.id as schedule_id,
               s.scheduled_date,
               c.company_name
        FROM driver_activity da
        JOIN drivers d ON da.driver_id = d.id
        JOIN users u ON d.user_id = u.id
        LEFT JOIN schedules s ON da.schedule_id = s.id
        LEFT JOIN bookings b ON s.booking_id = b.id
        LEFT JOIN clients c ON b.client_id = c.id
        ORDER BY da.created_at DESC
        LIMIT ?
    ");
    $stmt->bind_param("i", $limit);
    $stmt->execute();
    $result = $stmt->get_result();
    $activities = [];
    while ($row = $result->fetch_assoc()) {
        $activities[] = $row;
    }
    $stmt->close();
    $conn->close();
    return $activities;
}

/**
 * Get all users with pagination
 */
function getUsers($type = null, $search = '', $page = 1, $per_page = 20) {
    $conn = getConnection();
    $offset = ($page - 1) * $per_page;
    
    $where = [];
    $params = [];
    $types = [];
    
    if ($type && in_array($type, ['admin', 'client', 'driver'])) {
        $where[] = "u.user_type = ?";
        $params[] = $type;
        $types[] = "s";
    }
    
    if ($search) {
        $where[] = "(u.full_name LIKE ? OR u.email LIKE ?)";
        $search_term = "%$search%";
        $params[] = $search_term;
        $params[] = $search_term;
        $types[] = "ss";
    }
    
    $where_clause = !empty($where) ? "WHERE " . implode(" AND ", $where) : "";
    $type_str = implode("", $types);
    
    // Get total count
    $count_sql = "SELECT COUNT(*) as total FROM users u $where_clause";
    if (!empty($params)) {
        $stmt = $conn->prepare($count_sql);
        if ($type_str) {
            $stmt->bind_param($type_str, ...$params);
        }
        $stmt->execute();
        $total = $stmt->get_result()->fetch_assoc()['total'];
        $stmt->close();
    } else {
        $result = $conn->query($count_sql);
        $total = $result->fetch_assoc()['total'];
    }
    
    // Get users
    $sql = "SELECT u.* FROM users u $where_clause ORDER BY u.created_at DESC LIMIT ? OFFSET ?";
    $params[] = $per_page;
    $params[] = $offset;
    $types[] = "ii";
    $type_str = implode("", $types);
    
    $stmt = $conn->prepare($sql);
    if ($type_str) {
        $stmt->bind_param($type_str, ...$params);
    }
    $stmt->execute();
    $result = $stmt->get_result();
    $users = [];
    while ($row = $result->fetch_assoc()) {
        $users[] = $row;
    }
    $stmt->close();
    $conn->close();
    
    return [
        'users' => $users,
        'total' => $total,
        'pages' => ceil($total / $per_page)
    ];
}

/**
 * Get user by ID
 */
function getUserById($id) {
    $conn = getConnection();
    $stmt = $conn->prepare("SELECT * FROM users WHERE id = ?");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $result = $stmt->get_result();
    $user = $result->fetch_assoc();
    $stmt->close();
    $conn->close();
    return $user;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
function calculateDistance($lat1, $lon1, $lat2, $lon2) {
    if ($lat1 == 0 || $lon1 == 0 || $lat2 == 0 || $lon2 == 0) {
        return null; // Invalid coordinates
    }
    
    $earthRadius = 6371; // Earth's radius in kilometers
    
    $dLat = deg2rad($lat2 - $lat1);
    $dLon = deg2rad($lon2 - $lon1);
    
    $a = sin($dLat / 2) * sin($dLat / 2) +
         cos(deg2rad($lat1)) * cos(deg2rad($lat2)) *
         sin($dLon / 2) * sin($dLon / 2);
    
    $c = 2 * atan2(sqrt($a), sqrt(1 - $a));
    $distance = $earthRadius * $c;
    
    return round($distance, 2); // Round to 2 decimal places
}

/**
 * Get nearest drivers sorted by distance from pickup location
 * @param float $pickup_lat Pickup latitude
 * @param float $pickup_lon Pickup longitude
 * @param string $status Driver status filter (optional)
 * @return array Drivers sorted by distance (nearest first)
 */
function getNearestDrivers($pickup_lat, $pickup_lon, $status = null) {
    $conn = getConnection();
    
    $where = [];
    $params = [];
    $types = [];
    
    // Only include active users
    $where[] = "u.status = 'active'";
    
    // Exclude offline drivers by default
    $where[] = "d.current_status != 'offline'";
    
    // Only include drivers with valid location data
    $where[] = "d.current_latitude IS NOT NULL";
    $where[] = "d.current_longitude IS NOT NULL";
    $where[] = "d.current_latitude != 0";
    $where[] = "d.current_longitude != 0";
    // Only include drivers with recent location updates (within last hour)
    $where[] = "(d.last_location_update IS NOT NULL AND d.last_location_update >= DATE_SUB(NOW(), INTERVAL 1 HOUR))";
    
    if ($status) {
        $where[] = "d.current_status = ?";
        $params[] = $status;
        $types[] = "s";
    }
    
    $where_clause = "WHERE " . implode(" AND ", $where);
    $type_str = implode("", $types);
    
    $sql = "SELECT d.*, u.full_name, u.email, u.phone, u.status as user_status,
                   d.current_latitude, d.current_longitude, d.last_location_update
            FROM drivers d
            JOIN users u ON d.user_id = u.id
            $where_clause
            ORDER BY u.full_name ASC";
    
    if (!empty($params)) {
        $stmt = $conn->prepare($sql);
        $stmt->bind_param($type_str, ...$params);
        $stmt->execute();
        $result = $stmt->get_result();
    } else {
        $result = $conn->query($sql);
    }
    
    $drivers = [];
    while ($row = $result->fetch_assoc()) {
        // Calculate distance from pickup location
        $distance = calculateDistance(
            $pickup_lat,
            $pickup_lon,
            (float)$row['current_latitude'],
            (float)$row['current_longitude']
        );
        
        if ($distance !== null) {
            $row['distance_km'] = $distance;
            $drivers[] = $row;
        }
    }
    
    if (!empty($params)) {
        $stmt->close();
    }
    $conn->close();
    
    // Sort by distance (nearest first)
    usort($drivers, function($a, $b) {
        return $a['distance_km'] <=> $b['distance_km'];
    });
    
    return $drivers;
}

/**
 * Get all drivers
 */
function getAllDrivers($status = null, $search = '') {
    $conn = getConnection();
    
    $where = [];
    $params = [];
    $types = [];
    
    // Only include active users
    $where[] = "u.status = 'active'";
    
    if ($status) {
        // When a specific status is selected, filter by that status
        $where[] = "d.current_status = ?";
        $params[] = $status;
        $types[] = "s";
    }
    // When status is null (All Status), show all drivers including offline
    
    if ($search) {
        $where[] = "(u.full_name LIKE ? OR u.email LIKE ? OR d.license_number LIKE ?)";
        $search_term = "%$search%";
        $params[] = $search_term;
        $params[] = $search_term;
        $params[] = $search_term;
        $types[] = "sss";
    }
    
    $where_clause = !empty($where) ? "WHERE " . implode(" AND ", $where) : "";
    $type_str = implode("", $types);
    
    $sql = "SELECT d.*, u.full_name, u.email, u.phone, u.status as user_status
            FROM drivers d
            JOIN users u ON d.user_id = u.id
            $where_clause
            ORDER BY u.full_name ASC";
    
    if (!empty($params)) {
        $stmt = $conn->prepare($sql);
        $stmt->bind_param($type_str, ...$params);
        $stmt->execute();
        $result = $stmt->get_result();
    } else {
        $result = $conn->query($sql);
    }
    
    $drivers = [];
    while ($row = $result->fetch_assoc()) {
        $drivers[] = $row;
    }
    
    if (!empty($params)) {
        $stmt->close();
    }
    $conn->close();
    return $drivers;
}

/**
 * Get all clients
 */
function getAllClients($search = '') {
    $conn = getConnection();
    
    if ($search) {
        $stmt = $conn->prepare("
            SELECT c.*, u.full_name, u.email, u.phone, u.status as user_status
            FROM clients c
            JOIN users u ON c.user_id = u.id
            WHERE c.company_name LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?
            ORDER BY c.company_name ASC
        ");
        $search_term = "%$search%";
        $stmt->bind_param("sss", $search_term, $search_term, $search_term);
        $stmt->execute();
        $result = $stmt->get_result();
    } else {
        $result = $conn->query("
            SELECT c.*, u.full_name, u.email, u.phone, u.status as user_status
            FROM clients c
            JOIN users u ON c.user_id = u.id
            ORDER BY c.company_name ASC
        ");
    }
    
    $clients = [];
    while ($row = $result->fetch_assoc()) {
        $clients[] = $row;
    }
    
    if ($search) {
        $stmt->close();
    }
    $conn->close();
    return $clients;
}

/**
 * Get all bookings
 */
function getAllBookings($status = null, $client_id = null) {
    $conn = getConnection();
    
    $where = [];
    $params = [];
    $types = [];
    
    if ($status) {
        $where[] = "b.status = ?";
        $params[] = $status;
        $types[] = "s";
    }
    
    if ($client_id) {
        $where[] = "b.client_id = ?";
        $params[] = $client_id;
        $types[] = "i";
    }
    
    $where_clause = !empty($where) ? "WHERE " . implode(" AND ", $where) : "";
    $type_str = implode("", $types);
    
    $sql = "
        SELECT b.*, c.company_name, u.full_name as client_name
        FROM bookings b
        JOIN clients c ON b.client_id = c.id
        JOIN users u ON c.user_id = u.id
        $where_clause
        ORDER BY b.created_at DESC
    ";
    
    if (!empty($params)) {
        $stmt = $conn->prepare($sql);
        $stmt->bind_param($type_str, ...$params);
        $stmt->execute();
        $result = $stmt->get_result();
    } else {
        $result = $conn->query($sql);
    }
    
    $bookings = [];
    while ($row = $result->fetch_assoc()) {
        $bookings[] = $row;
    }
    
    if (!empty($params)) {
        $stmt->close();
    }
    $conn->close();
    return $bookings;
}

/**
 * Get all schedules
 */
function getAllSchedules($driver_id = null, $status = null) {
    $conn = getConnection();
    
    $where = [];
    $params = [];
    $types = [];
    
    if ($driver_id) {
        $where[] = "s.driver_id = ?";
        $params[] = $driver_id;
        $types[] = "i";
    }
    
    if ($status) {
        $where[] = "s.status = ?";
        $params[] = $status;
        $types[] = "s";
    }
    
    $where_clause = !empty($where) ? "WHERE " . implode(" AND ", $where) : "";
    $type_str = implode("", $types);
    
    $sql = "
        SELECT s.*, 
               d.user_id as driver_user_id,
               u_driver.full_name as driver_name,
               c.company_name,
               u_client.full_name as client_name
        FROM schedules s
        JOIN drivers d ON s.driver_id = d.id
        JOIN users u_driver ON d.user_id = u_driver.id
        JOIN bookings b ON s.booking_id = b.id
        JOIN clients c ON b.client_id = c.id
        JOIN users u_client ON c.user_id = u_client.id
        $where_clause
        ORDER BY s.scheduled_date DESC, s.scheduled_time DESC
    ";
    
    if (!empty($params)) {
        $stmt = $conn->prepare($sql);
        $stmt->bind_param($type_str, ...$params);
        $stmt->execute();
        $result = $stmt->get_result();
    } else {
        $result = $conn->query($sql);
    }
    
    $schedules = [];
    while ($row = $result->fetch_assoc()) {
        $schedules[] = $row;
    }
    
    if (!empty($params)) {
        $stmt->close();
    }
    $conn->close();
    return $schedules;
}

?>

