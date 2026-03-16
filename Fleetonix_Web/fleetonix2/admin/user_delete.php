<?php
/**
 * Fleettonix - Delete User
 */

session_start();
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db_connect.php';

// Require admin access
requireUserType('admin');

$user_id = isset($_GET['id']) ? (int)$_GET['id'] : 0;

if (!$user_id) {
    $_SESSION['error'] = 'Invalid user ID';
    header('Location: users.php');
    exit;
}

// Prevent deleting own account
if ($user_id == $_SESSION['user_id']) {
    $_SESSION['error'] = 'You cannot delete your own account';
    header('Location: users.php');
    exit;
}

$conn = getConnection();

// Get user info before deletion
$stmt = $conn->prepare("SELECT full_name FROM users WHERE id = ?");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$result = $stmt->get_result();
$user = $result->fetch_assoc();
$stmt->close();

if (!$user) {
    $_SESSION['error'] = 'User not found';
    $conn->close();
    header('Location: users.php');
    exit;
}

// Delete user (cascade will handle related records)
$stmt = $conn->prepare("DELETE FROM users WHERE id = ?");
$stmt->bind_param("i", $user_id);

if ($stmt->execute()) {
    $_SESSION['success'] = 'User "' . htmlspecialchars($user['full_name']) . '" deleted successfully!';
    $stmt->close();
    $conn->close();
    header('Location: users.php');
    exit;
} else {
    $_SESSION['error'] = 'Failed to delete user. Please try again.';
    $stmt->close();
    $conn->close();
    header('Location: users.php');
    exit;
}
?>

