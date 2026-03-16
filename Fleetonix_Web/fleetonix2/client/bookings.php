<?php
/**
 * Fleettonix - Client Bookings
 */

session_start();
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db_connect.php';

// Require client access
requireUserType('client');

$currentUser = getCurrentUser();

// Get client ID
$conn = getConnection();
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

$client_id = $client['id'];

// Get filter parameters
$status = isset($_GET['status']) ? $_GET['status'] : null;
$action = isset($_GET['action']) ? $_GET['action'] : null;

// Get bookings
$where = [];
$params = [];
$types = [];

$where[] = "b.client_id = ?";
$params[] = $client_id;
$types[] = "i";

if ($status) {
    $where[] = "b.status = ?";
    $params[] = $status;
    $types[] = "s";
}

$where_clause = "WHERE " . implode(" AND ", $where);
$type_str = implode("", $types);

$sql = "SELECT b.* FROM bookings b $where_clause ORDER BY b.created_at DESC";
$stmt = $conn->prepare($sql);
if (!empty($params)) {
    $stmt->bind_param($type_str, ...$params);
}
$stmt->execute();
$result = $stmt->get_result();
$bookings = [];
while ($row = $result->fetch_assoc()) {
    $bookings[] = $row;
}
$stmt->close();
$conn->close();

$page_title = 'My Bookings';

// Include header
include __DIR__ . '/../includes/client_header.php';
?>

<div class="page-header">
    <h1 class="page-title">My Bookings</h1>
    <p class="page-subtitle">View and manage all your booking requests</p>
</div>

<!-- Page Actions -->
<div class="page-actions">
    <a href="booking_new.php" class="btn btn-primary">
        <i class="fas fa-plus"></i> New Booking
    </a>
</div>

<!-- Bookings Table -->
<div class="data-table-wrapper">
    <div class="table-header">
        <h3 class="table-title">All Bookings</h3>
        <div class="table-filters">
            <form method="GET" action="" style="display: flex; gap: 10px; align-items: center;">
                <select name="status" class="form-input" style="width: auto; padding: 8px 12px;">
                    <option value="">All Status</option>
                    <option value="pending" <?php echo $status === 'pending' ? 'selected' : ''; ?>>Pending</option>
                    <option value="approved" <?php echo $status === 'approved' ? 'selected' : ''; ?>>Approved</option>
                    <option value="assigned" <?php echo $status === 'assigned' ? 'selected' : ''; ?>>Assigned</option>
                    <option value="in_progress" <?php echo $status === 'in_progress' ? 'selected' : ''; ?>>In Progress</option>
                    <option value="completed" <?php echo $status === 'completed' ? 'selected' : ''; ?>>Completed</option>
                    <option value="cancelled" <?php echo $status === 'cancelled' ? 'selected' : ''; ?>>Cancelled</option>
                </select>
                <button type="submit" class="btn-icon view">
                    <i class="fas fa-filter"></i> Filter
                </button>
                <?php if ($status): ?>
                    <a href="bookings.php" class="btn-icon edit">
                        <i class="fas fa-times"></i> Clear
                    </a>
                <?php endif; ?>
            </form>
        </div>
    </div>

    <?php if (empty($bookings)): ?>
        <div class="empty-state">
            <div class="empty-state-icon"><i class="fas fa-calendar-times"></i></div>
            <div class="empty-state-title">No Bookings Found</div>
            <div class="empty-state-text"><?php echo $status ? 'No bookings with this status' : 'Create your first booking to get started'; ?></div>
        </div>
    <?php else: ?>
        <table class="data-table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Pickup Location</th>
                    <th>Dropoff Location</th>
                    <th>Date & Time</th>
                    <th>Passengers</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($bookings as $booking): ?>
                    <tr>
                        <td>#<?php echo $booking['id']; ?></td>
                        <td><?php echo htmlspecialchars($booking['pickup_location']); ?></td>
                        <td><?php echo htmlspecialchars($booking['dropoff_location']); ?></td>
                        <td>
                            <?php echo date('M d, Y', strtotime($booking['booking_date'])); ?><br>
                            <small style="color: var(--text-muted);">
                                <?php 
                                // Handle time format - if it's already in H:i format, convert it
                                $time = $booking['booking_time'];
                                if (strpos($time, ':') !== false) {
                                    // If time is in H:i format (24-hour), convert to 12-hour
                                    if (preg_match('/^(\d{1,2}):(\d{2})$/', $time, $matches)) {
                                        $hour = (int)$matches[1];
                                        $minute = $matches[2];
                                        $ampm = $hour >= 12 ? 'PM' : 'AM';
                                        $hour12 = $hour > 12 ? $hour - 12 : ($hour == 0 ? 12 : $hour);
                                        echo sprintf('%d:%s %s', $hour12, $minute, $ampm);
                                    } else {
                                        echo date('h:i A', strtotime($time));
                                    }
                                } else {
                                    echo date('h:i A', strtotime($time));
                                }
                                ?>
                            </small>
                        </td>
                        <td><?php echo $booking['number_of_passengers']; ?></td>
                        <td>
                            <span class="status-badge <?php echo strtolower($booking['status']); ?>">
                                <?php echo ucfirst($booking['status']); ?>
                            </span>
                        </td>
                        <td><?php echo date('M d, Y', strtotime($booking['created_at'])); ?></td>
                        <td>
                            <div class="action-buttons">
                                <a href="booking_view.php?id=<?php echo $booking['id']; ?>" class="btn-icon view" title="View">
                                    <i class="fas fa-eye"></i>
                                </a>
                                <?php if ($booking['status'] === 'pending'): ?>
                                    <a href="booking_cancel.php?id=<?php echo $booking['id']; ?>" class="btn-icon delete" title="Cancel" onclick="return confirm('Are you sure you want to cancel this booking?');">
                                        <i class="fas fa-times"></i>
                                    </a>
                                <?php endif; ?>
                            </div>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    <?php endif; ?>
</div>

<?php include __DIR__ . '/../includes/client_footer.php'; ?>

