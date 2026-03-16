<?php
/**
 * Fleettonix - Add User Handler
 */

session_start();
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db_connect.php';

// Require admin access
requireUserType('admin');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Get form data
    $full_name = isset($_POST['full_name']) ? trim($_POST['full_name']) : '';
    $email = isset($_POST['email']) ? trim($_POST['email']) : '';
    $phone = isset($_POST['phone']) ? trim($_POST['phone']) : '';
    $password = isset($_POST['password']) ? $_POST['password'] : '';
    $user_type = isset($_POST['user_type']) ? trim($_POST['user_type']) : '';
    $company_name = isset($_POST['company_name']) ? trim($_POST['company_name']) : '';
    $license_number = isset($_POST['license_number']) ? trim($_POST['license_number']) : '';
    $license_expiry = isset($_POST['license_expiry']) ? trim($_POST['license_expiry']) : '';
    $vehicle_assigned = isset($_POST['vehicle_assigned']) ? trim($_POST['vehicle_assigned']) : '';
    $plate_number = isset($_POST['plate_number']) ? trim($_POST['plate_number']) : '';
    
    // Validation
    if (empty($full_name) || empty($email) || empty($password)) {
        $_SESSION['error'] = 'Please fill in all required fields';
        header('Location: user_add.php?type=' . $user_type);
        exit;
    }
    
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $_SESSION['error'] = 'Please enter a valid email address';
        header('Location: user_add.php?type=' . $user_type);
        exit;
    }
    
    // Password validation
    if (strlen($password) < 16) {
        $_SESSION['error'] = 'Password must be at least 16 characters long';
        header('Location: user_add.php?type=' . $user_type);
        exit;
    }
    
    if (!preg_match('/[A-Z]/', $password)) {
        $_SESSION['error'] = 'Password must contain at least one uppercase letter';
        header('Location: user_add.php?type=' . $user_type);
        exit;
    }
    
    if (!preg_match('/[a-z]/', $password)) {
        $_SESSION['error'] = 'Password must contain at least one lowercase letter';
        header('Location: user_add.php?type=' . $user_type);
        exit;
    }
    
    if (!preg_match('/[0-9]/', $password)) {
        $_SESSION['error'] = 'Password must contain at least one number';
        header('Location: user_add.php?type=' . $user_type);
        exit;
    }
    
    if (!preg_match('/[!@#$%^&*(),.?":{}|<>]/', $password)) {
        $_SESSION['error'] = 'Password must contain at least one special character';
        header('Location: user_add.php?type=' . $user_type);
        exit;
    }
    
    if ($user_type === 'client' && empty($company_name)) {
        $_SESSION['error'] = 'Company name is required for clients';
        header('Location: user_add.php?type=' . $user_type);
        exit;
    }
    
    // Check if email already exists
    $conn = getConnection();
    $stmt = $conn->prepare("SELECT id FROM users WHERE email = ?");
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $result = $stmt->get_result();
    
    if ($result->num_rows > 0) {
        $_SESSION['error'] = 'Email already registered';
        $stmt->close();
        $conn->close();
        header('Location: user_add.php?type=' . $user_type);
        exit;
    }
    $stmt->close();
    
    // Hash password
    $hashed_password = password_hash($password, PASSWORD_DEFAULT);
    
    // Insert user
    $stmt = $conn->prepare("INSERT INTO users (email, password, full_name, phone, user_type, status) VALUES (?, ?, ?, ?, ?, 'active')");
    $stmt->bind_param("sssss", $email, $hashed_password, $full_name, $phone, $user_type);
    
    if ($stmt->execute()) {
        $user_id = $conn->insert_id;
        
        // Create related records
        if ($user_type === 'driver') {
            $stmt2 = $conn->prepare("INSERT INTO drivers (user_id, license_number, license_expiry, vehicle_assigned, plate_number, current_status) VALUES (?, ?, ?, ?, ?, 'offline')");
            $license_expiry = !empty($license_expiry) ? $license_expiry : null;
            $stmt2->bind_param("issss", $user_id, $license_number, $license_expiry, $vehicle_assigned, $plate_number);
            $stmt2->execute();
            $stmt2->close();
        } elseif ($user_type === 'client') {
            $stmt2 = $conn->prepare("INSERT INTO clients (user_id, company_name) VALUES (?, ?)");
            $stmt2->bind_param("is", $user_id, $company_name);
            $stmt2->execute();
            $stmt2->close();
        }
        
        $_SESSION['success'] = ucfirst($user_type) . ' account created successfully!';
        $stmt->close();
        $conn->close();
        header('Location: users.php');
        exit;
    } else {
        $_SESSION['error'] = 'Failed to create user. Please try again.';
        $stmt->close();
        $conn->close();
        header('Location: user_add.php?type=' . $user_type);
        exit;
    }
} else {
    header('Location: users.php');
    exit;
}
?>

