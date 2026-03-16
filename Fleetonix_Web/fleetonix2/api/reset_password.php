<?php
/**
 * Fleetonix Reset Password API
 * Updates user password after OTP verification
 */

require_once __DIR__ . '/../includes/api_helper.php';
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
$password = isset($payload['password']) ? $payload['password'] : '';
$confirm_password = isset($payload['confirm_password']) ? $payload['confirm_password'] : '';

// Validate required fields
if (empty($user_id) || empty($password) || empty($confirm_password)) {
    apiError('User ID, password, and confirm password are required', 422);
}

// Validate password
$errors = [];

if (strlen($password) < 16) {
    $errors['password'] = 'Password must be at least 16 characters long';
}

if (!preg_match('/[A-Z]/', $password)) {
    $errors['password'] = 'Password must contain at least one uppercase letter';
}

if (!preg_match('/[a-z]/', $password)) {
    $errors['password'] = 'Password must contain at least one lowercase letter';
}

if (!preg_match('/[0-9]/', $password)) {
    $errors['password'] = 'Password must contain at least one number';
}

if (!preg_match('/[^A-Za-z0-9]/', $password)) {
    $errors['password'] = 'Password must contain at least one special character';
}

if ($password !== $confirm_password) {
    $errors['confirm_password'] = 'Passwords do not match';
}

if (!empty($errors)) {
    apiError('Password validation failed', 422, $errors);
}

try {
    $conn = getConnection();
    
    // Verify user exists and is active
    $stmt = $conn->prepare("SELECT id FROM users WHERE id = ? AND status = 'active'");
    $stmt->bind_param('i', $user_id);
    $stmt->execute();
    $result = $stmt->get_result();
    
    if ($result->num_rows !== 1) {
        $stmt->close();
        $conn->close();
        apiError('User not found or inactive', 404);
    }
    $stmt->close();
    
    // Hash the new password
    $hashed_password = password_hash($password, PASSWORD_BCRYPT);
    
    // Update user password
    $stmt = $conn->prepare("UPDATE users SET password = ? WHERE id = ?");
    $stmt->bind_param("si", $hashed_password, $user_id);
    $stmt->execute();
    $stmt->close();
    $conn->close();
    
    apiSuccess('Password has been reset successfully! You can now login with your new password.');
    
} catch (Exception $e) {
    if (isset($conn)) $conn->close();
    logApiError('reset_password', $e->getMessage(), ['user_id' => $user_id]);
    apiError('Failed to reset password. Please try again.', 500);
}

