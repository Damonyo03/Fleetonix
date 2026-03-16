<?php
/**
 * Debug endpoint to check driver location coordinates
 * Use this to verify what coordinates are stored in the database
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/../includes/db_connect.php';

$conn = getConnection();

// Get all drivers with their current locations
$query = "
    SELECT 
        d.id as driver_id,
        u.full_name as driver_name,
        d.current_latitude,
        d.current_longitude,
        d.last_location_update,
        CASE 
            WHEN d.current_latitude BETWEEN 4 AND 21 AND d.current_longitude BETWEEN 116 AND 127 THEN 'Philippines'
            WHEN d.current_latitude BETWEEN 25 AND 50 AND d.current_longitude BETWEEN -130 AND -65 THEN 'North America'
            WHEN d.current_latitude BETWEEN -90 AND 90 AND d.current_longitude BETWEEN -180 AND 180 THEN 'Valid but unknown region'
            ELSE 'Invalid'
        END as region_check
    FROM drivers d
    JOIN users u ON d.user_id = u.id
    WHERE d.current_latitude IS NOT NULL 
        AND d.current_longitude IS NOT NULL
    ORDER BY d.last_location_update DESC
";

$result = $conn->query($query);
$drivers = [];

if ($result) {
    while ($row = $result->fetch_assoc()) {
        $drivers[] = [
            'driver_id' => (int)$row['driver_id'],
            'driver_name' => $row['driver_name'],
            'latitude' => (float)$row['current_latitude'],
            'longitude' => (float)$row['current_longitude'],
            'last_update' => $row['last_location_update'],
            'region_check' => $row['region_check'],
            'might_be_swapped' => (
                ($row['current_latitude'] >= 116 && $row['current_latitude'] <= 127) &&
                ($row['current_longitude'] >= 4 && $row['current_longitude'] <= 21)
            )
        ];
    }
}

$conn->close();

echo json_encode([
    'success' => true,
    'message' => 'Driver location debug info',
    'data' => $drivers,
    'note' => 'If "might_be_swapped" is true, coordinates are likely swapped. Philippines should be: Lat ~4-21, Lng ~116-127'
], JSON_PRETTY_PRINT);

