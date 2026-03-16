<?php
/**
 * Fleetonix - Forgot Password OTP Verification Handler
 * Verifies OTP and redirects to password reset page
 */

session_start();
require_once __DIR__ . '/otp_helper.php';

// Check if user is in password reset flow
if (!isset($_SESSION['reset_user_id'])) {
    $_SESSION['error'] = 'Please request password reset first';
    header('Location: ../forgot_password.php');
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: ../forgot_password_otp.php');
    exit;
}

// Get OTP code
$otp_code = isset($_POST['otp_code']) ? trim($_POST['otp_code']) : '';

// If OTP is in array format (from individual inputs), combine them
if (isset($_POST['otp']) && is_array($_POST['otp'])) {
    $otp_code = implode('', $_POST['otp']);
}

// Validate OTP
if (empty($otp_code) || strlen($otp_code) !== 6 || !ctype_digit($otp_code)) {
    $_SESSION['error'] = 'Please enter a valid 6-digit OTP code';
    header('Location: ../forgot_password_otp.php');
    exit;
}

// Verify OTP
$user_id = $_SESSION['reset_user_id'];
$otp_verified = verifyOTP($user_id, $otp_code);

if ($otp_verified) {
    // OTP verified successfully - redirect to password reset page
    // Keep session variables for password reset
    header('Location: ../reset_password.php');
    exit;
} else {
    $_SESSION['error'] = 'Invalid or expired OTP code. Please try again.';
    header('Location: ../forgot_password_otp.php');
    exit;
}

