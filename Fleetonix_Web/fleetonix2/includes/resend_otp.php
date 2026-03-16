<?php
/**
 * Fleettonix - Resend OTP
 * Resends OTP code to user's email
 */

session_start();
require_once __DIR__ . '/otp_helper.php';
require_once __DIR__ . '/email_helper.php';

// Check if user is in OTP verification flow
if (!isset($_SESSION['otp_user_id'])) {
    $_SESSION['error'] = 'Please login first';
    header('Location: ../login.php');
    exit;
}

// Generate and send new OTP
$user_id = $_SESSION['otp_user_id'];
$user_email = $_SESSION['otp_user_email'];
$user_name = $_SESSION['otp_user_name'];

$otp_code = createOTP($user_id, $user_email);

if ($otp_code) {
    $email_sent = sendOTPEmail($user_email, $otp_code, $user_name);
    
    if ($email_sent) {
        $_SESSION['info'] = 'A new OTP code has been sent to your email.';
    } else {
        $_SESSION['error'] = 'Failed to send OTP email. Please try again.';
    }
} else {
    $_SESSION['error'] = 'Failed to generate OTP. Please try again.';
}

header('Location: ../otp_verify.php');
exit;

