<?php
/**
 * Fleettonix - OTP Verification Handler
 * Verifies OTP and completes login
 */

session_start();
require_once __DIR__ . '/otp_helper.php';
require_once __DIR__ . '/auth.php';

// Check if user is in OTP verification flow
if (!isset($_SESSION['otp_user_id'])) {
    $_SESSION['error'] = 'Please login first';
    header('Location: ../login.php');
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: ../otp_verify.php');
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
    header('Location: ../otp_verify.php');
    exit;
}

// Verify OTP
$user_id = $_SESSION['otp_user_id'];
$otp_verified = verifyOTP($user_id, $otp_code);

if ($otp_verified) {
    // OTP verified successfully
    // Set session variables for logged-in user
    $_SESSION['user_id'] = $_SESSION['otp_user_id'];
    $_SESSION['user_type'] = $_SESSION['otp_user_type'];
    $_SESSION['user_name'] = $_SESSION['otp_user_name'];
    $_SESSION['user_email'] = $_SESSION['otp_user_email'];
    
    // Handle "Remember Me"
    if (isset($_SESSION['otp_remember']) && $_SESSION['otp_remember']) {
        setcookie('remember_token', base64_encode($_SESSION['user_id'] . ':' . $_SESSION['user_email']), time() + (30 * 24 * 60 * 60), '/');
    }
    
    // Clear OTP session variables
    unset($_SESSION['otp_user_id']);
    unset($_SESSION['otp_user_type']);
    unset($_SESSION['otp_user_name']);
    unset($_SESSION['otp_user_email']);
    unset($_SESSION['otp_remember']);
    
    // Redirect based on user type
    if ($_SESSION['user_type'] === 'admin') {
        header('Location: ../admin/dashboard.php');
    } elseif ($_SESSION['user_type'] === 'client') {
        header('Location: ../client/dashboard.php');
    } else {
        $_SESSION['error'] = 'Invalid user type';
        header('Location: ../login.php');
    }
    exit;
} else {
    $_SESSION['error'] = 'Invalid or expired OTP code. Please try again.';
    header('Location: ../otp_verify.php');
    exit;
}

