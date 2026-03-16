<?php
/**
 * Fleettonix - View Driver Details
 */

session_start();
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/admin_functions.php';
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
    SELECT d.*, u.full_name, u.email, u.phone, u.status as user_status, u.created_at
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

// Get driver statistics
$stmt = $conn->prepare("
    SELECT 
        COUNT(DISTINCT s.id) as total_schedules,
        COUNT(DISTINCT CASE WHEN s.status = 'completed' THEN s.id END) as completed_schedules,
        COUNT(DISTINCT CASE WHEN s.status = 'in_progress' THEN s.id END) as active_schedules
    FROM schedules s
    WHERE s.driver_id = ?
");
$stmt->bind_param("i", $driver_id);
$stmt->execute();
$stats_result = $stmt->get_result();
$driver_stats = $stats_result->fetch_assoc();
$stmt->close();

// Get recent schedules
$stmt = $conn->prepare("
    SELECT s.*, c.company_name, u_client.full_name as client_name
    FROM schedules s
    JOIN bookings b ON s.booking_id = b.id
    JOIN clients c ON b.client_id = c.id
    JOIN users u_client ON c.user_id = u_client.id
    WHERE s.driver_id = ?
    ORDER BY s.created_at DESC
    LIMIT 5
");
$stmt->bind_param("i", $driver_id);
$stmt->execute();
$schedules_result = $stmt->get_result();
$recent_schedules = [];
while ($row = $schedules_result->fetch_assoc()) {
    $recent_schedules[] = $row;
}
$stmt->close();

$conn->close();

$page_title = 'Driver Details - ' . htmlspecialchars($driver['full_name']);

// Include header
include __DIR__ . '/../includes/admin_header.php';
?>

<div class="page-header">
    <h1 class="page-title">Driver Details</h1>
    <p class="page-subtitle">View information and performance for <?php echo htmlspecialchars($driver['full_name']); ?></p>
</div>

<!-- Driver Statistics -->
<div class="stats-grid" style="margin-bottom: 30px;">
    <div class="stat-card">
        <div class="stat-header">
            <span class="stat-title">Total Schedules</span>
            <div class="stat-icon blue">
                <i class="fas fa-calendar-alt"></i>
            </div>
        </div>
        <div class="stat-value"><?php echo $driver_stats['total_schedules'] ?? 0; ?></div>
        <div class="stat-change">All time</div>
    </div>

    <div class="stat-card">
        <div class="stat-header">
            <span class="stat-title">Completed</span>
            <div class="stat-icon green">
                <i class="fas fa-check-circle"></i>
            </div>
        </div>
        <div class="stat-value"><?php echo $driver_stats['completed_schedules'] ?? 0; ?></div>
        <div class="stat-change">Successfully completed</div>
    </div>

    <div class="stat-card">
        <div class="stat-header">
            <span class="stat-title">Active</span>
            <div class="stat-icon teal">
                <i class="fas fa-spinner"></i>
            </div>
        </div>
        <div class="stat-value"><?php echo $driver_stats['active_schedules'] ?? 0; ?></div>
        <div class="stat-change">Currently active</div>
    </div>
</div>

<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
    <!-- Driver Information -->
    <div class="form-card">
        <h3 style="color: var(--text-primary); margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">Driver Information</h3>
        
        <div class="form-row">
            <div class="form-group">
                <label>Full Name</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php echo htmlspecialchars($driver['full_name']); ?>
                </div>
            </div>

            <div class="form-group">
                <label>Email</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php echo htmlspecialchars($driver['email']); ?>
                </div>
            </div>
        </div>

        <div class="form-row">
            <div class="form-group">
                <label>Phone</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php echo htmlspecialchars($driver['phone'] ?? 'N/A'); ?>
                </div>
            </div>

            <div class="form-group">
                <label>Status</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px;">
                    <span class="status-badge <?php echo $driver['user_status'] === 'active' ? 'active' : 'inactive'; ?>">
                        <?php echo ucfirst($driver['user_status']); ?>
                    </span>
                </div>
            </div>
        </div>

        <h4 style="color: var(--text-primary); margin: 20px 0 15px 0;">License Information</h4>
        
        <div class="form-row">
            <div class="form-group">
                <label>License Number</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php echo htmlspecialchars($driver['license_number'] ?? 'N/A'); ?>
                </div>
            </div>

            <div class="form-group">
                <label>License Expiry</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php echo $driver['license_expiry'] ? date('F d, Y', strtotime($driver['license_expiry'])) : 'N/A'; ?>
                </div>
            </div>
        </div>

        <h4 style="color: var(--text-primary); margin: 20px 0 15px 0;">Vehicle Information</h4>
        
        <div class="form-row">
            <div class="form-group">
                <label>Vehicle Assigned</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php echo htmlspecialchars($driver['vehicle_assigned'] ?? 'N/A'); ?>
                </div>
            </div>

            <div class="form-group">
                <label>Plate Number</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php echo htmlspecialchars($driver['plate_number'] ?? 'N/A'); ?>
                </div>
            </div>
        </div>

        <div class="form-group">
            <label>Current Status</label>
            <div style="padding: 12px; background: var(--bg-input); border-radius: 8px;">
                <span class="status-badge <?php 
                    echo $driver['current_status'] === 'available' ? 'active' : 
                        ($driver['current_status'] === 'offline' ? 'inactive' : 'in-progress'); 
                ?>">
                    <?php echo ucfirst(str_replace('_', ' ', $driver['current_status'])); ?>
                </span>
            </div>
        </div>

        <div class="page-actions" style="margin-top: 20px;">
            <a href="user_edit.php?id=<?php echo $driver['user_id']; ?>" class="btn btn-primary">
                <i class="fas fa-edit"></i> Edit Driver
            </a>
            <a href="driver_performance.php?id=<?php echo $driver_id; ?>" class="btn btn-secondary">
                <i class="fas fa-chart-line"></i> View Performance
            </a>
            <a href="drivers.php" class="btn btn-secondary">
                <i class="fas fa-arrow-left"></i> Back to Drivers
            </a>
        </div>
    </div>

    <!-- Recent Schedules -->
    <div class="data-table-wrapper">
        <div class="table-header">
            <h3 class="table-title">Recent Schedules</h3>
            <a href="schedules.php?driver_id=<?php echo $driver_id; ?>" class="btn-icon view">View All</a>
        </div>
        <?php if (empty($recent_schedules)): ?>
            <div class="empty-state">
                <div class="empty-state-icon"><i class="fas fa-calendar-times"></i></div>
                <div class="empty-state-title">No Schedules Yet</div>
                <div class="empty-state-text">This driver hasn't been assigned any schedules</div>
            </div>
        <?php else: ?>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Client</th>
                        <th>Date</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($recent_schedules as $schedule): ?>
                        <tr>
                            <td><?php echo htmlspecialchars($schedule['company_name']); ?></td>
                            <td><?php echo date('M d, Y', strtotime($schedule['scheduled_date'])); ?></td>
                            <td>
                                <span class="status-badge <?php echo strtolower($schedule['status']); ?>">
                                    <?php echo ucfirst($schedule['status']); ?>
                                </span>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        <?php endif; ?>
    </div>
</div>

<?php include __DIR__ . '/../includes/admin_footer.php'; ?>

