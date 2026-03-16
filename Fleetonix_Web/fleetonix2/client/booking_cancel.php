<?php
/**
 * Fleettonix - Cancel Booking
 */

session_start();
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db_connect.php';

// Require client access
requireUserType('client');

$currentUser = getCurrentUser();
$booking_id = isset($_GET['id']) ? (int)$_GET['id'] : 0;

if (!$booking_id) {
    $_SESSION['error'] = 'Invalid booking ID';
    header('Location: bookings.php');
    exit;
}

$conn = getConnection();

// Get client ID
$stmt = $conn->prepare("SELECT id FROM clients WHERE user_id = ?");
$stmt->bind_param("i", $currentUser['id']);
$stmt->execute();
$result = $stmt->get_result();
$client = $result->fetch_assoc();
$stmt->close();

if (!$client) {
    $_SESSION['error'] = 'Client profile not found';
    $conn->close();
    header('Location: ../includes/logout.php');
    exit;
}

// Get booking info
$stmt = $conn->prepare("
    SELECT b.*
    FROM bookings b
    WHERE b.id = ? AND b.client_id = ?
");
$stmt->bind_param("ii", $booking_id, $client['id']);
$stmt->execute();
$result = $stmt->get_result();
$booking = $result->fetch_assoc();
$stmt->close();

if (!$booking) {
    $_SESSION['error'] = 'Booking not found';
    $conn->close();
    header('Location: bookings.php');
    exit;
}

if ($booking['status'] !== 'pending') {
    $_SESSION['error'] = 'Only pending bookings can be cancelled';
    $conn->close();
    header('Location: booking_view.php?id=' . $booking_id);
    exit;
}

// Cancel booking
$stmt = $conn->prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?");
$stmt->bind_param("i", $booking_id);
$stmt->execute();
$stmt->close();

$conn->close();

$_SESSION['success'] = 'Booking cancelled successfully';
header('Location: bookings.php');
exit;

