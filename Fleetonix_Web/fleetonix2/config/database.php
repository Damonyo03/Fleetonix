<?php
/**
 * Fleettonix - Database Configuration
 * Database: jettsan
 */

// Database configuration
define('DB_HOST', 'localhost'); // Hostinger DB host (usually localhost)
define('DB_USER', 'u204108016_fleetonix');
define('DB_PASS', 'Fleetonix1N$');
define('DB_NAME', 'u204108016_jettsan');

// Create connection
function getDBConnection() {
    $conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
    
    // Check connection
    if ($conn->connect_error) {
        // For API endpoints, throw exception instead of die()
        if (strpos($_SERVER['REQUEST_URI'] ?? '', '/api/') !== false) {
            throw new Exception("Database connection failed: " . $conn->connect_error);
        }
        // For regular pages, use die() as before
        die("Connection failed: " . $conn->connect_error);
    }
    
    // Set charset to utf8mb4 for proper character encoding
    $conn->set_charset("utf8mb4");
    
    return $conn;
}

// Test connection (optional - for testing purposes)
function testConnection() {
    try {
        $conn = getDBConnection();
        return true;
    } catch (Exception $e) {
        return false;
    }
}
?>

