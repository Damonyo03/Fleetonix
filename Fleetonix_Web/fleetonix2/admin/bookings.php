<?php
/**
 * Fleettonix - Booking Management
 */

session_start();
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/admin_functions.php';

// Require admin access
requireUserType('admin');

$currentUser = getCurrentUser();
$page_title = 'Booking Management';

// Get filter parameters
$status = isset($_GET['status']) ? $_GET['status'] : null;
$client_id = isset($_GET['client_id']) ? (int)$_GET['client_id'] : null;

// Get bookings
$bookings = getAllBookings($status, $client_id);

// Include header
include __DIR__ . '/../includes/admin_header.php';
?>

<div class="page-header">
    <h1 class="page-title">Booking Management</h1>
    <p class="page-subtitle">View and manage all client booking requests</p>
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
                <?php if ($status || $client_id): ?>
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
            <div class="empty-state-text"><?php echo $status ? 'No bookings with this status' : 'No bookings have been created yet'; ?></div>
        </div>
    <?php else: ?>
        <table class="data-table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Client</th>
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
                        <td><?php echo htmlspecialchars($booking['company_name']); ?></td>
                        <td><?php echo htmlspecialchars($booking['pickup_location']); ?></td>
                        <td><?php echo htmlspecialchars($booking['dropoff_location']); ?></td>
                        <td>
                            <?php echo date('M d, Y', strtotime($booking['booking_date'])); ?><br>
                            <small style="color: var(--text-muted);"><?php echo date('h:i A', strtotime($booking['booking_time'])); ?></small>
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
                                    <a href="booking_approve.php?id=<?php echo $booking['id']; ?>" class="btn-icon edit" title="Approve">
                                        <i class="fas fa-check"></i>
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

<?php include __DIR__ . '/../includes/admin_footer.php'; ?>

