<?php
/**
 * Fleetonix Driver Login API
 * Authenticates driver and returns session token
 */

require_once __DIR__ . '/../includes/api_helper.php';
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

$email = isset($payload['email']) ? trim($payload['email']) : '';
$password = isset($payload['password']) ? $payload['password'] : '';

// Validate required fields
$validationErrors = validateRequired($payload, ['email', 'password']);
if ($validationErrors) {
    apiError('Validation failed', 422, $validationErrors);
}

// Validate email format
if (!validateEmailFormat($email)) {
    apiError('Please provide a valid email address', 422, ['email' => 'Invalid email format']);
}

if (empty($password)) {
    apiError('Password is required', 422, ['password' => 'Password cannot be empty']);
}

try {
    // Authenticate user
    $user = authenticateUser($email, $password);
    if (!$user || $user['user_type'] !== 'driver') {
        apiError('Invalid credentials or not authorized as driver', 401);
    }

    // Require OTP helpers
    require_once __DIR__ . '/../includes/otp_helper.php';
    require_once __DIR__ . '/../includes/email_helper.php';
    
    // Generate and send OTP
    $otp_code = createOTP($user['id'], $user['email']);
    
    if (!$otp_code) {
        apiError('Failed to generate OTP. Please try again.', 500);
    }
    
    // Send OTP email
    $email_sent = sendOTPEmail($user['email'], $otp_code, $user['full_name']);
    
    if (!$email_sent) {
        apiError('Failed to send OTP email. Please try again.', 500);
    }
    
    // Return user ID for OTP verification (don't create session yet)
    apiSuccess('OTP sent to your email. Please verify to complete login.', [
        'user_id' => $user['id'],
        'email' => $user['email'],
        'message' => 'Check your email for the 6-digit OTP code. It will expire in 5 minutes.'
    ]);
    
} catch (Exception $e) {
    if (isset($conn)) $conn->close();
    logApiError('driver_login', $e->getMessage(), ['email' => $email]);
    apiError('Login failed. Please try again.', 500);
}
