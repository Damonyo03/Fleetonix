<?php
/**
 * Fleettonix - Client Profile Update Handler
 */

session_start();
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db_connect.php';

// Require client access
requireUserType('client');

$currentUser = getCurrentUser();
$user_id = $currentUser['id'];

// Verify user is editing their own profile
$requested_user_id = isset($_POST['user_id']) ? (int)$_POST['user_id'] : 0;
if ($requested_user_id !== $user_id) {
    $_SESSION['error'] = 'Unauthorized access';
    header('Location: profile.php');
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: profile.php');
    exit;
}

$full_name = isset($_POST['full_name']) ? trim($_POST['full_name']) : '';
$email = isset($_POST['email']) ? trim($_POST['email']) : '';
$phone = isset($_POST['phone']) ? trim($_POST['phone']) : '';
$company_name = isset($_POST['company_name']) ? trim($_POST['company_name']) : '';
$contact_person = isset($_POST['contact_person']) ? trim($_POST['contact_person']) : '';
$address = isset($_POST['address']) ? trim($_POST['address']) : '';
$current_password = isset($_POST['current_password']) ? $_POST['current_password'] : '';
$new_password = isset($_POST['new_password']) ? $_POST['new_password'] : '';
$confirm_password = isset($_POST['confirm_password']) ? $_POST['confirm_password'] : '';

// Validation
$errors = [];

if (empty($full_name)) {
    $errors[] = 'Full name is required';
}

if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors[] = 'Valid email is required';
}

if (empty($company_name)) {
    $errors[] = 'Company name is required';
}

// Check if email is already taken by another user
$conn = getConnection();
$stmt = $conn->prepare("SELECT id FROM users WHERE email = ? AND id != ?");
$stmt->bind_param("si", $email, $user_id);
$stmt->execute();
$result = $stmt->get_result();
if ($result->num_rows > 0) {
    $errors[] = 'Email is already taken by another user';
}
$stmt->close();

// Password change validation
if (!empty($new_password) || !empty($current_password)) {
    if (empty($current_password)) {
        $errors[] = 'Current password is required to change password';
    } else {
        // Verify current password
        $stmt = $conn->prepare("SELECT password FROM users WHERE id = ?");
        $stmt->bind_param("i", $user_id);
        $stmt->execute();
        $result = $stmt->get_result();
        $user = $result->fetch_assoc();
        $stmt->close();
        
        if (!password_verify($current_password, $user['password'])) {
            $errors[] = 'Current password is incorrect';
        }
    }
    
    if (!empty($new_password)) {
        if (strlen($new_password) < 16) {
            $errors[] = 'New password must be at least 16 characters long';
        }
        
        if (!preg_match('/[A-Z]/', $new_password)) {
            $errors[] = 'New password must contain at least one uppercase letter';
        }
        
        if (!preg_match('/[a-z]/', $new_password)) {
            $errors[] = 'New password must contain at least one lowercase letter';
        }
        
        if (!preg_match('/[0-9]/', $new_password)) {
            $errors[] = 'New password must contain at least one number';
        }
        
        if (!preg_match('/[^A-Za-z0-9]/', $new_password)) {
            $errors[] = 'New password must contain at least one special character';
        }
        
        if ($new_password !== $confirm_password) {
            $errors[] = 'New password and confirm password do not match';
        }
    }
}

if (!empty($errors)) {
    $_SESSION['error'] = implode('<br>', $errors);
    header('Location: profile.php');
    exit;
}

// Update user information
try {
    $conn->begin_transaction();
    
    // Update user info
    $stmt = $conn->prepare("UPDATE users SET full_name = ?, email = ?, phone = ? WHERE id = ?");
    $stmt->bind_param("sssi", $full_name, $email, $phone, $user_id);
    $stmt->execute();
    $stmt->close();
    
    // Update client info
    $stmt = $conn->prepare("UPDATE clients SET company_name = ?, contact_person = ?, address = ? WHERE user_id = ?");
    $stmt->bind_param("sssi", $company_name, $contact_person, $address, $user_id);
    $stmt->execute();
    $stmt->close();
    
    // Update password if provided
    if (!empty($new_password)) {
        $hashed_password = password_hash($new_password, PASSWORD_BCRYPT);
        $stmt = $conn->prepare("UPDATE users SET password = ? WHERE id = ?");
        $stmt->bind_param("si", $hashed_password, $user_id);
        $stmt->execute();
        $stmt->close();
    }
    
    $conn->commit();
    
    // Update session
    $_SESSION['user_name'] = $full_name;
    $_SESSION['user_email'] = $email;
    
    $_SESSION['success'] = 'Profile updated successfully!';
    header('Location: profile.php');
    exit;
    
} catch (Exception $e) {
    $conn->rollback();
    $_SESSION['error'] = 'Failed to update profile: ' . $e->getMessage();
    header('Location: profile.php');
    exit;
} finally {
    $conn->close();
}

