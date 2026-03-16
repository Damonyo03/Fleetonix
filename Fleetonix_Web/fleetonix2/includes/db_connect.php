<?php
/**
 * Fleettonix - Database Connection
 * Include this file to get database connection
 */

require_once __DIR__ . '/../config/database.php';

// Set PHP timezone to Philippines (UTC+8)
date_default_timezone_set('Asia/Manila');

// Get database connection
function getConnection() {
    $conn = getDBConnection();
    // Set MySQL timezone to Philippines (UTC+8)
    if ($conn) {
        $conn->query("SET time_zone = '+08:00'");
    }
    return $conn;
}

// Close database connection
function closeConnection($conn) {
    if ($conn) {
        $conn->close();
    }
}

