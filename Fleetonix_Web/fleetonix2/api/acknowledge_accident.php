<?php
/**
 * Fleetonix - Acknowledge Accident API
 * Allows admin to acknowledge an accident report
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

// Validate request method
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    apiError('Invalid request method. Use POST.', 405);
}

// Get and validate input
$payload = getJsonInput();
$accident_id = isset($payload['accident_id']) ? (int)$payload['accident_id'] : 0;

if (!$accident_id) {
    apiError('Accident ID is required', 422);
}

try {
    $conn = getConnection();

    // Update accident status to acknowledged
    $stmt = $conn->prepare("
        UPDATE accident_reports 
        SET status = 'acknowledged', acknowledged_at = NOW() 
        WHERE id = ? AND status = 'reported'
    ");
    $stmt->bind_param('i', $accident_id);
    
    if (!$stmt->execute()) {
        $stmt->close();
        $conn->close();
        apiError('Failed to acknowledge accident', 500);
    }

    $affected = $conn->affected_rows;
    $stmt->close();
    $conn->close();

    if ($affected === 0) {
        apiError('Accident not found or already acknowledged', 404);
    }

    apiSuccess('Accident acknowledged successfully', [
        'accident_id' => $accident_id,
        'acknowledged_at' => date('Y-m-d H:i:s')
    ]);

} catch (Exception $e) {
    if (isset($stmt)) $stmt->close();
    if (isset($conn)) $conn->close();
    logApiError('acknowledge_accident', $e->getMessage());
    apiError('An error occurred while processing your request', 500);
}

