<?php
/**
 * Fleettonix - Driver Management
 */

session_start();
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/admin_functions.php';

// Require admin access
requireUserType('admin');

$currentUser = getCurrentUser();
$page_title = 'Driver Management';

// Get filter parameters
$status = isset($_GET['status']) ? $_GET['status'] : null;
$search = isset($_GET['search']) ? trim($_GET['search']) : '';

// Get drivers
$drivers = getAllDrivers($status, $search);

// Include header
include __DIR__ . '/../includes/admin_header.php';
?>

<div class="page-header">
    <h1 class="page-title">Driver Management</h1>
    <p class="page-subtitle">Manage all drivers and monitor their performance</p>
</div>

<!-- Page Actions -->
<div class="page-actions">
    <a href="user_add.php?type=driver" class="btn btn-primary">
        <i class="fas fa-plus"></i> Add Driver
    </a>
</div>

<!-- Drivers Table -->
<div class="data-table-wrapper">
    <div class="table-header">
        <h3 class="table-title">All Drivers</h3>
        <div class="table-filters">
            <form method="GET" action="" style="display: flex; gap: 10px; align-items: center;">
                <select name="status" class="form-input" style="width: auto; padding: 8px 12px;">
                    <option value="">All Status</option>
                    <option value="available" <?php echo $status === 'available' ? 'selected' : ''; ?>>Available</option>
                    <option value="on_schedule" <?php echo $status === 'on_schedule' ? 'selected' : ''; ?>>On Schedule</option>
                    <option value="in_progress" <?php echo $status === 'in_progress' ? 'selected' : ''; ?>>In Progress</option>
                    <option value="offline" <?php echo $status === 'offline' ? 'selected' : ''; ?>>Offline</option>
                </select>
                <input 
                    type="text" 
                    name="search" 
                    class="form-input" 
                    placeholder="Search by name, email, or license..."
                    value="<?php echo htmlspecialchars($search); ?>"
                    style="width: 250px; padding: 8px 12px;"
                >
                <button type="submit" class="btn-icon view">
                    <i class="fas fa-search"></i> Search
                </button>
                <?php if ($status || $search): ?>
                    <a href="drivers.php" class="btn-icon edit">
                        <i class="fas fa-times"></i> Clear
                    </a>
                <?php endif; ?>
            </form>
        </div>
    </div>

    <?php if (empty($drivers)): ?>
        <div class="empty-state">
            <div class="empty-state-icon"><i class="fas fa-car"></i></div>
            <div class="empty-state-title">No Drivers Found</div>
            <div class="empty-state-text"><?php echo $search || $status ? 'Try adjusting your search filters' : 'Get started by adding a new driver'; ?></div>
        </div>
    <?php else: ?>
        <table class="data-table">
            <thead>
                <tr>
                    <th>Driver Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>License Number</th>
                    <th>Vehicle</th>
                    <th>Plate Number</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($drivers as $driver): ?>
                    <tr>
                        <td><?php echo htmlspecialchars($driver['full_name']); ?></td>
                        <td><?php echo htmlspecialchars($driver['email']); ?></td>
                        <td><?php echo htmlspecialchars($driver['phone'] ?? 'N/A'); ?></td>
                        <td><?php echo htmlspecialchars($driver['license_number'] ?? 'N/A'); ?></td>
                        <td><?php echo htmlspecialchars($driver['vehicle_assigned'] ?? 'N/A'); ?></td>
                        <td><?php echo htmlspecialchars($driver['plate_number'] ?? 'N/A'); ?></td>
                        <td>
                            <span class="status-badge <?php 
                                echo $driver['current_status'] === 'available' ? 'active' : 
                                    ($driver['current_status'] === 'offline' ? 'inactive' : 'in-progress'); 
                            ?>">
                                <?php echo ucfirst(str_replace('_', ' ', $driver['current_status'])); ?>
                            </span>
                        </td>
                        <td>
                            <div class="action-buttons">
                                <a href="driver_view.php?id=<?php echo $driver['id']; ?>" class="btn-icon view" title="View">
                                    <i class="fas fa-eye"></i>
                                </a>
                                <a href="driver_performance.php?id=<?php echo $driver['id']; ?>" class="btn-icon edit" title="Performance">
                                    <i class="fas fa-chart-line"></i>
                                </a>
                                <a href="user_edit.php?id=<?php echo $driver['user_id']; ?>" class="btn-icon edit" title="Edit">
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

