<?php
/**
 * Fleettonix - Login Handler
 * Processes login form submissions
 */

session_start();
require_once __DIR__ . '/auth.php';

// Check if form was submitted
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Get form data
    $email = isset($_POST['email']) ? trim($_POST['email']) : '';
    $password = isset($_POST['password']) ? $_POST['password'] : '';
    $remember = isset($_POST['remember']) ? true : false;
    
    // Basic validation
    if (empty($email) || empty($password)) {
        $_SESSION['error'] = 'Please fill in all fields';
        header('Location: ../login.php');
        exit;
    }
    
    // Validate email format
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $_SESSION['error'] = 'Please enter a valid email address';
        header('Location: ../login.php');
        exit;
    }
    
    // Authenticate user
    $user = authenticateUser($email, $password);
    
    if ($user) {
        // Require OTP helpers
        require_once __DIR__ . '/otp_helper.php';
        require_once __DIR__ . '/email_helper.php';
        
        // Generate and send OTP
        $otp_code = createOTP($user['id'], $user['email']);
        
        if ($otp_code) {
            // Send OTP email
            $email_sent = sendOTPEmail($user['email'], $otp_code, $user['full_name']);
            
            if ($email_sent) {
                // Store user info in session for OTP verification
                $_SESSION['otp_user_id'] = $user['id'];
                $_SESSION['otp_user_type'] = $user['user_type'];
                $_SESSION['otp_user_name'] = $user['full_name'];
                $_SESSION['otp_user_email'] = $user['email'];
                $_SESSION['otp_remember'] = $remember;
                
                // Redirect to OTP verification page
                header('Location: ../otp_verify.php');
                exit;
            } else {
                $_SESSION['error'] = 'Failed to send OTP email. Please try again.';
                header('Location: ../login.php');
                exit;
            }
        } else {
            $_SESSION['error'] = 'Failed to generate OTP. Please try again.';
            header('Location: ../login.php');
            exit;
        }
    } else {
        $_SESSION['error'] = 'Invalid email or password';
        header('Location: ../login.php');
        exit;
    }
} else {
    // If not POST request, redirect to login
    header('Location: ../login.php');
    exit;
}
?>

