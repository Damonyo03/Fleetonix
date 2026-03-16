<?php
/**
 * Fleettonix - Edit User Handler
 */

session_start();
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db_connect.php';

// Require admin access
requireUserType('admin');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $user_id = isset($_POST['user_id']) ? (int)$_POST['user_id'] : 0;
    $full_name = isset($_POST['full_name']) ? trim($_POST['full_name']) : '';
    $email = isset($_POST['email']) ? trim($_POST['email']) : '';
    $phone = isset($_POST['phone']) ? trim($_POST['phone']) : '';
    $status = isset($_POST['status']) ? trim($_POST['status']) : '';
    $password = isset($_POST['password']) ? trim($_POST['password']) : '';
    $user_type = isset($_POST['user_type']) ? trim($_POST['user_type']) : '';
    
    // Additional fields
    $company_name = isset($_POST['company_name']) ? trim($_POST['company_name']) : '';
    $license_number = isset($_POST['license_number']) ? trim($_POST['license_number']) : '';
    $license_expiry = isset($_POST['license_expiry']) ? trim($_POST['license_expiry']) : '';
    $vehicle_assigned = isset($_POST['vehicle_assigned']) ? trim($_POST['vehicle_assigned']) : '';
    $plate_number = isset($_POST['plate_number']) ? trim($_POST['plate_number']) : '';
    $current_status = isset($_POST['current_status']) ? trim($_POST['current_status']) : '';
    
    // Validation
    if (empty($full_name) || empty($email)) {
        $_SESSION['error'] = 'Please fill in all required fields';
        header('Location: user_edit.php?id=' . $user_id);
        exit;
    }
    
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $_SESSION['error'] = 'Please enter a valid email address';
        header('Location: user_edit.php?id=' . $user_id);
        exit;
    }
    
    // Password validation (if provided)
    if (!empty($password)) {
        if (strlen($password) < 16) {
            $_SESSION['error'] = 'Password must be at least 16 characters long';
            header('Location: user_edit.php?id=' . $user_id);
            exit;
        }
        
        if (!preg_match('/[A-Z]/', $password) || !preg_match('/[a-z]/', $password) || 
            !preg_match('/[0-9]/', $password) || !preg_match('/[!@#$%^&*(),.?":{}|<>]/', $password)) {
            $_SESSION['error'] = 'Password must contain uppercase, lowercase, number, and special character';
            header('Location: user_edit.php?id=' . $user_id);
            exit;
        }
    }
    
    $conn = getConnection();
    
    // Check if email is already taken by another user
    $stmt = $conn->prepare("SELECT id FROM users WHERE email = ? AND id != ?");
    $stmt->bind_param("si", $email, $user_id);
    $stmt->execute();
    $result = $stmt->get_result();
    
    if ($result->num_rows > 0) {
        $_SESSION['error'] = 'Email already taken by another user';
        $stmt->close();
        $conn->close();
        header('Location: user_edit.php?id=' . $user_id);
        exit;
    }
    $stmt->close();
    
    // Update user
    if (!empty($password)) {
        $hashed_password = password_hash($password, PASSWORD_DEFAULT);
        $stmt = $conn->prepare("UPDATE users SET full_name = ?, email = ?, phone = ?, status = ?, password = ? WHERE id = ?");
        $stmt->bind_param("sssssi", $full_name, $email, $phone, $status, $hashed_password, $user_id);
    } else {
        $stmt = $conn->prepare("UPDATE users SET full_name = ?, email = ?, phone = ?, status = ? WHERE id = ?");
        $stmt->bind_param("ssssi", $full_name, $email, $phone, $status, $user_id);
    }
    
    if ($stmt->execute()) {
        // Update additional info
        if ($user_type === 'client' && !empty($company_name)) {
            $stmt2 = $conn->prepare("UPDATE clients SET company_name = ? WHERE user_id = ?");
            $stmt2->bind_param("si", $company_name, $user_id);
            $stmt2->execute();
            $stmt2->close();
        } elseif ($user_type === 'driver') {
            $license_expiry = !empty($license_expiry) ? $license_expiry : null;
            $stmt2 = $conn->prepare("UPDATE drivers SET license_number = ?, license_expiry = ?, vehicle_assigned = ?, plate_number = ?, current_status = ? WHERE user_id = ?");
            $stmt2->bind_param("sssssi", $license_number, $license_expiry, $vehicle_assigned, $plate_number, $current_status, $user_id);
            $stmt2->execute();
            $stmt2->close();
        }
        
        $_SESSION['success'] = 'User updated successfully!';
        $stmt->close();
        $conn->close();
        header('Location: user_view.php?id=' . $user_id);
        exit;
    } else {
        $_SESSION['error'] = 'Failed to update user. Please try again.';
        $stmt->close();
        $conn->close();
        header('Location: user_edit.php?id=' . $user_id);
        exit;
    }
} else {
    header('Location: users.php');
    exit;
}
?>

