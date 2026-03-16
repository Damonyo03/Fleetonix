<?php
/**
 * Fleetonix Forgot Password API
 * Sends OTP to user's email for password reset
 */

require_once __DIR__ . '/../includes/api_helper.php';
require_once __DIR__ . '/../includes/otp_helper.php';
require_once __DIR__ . '/../includes/email_helper.php';
require_once __DIR__ . '/../includes/db_connect.php';

// Handle CORS preflight
handleCorsPreflight();

// Validate request method
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    apiError('Invalid request method. Use POST.', 405);
}

// Get and validate input
$payload = getRequestData();

$email = isset($payload['email']) ? trim($payload['email']) : '';

// Validate required fields
if (empty($email)) {
    apiError('Email is required', 422);
}

// Validate email format
if (!validateEmailFormat($email)) {
    apiError('Please provide a valid email address', 422);
}

try {
    // Check if user exists
    $conn = getConnection();
    $stmt = $conn->prepare("SELECT id, full_name, email FROM users WHERE email = ? AND status = 'active'");
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $result = $stmt->get_result();
    
    if ($result->num_rows === 0) {
        $stmt->close();
        $conn->close();
        // Don't reveal if email exists or not (security best practice)
        apiSuccess('If an account with that email exists, an OTP code has been sent.', [
            'email' => $email,
            'message' => 'Check your email for the 6-digit OTP code. It will expire in 5 minutes.'
        ]);
    }
    
    $user = $result->fetch_assoc();
    $stmt->close();
    $conn->close();
    
    // Generate and send OTP
    $otp_code = createOTP($user['id'], $user['email']);
    
    if (!$otp_code) {
        apiError('Failed to generate OTP. Please try again.', 500);
    }
    
    // Send OTP email
    $email_sent = sendPasswordResetOTPEmail($user['email'], $otp_code, $user['full_name']);
    
    if (!$email_sent) {
        apiError('Failed to send OTP email. Please try again.', 500);
    }
    
    // Return user ID for OTP verification
    apiSuccess('OTP sent to your email. Please verify to reset password.', [
        'user_id' => $user['id'],
        'email' => $user['email'],
        'message' => 'Check your email for the 6-digit OTP code. It will expire in 5 minutes.'
    ]);
    
} catch (Exception $e) {
    if (isset($conn)) $conn->close();
    logApiError('forgot_password', $e->getMessage(), ['email' => $email]);
    apiError('Password reset request failed. Please try again.', 500);
}

