<?php
/**
 * Fleettonix - Authentication Helper Functions
 */

require_once __DIR__ . '/db_connect.php';

/**
 * Authenticate user with email and password
 * @param string $email User email
 * @param string $password User password
 * @return array|false User data on success, false on failure
 */
function authenticateUser($email, $password) {
    $conn = getConnection();
    
    // Prepare statement to prevent SQL injection
    $stmt = $conn->prepare("SELECT id, email, password, full_name, user_type, status FROM users WHERE email = ? AND status = 'active'");
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $result = $stmt->get_result();
    
    if ($result->num_rows === 1) {
        $user = $result->fetch_assoc();
        
        // Verify password
        if (password_verify($password, $user['password'])) {
            // Remove password from user array before returning
            unset($user['password']);
            $stmt->close();
            $conn->close();
            return $user;
        }
    }
    
    $stmt->close();
    $conn->close();
    return false;
}

/**
 * Check if user is logged in
 * @return bool True if logged in, false otherwise
 */
function isLoggedIn() {
    return isset($_SESSION['user_id']) && isset($_SESSION['user_type']);
}

/**
 * Require login - redirect to login if not logged in
 */
function requireLogin() {
    if (!isLoggedIn()) {
        $_SESSION['error'] = 'Please login to access this page';
        header('Location: ../login.php');
        exit;
    }
}

/**
 * Require specific user type
 * @param string|array $allowedTypes User type(s) allowed
 */
function requireUserType($allowedTypes) {
    requireLogin();
    
    if (!is_array($allowedTypes)) {
        $allowedTypes = [$allowedTypes];
    }
    
    if (!in_array($_SESSION['user_type'], $allowedTypes)) {
        $_SESSION['error'] = 'You do not have permission to access this page';
        header('Location: ../login.php');
        exit;
    }
}

/**
 * Get current user data
 * @return array|false User data or false if not logged in
 */
function getCurrentUser() {
    if (!isLoggedIn()) {
        return false;
    }
    
    $conn = getConnection();
    $user_id = $_SESSION['user_id'];
    
    $stmt = $conn->prepare("SELECT id, email, full_name, user_type, phone, status FROM users WHERE id = ?");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $result = $stmt->get_result();
    
    if ($result->num_rows === 1) {
        $user = $result->fetch_assoc();
        $stmt->close();
        $conn->close();
        return $user;
    }
    
    $stmt->close();
    $conn->close();
    return false;
}

/**
 * Logout user
 */
function logout() {
    session_start();
    session_unset();
    session_destroy();
    header('Location: ../login.php');
    exit;
}
?>

