<?php
/**
 * Fleettonix - Booking Status Updates (Admin)
 */

session_start();
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db_connect.php';

requireUserType('admin');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: bookings.php');
    exit;
}

$booking_id = isset($_POST['booking_id']) ? (int)$_POST['booking_id'] : 0;
$action = isset($_POST['action']) ? trim($_POST['action']) : '';

if (!$booking_id || !$action) {
    $_SESSION['error'] = 'Invalid booking request.';
    header('Location: bookings.php');
    exit;
}

$conn = getConnection();

function executeStatement($stmt) {
    if (!$stmt->execute()) {
        throw new Exception($stmt->error);
    }
}

// Get booking, schedule, and driver info
$stmt = $conn->prepare("
    SELECT 
        b.*, 
        s.id AS schedule_id, 
        s.driver_id, 
        s.status AS schedule_status
    FROM bookings b
    LEFT JOIN schedules s ON s.booking_id = b.id
    WHERE b.id = ?
");
$stmt->bind_param("i", $booking_id);
$stmt->execute();
$result = $stmt->get_result();
$booking = $result->fetch_assoc();
$stmt->close();

if (!$booking) {
    $_SESSION['error'] = 'Booking not found.';
    $conn->close();
    header('Location: bookings.php');
    exit;
}

$schedule_id = $booking['schedule_id'];
$driver_id = $booking['driver_id'];

$success_message = '';
$error_message = '';

switch ($action) {
    case 'start':
        if ($booking['status'] !== 'assigned' || !$schedule_id || !$driver_id) {
            $error_message = 'Booking cannot be started.';
            break;
        }

        $conn->begin_transaction();
        try {
            $stmt = $conn->prepare("UPDATE schedules SET status = 'in_progress', started_at = NOW() WHERE id = ?");
            $stmt->bind_param("i", $schedule_id);
            executeStatement($stmt);
            $stmt->close();

            $stmt = $conn->prepare("UPDATE bookings SET status = 'in_progress' WHERE id = ?");
            $stmt->bind_param("i", $booking_id);
            executeStatement($stmt);
            $stmt->close();

            $stmt = $conn->prepare("UPDATE drivers SET current_status = 'in_progress' WHERE id = ?");
            $stmt->bind_param("i", $driver_id);
            executeStatement($stmt);
            $stmt->close();

            $conn->commit();
            $success_message = 'Trip started. Booking is now in progress.';
        } catch (Exception $e) {
            $conn->rollback();
            $error_message = 'Failed to start trip. Please try again.';
        }
        break;

    case 'complete':
        if ($booking['status'] !== 'in_progress' || !$schedule_id || !$driver_id) {
            $error_message = 'Booking cannot be completed.';
            break;
        }

        $conn->begin_transaction();
        try {
            $stmt = $conn->prepare("UPDATE schedules SET status = 'completed', completed_at = NOW() WHERE id = ?");
            $stmt->bind_param("i", $schedule_id);
            executeStatement($stmt);
            $stmt->close();

            $stmt = $conn->prepare("UPDATE bookings SET status = 'completed' WHERE id = ?");
            $stmt->bind_param("i", $booking_id);
            executeStatement($stmt);
            $stmt->close();

            $stmt = $conn->prepare("UPDATE drivers SET current_status = 'available' WHERE id = ?");
            $stmt->bind_param("i", $driver_id);
            executeStatement($stmt);
            $stmt->close();

            $conn->commit();
            $success_message = 'Booking marked as completed.';
        } catch (Exception $e) {
            $conn->rollback();
            $error_message = 'Failed to complete booking. Please try again.';
        }
        break;

    case 'cancel':
        $cancellable_statuses = ['pending', 'approved', 'assigned', 'in_progress'];
        if (!in_array($booking['status'], $cancellable_statuses)) {
            $error_message = 'Booking cannot be cancelled.';
            break;
        }

        $conn->begin_transaction();
        try {
            $stmt = $conn->prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?");
            $stmt->bind_param("i", $booking_id);
            executeStatement($stmt);
            $stmt->close();

            if ($schedule_id) {
                $stmt = $conn->prepare("UPDATE schedules SET status = 'cancelled', completed_at = NOW() WHERE id = ?");
                $stmt->bind_param("i", $schedule_id);
                executeStatement($stmt);
                $stmt->close();
            }

            if ($driver_id) {
                $stmt = $conn->prepare("UPDATE drivers SET current_status = 'available' WHERE id = ?");
                $stmt->bind_param("i", $driver_id);
                executeStatement($stmt);
                $stmt->close();
            }

            $conn->commit();
            $success_message = 'Booking has been cancelled.';
        } catch (Exception $e) {
            $conn->rollback();
            $error_message = 'Failed to cancel booking. Please try again.';
        }
        break;

    default:
        $error_message = 'Unknown action.';
        break;
}

$conn->close();

if ($error_message) {
    $_SESSION['error'] = $error_message;
} elseif ($success_message) {
    $_SESSION['success'] = $success_message;
}

header('Location: booking_view.php?id=' . $booking_id);
exit;

