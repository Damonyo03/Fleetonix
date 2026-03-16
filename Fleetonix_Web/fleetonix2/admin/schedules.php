<?php
/**
 * Fleettonix - Schedule Management
 */

session_start();
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/admin_functions.php';

// Require admin access
requireUserType('admin');

$currentUser = getCurrentUser();
$page_title = 'Schedule Management';

// Get filter parameters
$driver_id = isset($_GET['driver_id']) ? (int)$_GET['driver_id'] : null;
$status = isset($_GET['status']) ? $_GET['status'] : null;

// Get schedules
$schedules = getAllSchedules($driver_id, $status);

// Include header
include __DIR__ . '/../includes/admin_header.php';
?>

<div class="page-header">
    <h1 class="page-title">Schedule Management</h1>
    <p class="page-subtitle">View and manage all driver schedules</p>
</div>

<!-- Schedules Table -->
<div class="data-table-wrapper">
    <div class="table-header">
        <h3 class="table-title">All Schedules</h3>
        <div class="table-filters">
            <form method="GET" action="" style="display: flex; gap: 10px; align-items: center;">
                <select name="status" class="form-input" style="width: auto; padding: 8px 12px;">
                    <option value="">All Status</option>
                    <option value="pending" <?php echo $status === 'pending' ? 'selected' : ''; ?>>Pending</option>
                    <option value="started" <?php echo $status === 'started' ? 'selected' : ''; ?>>Started</option>
                    <option value="in_progress" <?php echo $status === 'in_progress' ? 'selected' : ''; ?>>In Progress</option>
                    <option value="completed" <?php echo $status === 'completed' ? 'selected' : ''; ?>>Completed</option>
                    <option value="cancelled" <?php echo $status === 'cancelled' ? 'selected' : ''; ?>>Cancelled</option>
                </select>
                <button type="submit" class="btn-icon view">
                    <i class="fas fa-filter"></i> Filter
                </button>
                <?php if ($status || $driver_id): ?>
                    <a href="schedules.php" class="btn-icon edit">
                        <i class="fas fa-times"></i> Clear
                    </a>
                <?php endif; ?>
            </form>
        </div>
    </div>

    <?php if (empty($schedules)): ?>
        <div class="empty-state">
            <div class="empty-state-icon"><i class="fas fa-calendar-times"></i></div>
            <div class="empty-state-title">No Schedules Found</div>
            <div class="empty-state-text"><?php echo $status ? 'No schedules with this status' : 'No schedules have been created yet'; ?></div>
        </div>
    <?php else: ?>
        <table class="data-table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Driver</th>
                    <th>Client</th>
                    <th>Pickup</th>
                    <th>Dropoff</th>
                    <th>Date & Time</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($schedules as $schedule): ?>
                    <tr>
                        <td>#<?php echo $schedule['id']; ?></td>
                        <td><?php echo htmlspecialchars($schedule['driver_name']); ?></td>
                        <td><?php echo htmlspecialchars($schedule['company_name']); ?></td>
                        <td><?php echo htmlspecialchars($schedule['pickup_location']); ?></td>
                        <td><?php echo htmlspecialchars($schedule['dropoff_location']); ?></td>
                        <td>
                            <?php echo date('M d, Y', strtotime($schedule['scheduled_date'])); ?><br>
                            <small style="color: var(--text-muted);"><?php echo date('h:i A', strtotime($schedule['scheduled_time'])); ?></small>
                        </td>
                        <td>
                            <span class="status-badge <?php echo strtolower($schedule['status']); ?>">
                                <?php echo ucfirst(str_replace('_', ' ', $schedule['status'])); ?>
                            </span>
                        </td>
                        <td>
                            <div class="action-buttons">
                                <a href="schedule_view.php?id=<?php echo $schedule['id']; ?>" class="btn-icon view" title="View">
                                    <i class="fas fa-eye"></i>
                                </a>
                                <a href="schedule_edit.php?id=<?php echo $schedule['id']; ?>" class="btn-icon edit" title="Edit">
                                    <i class="fas fa-edit"></i>
                                </a>
                            </div>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    <?php endif; ?>
</div>

<?php include __DIR__ . '/../includes/admin_footer.php'; ?>

