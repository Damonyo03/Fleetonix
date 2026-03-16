<?php
/**
 * Fleettonix - Registration Handler
 * Processes registration form submissions
 */

session_start();
require_once __DIR__ . '/db_connect.php';

// Check if form was submitted
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Get form data
    $full_name = isset($_POST['full_name']) ? trim($_POST['full_name']) : '';
    $email = isset($_POST['email']) ? trim($_POST['email']) : '';
    $phone = isset($_POST['phone']) ? trim($_POST['phone']) : '';
    $password = isset($_POST['password']) ? $_POST['password'] : '';
    $confirm_password = isset($_POST['confirm_password']) ? $_POST['confirm_password'] : '';
    $company_name = isset($_POST['company_name']) ? trim($_POST['company_name']) : '';
    $user_type = 'client'; // All registrations are for clients
    
    // Validation
    if (empty($full_name) || empty($email) || empty($password) || empty($confirm_password) || empty($company_name)) {
        $_SESSION['error'] = 'Please fill in all required fields';
        header('Location: ../register.php');
        exit;
    }
    
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $_SESSION['error'] = 'Please enter a valid email address';
        header('Location: ../register.php');
        exit;
    }
    
    // Password requirements validation
    if (strlen($password) < 16) {
        $_SESSION['error'] = 'Password must be at least 16 characters long';
        header('Location: ../register.php');
        exit;
    }
    
    // Check for uppercase letter
    if (!preg_match('/[A-Z]/', $password)) {
        $_SESSION['error'] = 'Password must contain at least one uppercase letter (A-Z)';
        header('Location: ../register.php');
        exit;
    }
    
    // Check for lowercase letter
    if (!preg_match('/[a-z]/', $password)) {
        $_SESSION['error'] = 'Password must contain at least one lowercase letter (a-z)';
        header('Location: ../register.php');
        exit;
    }
    
    // Check for number
    if (!preg_match('/[0-9]/', $password)) {
        $_SESSION['error'] = 'Password must contain at least one number (0-9)';
        header('Location: ../register.php');
        exit;
    }
    
    // Check for special character
    if (!preg_match('/[!@#$%^&*(),.?":{}|<>]/', $password)) {
        $_SESSION['error'] = 'Password must contain at least one special character (!@#$%^&*)';
        header('Location: ../register.php');
        exit;
    }
    
    if ($password !== $confirm_password) {
        $_SESSION['error'] = 'Passwords do not match';
        header('Location: ../register.php');
        exit;
    }
    
    // Check if email already exists
    $conn = getConnection();
    $stmt = $conn->prepare("SELECT id FROM users WHERE email = ?");
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $result = $stmt->get_result();
    
    if ($result->num_rows > 0) {
        $_SESSION['error'] = 'Email already registered. Please use a different email or login.';
        $stmt->close();
        $conn->close();
        header('Location: ../register.php');
        exit;
    }
    $stmt->close();
    
    // Hash password
    $hashed_password = password_hash($password, PASSWORD_DEFAULT);
    
    // Insert user into database
    $stmt = $conn->prepare("INSERT INTO users (email, password, full_name, phone, user_type, status) VALUES (?, ?, ?, ?, ?, 'active')");
    $stmt->bind_param("sssss", $email, $hashed_password, $full_name, $phone, $user_type);
    
    if ($stmt->execute()) {
        $user_id = $conn->insert_id;
        
        // Create client record
        $stmt2 = $conn->prepare("INSERT INTO clients (user_id, company_name) VALUES (?, ?)");
        $stmt2->bind_param("is", $user_id, $company_name);
        $stmt2->execute();
        $stmt2->close();
        
        $_SESSION['success'] = 'Account created successfully! You can now login.';
        $stmt->close();
        $conn->close();
        header('Location: ../login.php');
        exit;
    } else {
        $_SESSION['error'] = 'Registration failed. Please try again.';
        $stmt->close();
        $conn->close();
        header('Location: ../register.php');
        exit;
    }
} else {
    // If not POST request, redirect to register
    header('Location: ../register.php');
    exit;
}
?>

