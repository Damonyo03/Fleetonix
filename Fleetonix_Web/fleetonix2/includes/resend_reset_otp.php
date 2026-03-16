<?php
/**
 * Fleetonix - Resend Reset Password OTP
 * Resends OTP code for password reset
 */

session_start();
require_once __DIR__ . '/otp_helper.php';
require_once __DIR__ . '/email_helper.php';

// Check if user is in password reset flow
if (!isset($_SESSION['reset_user_id'])) {
    $_SESSION['error'] = 'Please request password reset first';
    header('Location: ../forgot_password.php');
    exit;
}

// Generate and send new OTP
$user_id = $_SESSION['reset_user_id'];
$user_email = $_SESSION['reset_user_email'];
$user_name = $_SESSION['reset_user_name'];

$otp_code = createOTP($user_id, $user_email);

if ($otp_code) {
    $email_sent = sendPasswordResetOTPEmail($user_email, $otp_code, $user_name);
    
    if ($email_sent) {
        $_SESSION['info'] = 'A new OTP code has been sent to your email.';
    } else {
        $_SESSION['error'] = 'Failed to send OTP email. Please try again.';
    }
} else {
    $_SESSION['error'] = 'Failed to generate OTP. Please try again.';
}

header('Location: ../forgot_password_otp.php');
exit;

