<?php
/**
 * Fleetonix - Forgot Password Handler
 * Sends OTP to user's email for password reset
 */

session_start();
require_once __DIR__ . '/otp_helper.php';
require_once __DIR__ . '/email_helper.php';
require_once __DIR__ . '/db_connect.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: ../forgot_password.php');
    exit;
}

$email = isset($_POST['email']) ? trim($_POST['email']) : '';

// Validation
if (empty($email)) {
    $_SESSION['error'] = 'Please enter your email address';
    header('Location: ../forgot_password.php');
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $_SESSION['error'] = 'Please enter a valid email address';
    header('Location: ../forgot_password.php');
    exit;
}

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
    $_SESSION['info'] = 'If an account with that email exists, an OTP code has been sent.';
    header('Location: ../forgot_password_otp.php');
    exit;
}

$user = $result->fetch_assoc();
$stmt->close();
$conn->close();

// Generate and send OTP
$otp_code = createOTP($user['id'], $user['email']);

if ($otp_code) {
    // Send OTP email
    $email_sent = sendPasswordResetOTPEmail($user['email'], $otp_code, $user['full_name']);
    
    if ($email_sent) {
        // Store user info in session for OTP verification
        $_SESSION['reset_user_id'] = $user['id'];
        $_SESSION['reset_user_email'] = $user['email'];
        $_SESSION['reset_user_name'] = $user['full_name'];
        
        $_SESSION['info'] = 'OTP code has been sent to your email. Please check your inbox.';
        header('Location: ../forgot_password_otp.php');
        exit;
    } else {
        $_SESSION['error'] = 'Failed to send OTP email. Please try again.';
        header('Location: ../forgot_password.php');
        exit;
    }
} else {
    $_SESSION['error'] = 'Failed to generate OTP. Please try again.';
    header('Location: ../forgot_password.php');
    exit;
}

