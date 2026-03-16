<?php
/**
 * Fleettonix - Client Dashboard
 */

session_start();
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/client_functions.php';
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
$conn->close();

if (!$client) {
    $_SESSION['error'] = 'Client profile not found';
    header('Location: ../includes/logout.php');
    exit;
}

$client_id = $client['id'];

// Get dashboard statistics
try {
    $stats = getClientDashboardStats($client_id);
    $recentBookings = getClientRecentBookings($client_id, 5);
    $activeSchedules = getClientActiveSchedules($client_id, 5);
} catch (Exception $e) {
    $stats = [
        'total_bookings' => 0,
        'pending_bookings' => 0,
        'active_schedules' => 0,
        'completed_bookings' => 0,
        'today_schedules' => 0,
        'unread_notifications' => 0
    ];
    $recentBookings = [];
    $activeSchedules = [];
}

$page_title = 'Dashboard';

// Include header
include __DIR__ . '/../includes/client_header.php';
?>

<div class="page-header">
    <h1 class="page-title">Dashboard Overview</h1>
    <p class="page-subtitle">Welcome back, <?php echo htmlspecialchars($currentUser['full_name']); ?>! Here's your booking summary.</p>
</div>

<!-- Statistics Cards -->
<div class="stats-grid">
    <div class="stat-card">
        <div class="stat-header">
            <span class="stat-title">Total Bookings</span>
            <div class="stat-icon blue">
                <i class="fas fa-calendar-check"></i>
            </div>
        </div>
        <div class="stat-value"><?php echo $stats['total_bookings']; ?></div>
        <div class="stat-change">All time</div>
    </div>

    <div class="stat-card">
        <div class="stat-header">
            <span class="stat-title">Pending</span>
            <div class="stat-icon teal">
                <i class="fas fa-clock"></i>
            </div>
        </div>
        <div class="stat-value"><?php echo $stats['pending_bookings']; ?></div>
        <div class="stat-change">Awaiting approval</div>
    </div>

    <div class="stat-card">
        <div class="stat-header">
            <span class="stat-title">Active Schedules</span>
            <div class="stat-icon green">
                <i class="fas fa-calendar-alt"></i>
            </div>
        </div>
        <div class="stat-value"><?php echo $stats['active_schedules']; ?></div>
        <div class="stat-change">In progress</div>
    </div>

    <div class="stat-card">
        <div class="stat-header">
            <span class="stat-title">Completed</span>
            <div class="stat-icon green">
                <i class="fas fa-check-circle"></i>
            </div>
        </div>
        <div class="stat-value"><?php echo $stats['completed_bookings']; ?></div>
        <div class="stat-change">Successfully completed</div>
    </div>

    <div class="stat-card">
        <div class="stat-header">
            <span class="stat-title">Today's Schedules</span>
            <div class="stat-icon blue">
                <i class="fas fa-calendar-day"></i>
            </div>
        </div>
        <div class="stat-value"><?php echo $stats['today_schedules']; ?></div>
        <div class="stat-change">Scheduled for today</div>
    </div>

    <div class="stat-card">
        <div class="stat-header">
            <span class="stat-title">Notifications</span>
            <div class="stat-icon teal">
                <i class="fas fa-bell"></i>
            </div>
        </div>
        <div class="stat-value"><?php echo $stats['unread_notifications']; ?></div>
        <div class="stat-change">Unread notifications</div>
    </div>
</div>

<!-- Quick Actions -->
<div class="page-actions">
    <a href="booking_new.php" class="btn btn-primary">
        <i class="fas fa-plus"></i> New Booking
    </a>
    <a href="bookings.php" class="btn btn-secondary">
        <i class="fas fa-list"></i> View All Bookings
    </a>
    <a href="schedules.php" class="btn btn-secondary">
        <i class="fas fa-calendar-alt"></i> View Active Schedules
    </a>
</div>

<!-- Recent Bookings & Active Schedules -->
<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px; margin-top: 30px;">
    <!-- Recent Bookings -->
    <div class="data-table-wrapper">
        <div class="table-header">
            <h3 class="table-title">Recent Bookings</h3>
            <a href="bookings.php" class="btn-icon view">View All</a>
        </div>
        <?php if (empty($recentBookings)): ?>
            <div class="empty-state">
                <div class="empty-state-icon"><i class="fas fa-calendar-times"></i></div>
                <div class="empty-state-title">No Bookings Yet</div>
                <div class="empty-state-text">Create your first booking to get started</div>
            </div>
        <?php else: ?>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Pickup</th>
                        <th>Date</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($recentBookings as $booking): ?>
                        <tr>
                            <td><?php echo htmlspecialchars($booking['pickup_location']); ?></td>
                            <td><?php echo date('M d, Y', strtotime($booking['booking_date'])); ?></td>
                            <td>
                                <span class="status-badge <?php echo strtolower($booking['status']); ?>">
                                    <?php echo ucfirst($booking['status']); ?>
                                </span>
                            </td>
                            <td>
                                <a href="booking_view.php?id=<?php echo $booking['id']; ?>" class="btn-icon view" title="View">
                                    <i class="fas fa-eye"></i>
                                </a>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        <?php endif; ?>
    </div>

    <!-- Active Schedules -->
    <div class="data-table-wrapper">
        <div class="table-header">
            <h3 class="table-title">Active Schedules</h3>
            <a href="schedules.php" class="btn-icon view">View All</a>
        </div>
        <?php if (empty($activeSchedules)): ?>
            <div class="empty-state">
                <div class="empty-state-icon"><i class="fas fa-calendar-times"></i></div>
                <div class="empty-state-title">No Active Schedules</div>
                <div class="empty-state-text">Your active schedules will appear here</div>
            </div>
        <?php else: ?>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Driver</th>
                        <th>Date & Time</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($activeSchedules as $schedule): ?>
                        <tr>
                            <td>
                                <?php echo htmlspecialchars($schedule['driver_name']); ?>
                                <?php if ($schedule['vehicle_assigned']): ?>
                                    <br><small style="color: var(--text-muted);"><?php echo htmlspecialchars($schedule['vehicle_assigned']); ?></small>
                                <?php endif; ?>
                            </td>
                            <td>
                                <?php echo date('M d, Y', strtotime($schedule['scheduled_date'])); ?><br>
                                <small style="color: var(--text-muted);">
                                <?php 
                                $time = $schedule['scheduled_time'];
                                if (preg_match('/^(\d{1,2}):(\d{2})$/', $time, $matches)) {
                                    $hour = (int)$matches[1];
                                    $minute = $matches[2];
                                    $ampm = $hour >= 12 ? 'PM' : 'AM';
                                    $hour12 = $hour > 12 ? $hour - 12 : ($hour == 0 ? 12 : $hour);
                                    echo sprintf('%d:%s %s', $hour12, $minute, $ampm);
                                } else {
                                    echo date('h:i A', strtotime($time));
                                }
                                ?>
                            </small>
                            </td>
                            <td>
                                <span class="status-badge <?php echo strtolower($schedule['status']); ?>">
                                    <?php echo ucfirst(str_replace('_', ' ', $schedule['status'])); ?>
                                </span>
                            </td>
                            <td>
                                <a href="schedule_view.php?id=<?php echo $schedule['id']; ?>" class="btn-icon view" title="View">
                                    <i class="fas fa-eye"></i>
                                </a>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        <?php endif; ?>
    </div>
</div>

<?php include __DIR__ . '/../includes/client_footer.php'; ?>
