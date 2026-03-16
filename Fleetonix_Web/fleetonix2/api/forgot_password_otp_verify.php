<?php
/**
 * Fleetonix Forgot Password OTP Verification API
 * Verifies OTP code for password reset
 */

require_once __DIR__ . '/../includes/api_helper.php';
require_once __DIR__ . '/../includes/otp_helper.php';
require_once __DIR__ . '/../includes/db_connect.php';

// Handle CORS preflight
handleCorsPreflight();

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
    $stmt = $conn->prepare("SELECT id, email, full_name FROM users WHERE id = ? AND status = 'active'");
    $stmt->bind_param('i', $user_id);
    $stmt->execute();
    $result = $stmt->get_result();
    
    if ($result->num_rows !== 1) {
        $stmt->close();
        $conn->close();
        apiError('User not found or inactive', 404);
    }
    
    $user = $result->fetch_assoc();
    $stmt->close();
    $conn->close();
    
    // Return success - user can now reset password
    apiSuccess('OTP verified successfully. You can now reset your password.', [
        'user_id' => $user['id'],
        'email' => $user['email']
    ]);
    
} catch (Exception $e) {
    if (isset($conn)) $conn->close();
    logApiError('forgot_password_otp_verify', $e->getMessage(), ['user_id' => $user_id]);
    apiError('OTP verification failed. Please try again.', 500);
}

