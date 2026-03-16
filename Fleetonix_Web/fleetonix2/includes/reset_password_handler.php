<?php
/**
 * Fleetonix - Reset Password Handler
 * Updates user password after OTP verification
 */

session_start();
require_once __DIR__ . '/db_connect.php';

// Check if user is in password reset flow
if (!isset($_SESSION['reset_user_id'])) {
    $_SESSION['error'] = 'Please verify OTP first';
    header('Location: ../forgot_password.php');
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: ../reset_password.php');
    exit;
}

$password = isset($_POST['password']) ? $_POST['password'] : '';
$confirm_password = isset($_POST['confirm_password']) ? $_POST['confirm_password'] : '';

// Validation
$errors = [];

if (empty($password)) {
    $errors[] = 'Password is required';
}

if (strlen($password) < 16) {
    $errors[] = 'Password must be at least 16 characters long';
}

if (!preg_match('/[A-Z]/', $password)) {
    $errors[] = 'Password must contain at least one uppercase letter';
}

if (!preg_match('/[a-z]/', $password)) {
    $errors[] = 'Password must contain at least one lowercase letter';
}

if (!preg_match('/[0-9]/', $password)) {
    $errors[] = 'Password must contain at least one number';
}

if (!preg_match('/[^A-Za-z0-9]/', $password)) {
    $errors[] = 'Password must contain at least one special character';
}

if ($password !== $confirm_password) {
    $errors[] = 'Passwords do not match';
}

if (!empty($errors)) {
    $_SESSION['error'] = implode('<br>', $errors);
    header('Location: ../reset_password.php');
    exit;
}

// Update password
try {
    $conn = getConnection();
    $user_id = $_SESSION['reset_user_id'];
    
    // Hash the new password
    $hashed_password = password_hash($password, PASSWORD_BCRYPT);
    
    // Update user password
    $stmt = $conn->prepare("UPDATE users SET password = ? WHERE id = ?");
    $stmt->bind_param("si", $hashed_password, $user_id);
    $stmt->execute();
    $stmt->close();
    $conn->close();
    
    // Clear reset session variables
    unset($_SESSION['reset_user_id']);
    unset($_SESSION['reset_user_email']);
    unset($_SESSION['reset_user_name']);
    
    $_SESSION['success'] = 'Password has been reset successfully! You can now login with your new password.';
    header('Location: ../login.php');
    exit;
    
} catch (Exception $e) {
    if (isset($conn)) $conn->close();
    $_SESSION['error'] = 'Failed to reset password. Please try again.';
    header('Location: ../reset_password.php');
    exit;
}

