<?php
/**
 * Fleetonix - Get Driver Locations API
 * Returns current locations of active drivers
 */

require_once __DIR__ . '/../includes/api_helper.php';
require_once __DIR__ . '/../includes/db_connect.php';

// Handle CORS preflight
handleCorsPreflight();

try {
    $conn = getConnection();

    // Get active drivers with their current locations
    // Show drivers who are active and have location data
    // Prioritize those with recent location updates (within last hour)
    $query = "
        SELECT 
            d.id as driver_id,
            u.full_name as driver_name,
            d.vehicle_assigned,
            d.plate_number,
            d.current_status,
            d.current_latitude,
            d.current_longitude,
            d.last_location_update,
            COALESCE(TIMESTAMPDIFF(SECOND, d.last_location_update, NOW()), 999999) as seconds_since_update,
            -- Check for recent vehicle issues (within last 2 hours)
            (SELECT COUNT(*) FROM vehicle_issues vi 
             WHERE vi.driver_id = d.id 
             AND vi.status = 'reported' 
             AND vi.reported_at >= DATE_SUB(NOW(), INTERVAL 2 HOUR)) as has_vehicle_issue,
            -- Check for recent accidents (within last 2 hours)
            (SELECT COUNT(*) FROM accident_reports ar 
             WHERE ar.driver_id = d.id 
             AND ar.status = 'reported' 
             AND ar.reported_at >= DATE_SUB(NOW(), INTERVAL 2 HOUR)) as has_accident
        FROM drivers d
        JOIN users u ON d.user_id = u.id
        WHERE d.current_status IN ('available', 'on_schedule', 'in_progress')
            AND d.current_status != 'offline'
            AND d.current_latitude IS NOT NULL 
            AND d.current_longitude IS NOT NULL
            AND (
                d.last_location_update IS NULL 
                OR d.last_location_update >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
            )
        ORDER BY 
            CASE 
                WHEN d.last_location_update IS NULL THEN 3
                WHEN d.last_location_update >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 1
                WHEN d.last_location_update >= DATE_SUB(NOW(), INTERVAL 30 MINUTE) THEN 2
                ELSE 3
            END,
            d.last_location_update DESC
    ";

    $result = $conn->query($query);
    $drivers = [];

    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $lat = (float)$row['current_latitude'];
            $lng = (float)$row['current_longitude'];
            
            // Filter out invalid coordinates (like US default locations)
            // Philippines bounds: Lat 4-21, Lng 116-127
            // Reject coordinates that are clearly wrong (US: Lat 25-50, Lng -130 to -65)
            $isInPhilippines = ($lat >= 4 && $lat <= 21) && ($lng >= 116 && $lng <= 127);
            $isLikelyUS = ($lat >= 25 && $lat <= 50) && ($lng >= -130 && $lng <= -65);
            
            // Only include drivers with valid Philippines coordinates
            // OR coordinates that are not clearly wrong (might be testing outside Philippines)
            if ($isInPhilippines || (!$isLikelyUS && $lat >= -90 && $lat <= 90 && $lng >= -180 && $lng <= 180)) {
                $drivers[] = [
                    'driver_id' => (int)$row['driver_id'],
                    'driver_name' => $row['driver_name'],
                    'vehicle_assigned' => $row['vehicle_assigned'],
                    'plate_number' => $row['plate_number'],
                    'status' => $row['current_status'],
                    'latitude' => $lat,
                    'longitude' => $lng,
                    'last_update' => $row['last_location_update'],
                    'seconds_since_update' => (int)$row['seconds_since_update'],
                    'has_vehicle_issue' => (int)$row['has_vehicle_issue'] > 0,
                    'has_accident' => (int)$row['has_accident'] > 0
                ];
            }
        }
    }

    $conn->close();

    apiSuccess('Driver locations retrieved', $drivers);
    
} catch (Exception $e) {
    if (isset($conn)) $conn->close();
    logApiError('driver_locations', $e->getMessage());
    apiError('Failed to retrieve driver locations. Please try again.', 500);
}

