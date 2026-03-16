<?php
/**
 * Fleetonix Driver OTP Verification API
 * Verifies OTP code for driver login
 */

require_once __DIR__ . '/../includes/api_helper.php';
require_once __DIR__ . '/../includes/otp_helper.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db_connect.php';

// Handle CORS preflight
handleCorsPreflight();

// Start session
session_start();

// Validate request method
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    apiError('Invalid request method. Use POST.', 405);
}

// Get and validate input
$payload = getRequestData();

$user_id = isset($payload['user_id']) ? (int)$payload['user_id'] : 0;
$otp_code = isset($payload['otp_code']) ? trim($payload['otp_code']) : '';

// Validate required fields
if (empty($user_id) || empty($otp_code)) {
    apiError('User ID and OTP code are required', 422);
}

// Validate OTP format
if (strlen($otp_code) !== 6 || !ctype_digit($otp_code)) {
    apiError('OTP code must be 6 digits', 422);
}

try {
    // Verify OTP
    $otp_verified = verifyOTP($user_id, $otp_code);
    
    if (!$otp_verified) {
        apiError('Invalid or expired OTP code', 401);
    }
    
    // Get user data
    $conn = getConnection();
    $stmt = $conn->prepare("SELECT id, email, password, full_name, user_type, status FROM users WHERE id = ? AND status = 'active'");
    $stmt->bind_param('i', $user_id);
    $stmt->execute();
    $result = $stmt->get_result();
    
    if ($result->num_rows !== 1) {
        $stmt->close();
        $conn->close();
        apiError('User not found or inactive', 404);
    }
    
    $user = $result->fetch_assoc();
    unset($user['password']);
    $stmt->close();
    
    // Get driver profile
    $stmt = $conn->prepare("SELECT id, license_number, vehicle_assigned, plate_number, current_status FROM drivers WHERE user_id = ?");
    $stmt->bind_param('i', $user_id);
    $stmt->execute();
    $driverResult = $stmt->get_result();
    
    if ($driverResult->num_rows !== 1) {
        $stmt->close();
        $conn->close();
        apiError('Driver profile not found. Please contact admin.', 403);
    }
    
    $driver = $driverResult->fetch_assoc();
    $stmt->close();
    
    // Update driver status to 'available' when they log in
    if ($driver['current_status'] === 'offline') {
        $updateStmt = $conn->prepare("UPDATE drivers SET current_status = 'available' WHERE id = ?");
        $updateStmt->bind_param('i', $driver['id']);
        $updateStmt->execute();
        $updateStmt->close();
        $driver['current_status'] = 'available';
    }
    
    $conn->close();
    
    // Set session variables
    $_SESSION['driver_user_id'] = $user['id'];
    $_SESSION['driver_id'] = $driver['id'];
    $_SESSION['user_type'] = 'driver';
    
    // Format user data
    $userData = [
        'id' => $user['id'],
        'user_type' => $user['user_type'],
        'name' => $user['full_name'] ?? $user['name'] ?? '',
        'email' => $user['email']
    ];
    
    apiSuccess('OTP verified successfully', [
        'session_token' => session_id(),
        'user' => $userData,
        'driver' => $driver
    ]);
    
} catch (Exception $e) {
    if (isset($conn)) $conn->close();
    logApiError('driver_otp_verify', $e->getMessage(), ['user_id' => $user_id]);
    apiError('OTP verification failed. Please try again.', 500);
}

