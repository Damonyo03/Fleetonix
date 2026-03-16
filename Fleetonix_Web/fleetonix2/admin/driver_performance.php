<?php
/**
 * Fleettonix - Driver Performance
 */

session_start();
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db_connect.php';

// Require admin access
requireUserType('admin');

$currentUser = getCurrentUser();
$driver_id = isset($_GET['id']) ? (int)$_GET['id'] : 0;

if (!$driver_id) {
    $_SESSION['error'] = 'Invalid driver ID';
    header('Location: drivers.php');
    exit;
}

$conn = getConnection();

// Get driver info
$stmt = $conn->prepare("
    SELECT d.*, u.full_name, u.email
    FROM drivers d
    JOIN users u ON d.user_id = u.id
    WHERE d.id = ?
");
$stmt->bind_param("i", $driver_id);
$stmt->execute();
$result = $stmt->get_result();
$driver = $result->fetch_assoc();
$stmt->close();

if (!$driver) {
    $_SESSION['error'] = 'Driver not found';
    $conn->close();
    header('Location: drivers.php');
    exit;
}

// Get performance statistics
$stmt = $conn->prepare("
    SELECT 
        COUNT(DISTINCT s.id) as total_schedules,
        COUNT(DISTINCT CASE WHEN s.status = 'completed' THEN s.id END) as completed,
        COUNT(DISTINCT CASE WHEN s.status = 'cancelled' THEN s.id END) as cancelled,
        AVG(TIMESTAMPDIFF(MINUTE, s.started_at, s.completed_at)) as avg_duration
    FROM schedules s
    WHERE s.driver_id = ?
");
$stmt->bind_param("i", $driver_id);
$stmt->execute();
$stats_result = $stmt->get_result();
$performance = $stats_result->fetch_assoc();
$stmt->close();

// Get activity logs
$stmt = $conn->prepare("
    SELECT da.*, s.scheduled_date, c.company_name
    FROM driver_activity da
    LEFT JOIN schedules s ON da.schedule_id = s.id
    LEFT JOIN bookings b ON s.booking_id = b.id
    LEFT JOIN clients c ON b.client_id = c.id
    WHERE da.driver_id = ?
    ORDER BY da.created_at DESC
    LIMIT 20
");
$stmt->bind_param("i", $driver_id);
$stmt->execute();
$activity_result = $stmt->get_result();
$activities = [];
while ($row = $activity_result->fetch_assoc()) {
    $activities[] = $row;
}
$stmt->close();

$conn->close();

$page_title = 'Driver Performance - ' . htmlspecialchars($driver['full_name']);

// Include header
include __DIR__ . '/../includes/admin_header.php';
?>

<div class="page-header">
    <h1 class="page-title">Driver Performance</h1>
    <p class="page-subtitle">Performance metrics and activity logs for <?php echo htmlspecialchars($driver['full_name']); ?></p>
</div>

<!-- Performance Statistics -->
<div class="stats-grid" style="margin-bottom: 30px;">
    <div class="stat-card">
        <div class="stat-header">
            <span class="stat-title">Total Schedules</span>
            <div class="stat-icon blue">
                <i class="fas fa-calendar-alt"></i>
            </div>
        </div>
        <div class="stat-value"><?php echo $performance['total_schedules'] ?? 0; ?></div>
        <div class="stat-change">All time</div>
    </div>

    <div class="stat-card">
        <div class="stat-header">
            <span class="stat-title">Completed</span>
            <div class="stat-icon green">
                <i class="fas fa-check-circle"></i>
            </div>
        </div>
        <div class="stat-value"><?php echo $performance['completed'] ?? 0; ?></div>
        <div class="stat-change">
            <?php 
            $completion_rate = $performance['total_schedules'] > 0 
                ? round(($performance['completed'] / $performance['total_schedules']) * 100, 1) 
                : 0; 
            echo $completion_rate . '% completion rate';
            ?>
        </div>
    </div>

    <div class="stat-card">
        <div class="stat-header">
            <span class="stat-title">Cancelled</span>
            <div class="stat-icon teal">
                <i class="fas fa-times-circle"></i>
            </div>
        </div>
        <div class="stat-value"><?php echo $performance['cancelled'] ?? 0; ?></div>
        <div class="stat-change">Cancelled schedules</div>
    </div>

    <div class="stat-card">
        <div class="stat-header">
            <span class="stat-title">Avg Duration</span>
            <div class="stat-icon green">
                <i class="fas fa-clock"></i>
            </div>
        </div>
        <div class="stat-value">
            <?php 
            if ($performance['avg_duration']) {
                $hours = floor($performance['avg_duration'] / 60);
                $minutes = $performance['avg_duration'] % 60;
                echo $hours > 0 ? $hours . 'h ' : '';
                echo $minutes . 'm';
            } else {
                echo 'N/A';
            }
            ?>
        </div>
        <div class="stat-change">Average trip duration</div>
    </div>
</div>

<!-- Activity Logs -->
<div class="data-table-wrapper">
    <div class="table-header">
        <h3 class="table-title">Activity Logs</h3>
    </div>
    <?php if (empty($activities)): ?>
        <div class="empty-state">
            <div class="empty-state-icon"><i class="fas fa-history"></i></div>
            <div class="empty-state-title">No Activity Yet</div>
            <div class="empty-state-text">Driver activities will appear here</div>
        </div>
    <?php else: ?>
        <table class="data-table">
            <thead>
                <tr>
                    <th>Date & Time</th>
                    <th>Activity Type</th>
                    <th>Description</th>
                    <th>Schedule</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($activities as $activity): ?>
                    <tr>
                        <td><?php echo date('M d, Y h:i A', strtotime($activity['created_at'])); ?></td>
                        <td>
                            <span class="status-badge <?php 
                                echo $activity['activity_type'] === 'schedule_completed' ? 'completed' : 
                                    ($activity['activity_type'] === 'schedule_started' ? 'in-progress' : 'active'); 
                            ?>">
                                <?php echo ucfirst(str_replace('_', ' ', $activity['activity_type'])); ?>
                            </span>
                        </td>
                        <td><?php echo htmlspecialchars($activity['description'] ?? 'N/A'); ?></td>
                        <td>
                            <?php if ($activity['scheduled_date']): ?>
                                <?php echo date('M d, Y', strtotime($activity['scheduled_date'])); ?>
                                <?php if ($activity['company_name']): ?>
                                    <br><small style="color: var(--text-muted);"><?php echo htmlspecialchars($activity['company_name']); ?></small>
                                <?php endif; ?>
                            <?php else: ?>
                                N/A
                            <?php endif; ?>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    <?php endif; ?>
</div>

<div class="page-actions" style="margin-top: 20px;">
    <a href="driver_view.php?id=<?php echo $driver_id; ?>" class="btn btn-secondary">
        <i class="fas fa-arrow-left"></i> Back to Driver Details
    </a>
    <a href="drivers.php" class="btn btn-secondary">
        <i class="fas fa-list"></i> All Drivers
    </a>
</div>

<?php include __DIR__ . '/../includes/admin_footer.php'; ?>

