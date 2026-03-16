<?php
/**
 * Fleettonix - Client Schedules
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

// Get schedules
$where = [];
$params = [];
$types = [];

$where[] = "b.client_id = ?";
$params[] = $client_id;
$types[] = "i";

if ($status) {
    $where[] = "s.status = ?";
    $params[] = $status;
    $types[] = "s";
}

$where_clause = "WHERE " . implode(" AND ", $where);
$type_str = implode("", $types);

$sql = "
    SELECT s.*, 
           d.user_id as driver_user_id,
           u_driver.full_name as driver_name,
           u_driver.phone as driver_phone,
           d.vehicle_assigned,
           d.plate_number
    FROM schedules s
    JOIN bookings b ON s.booking_id = b.id
    JOIN drivers d ON s.driver_id = d.id
    JOIN users u_driver ON d.user_id = u_driver.id
    $where_clause
    ORDER BY s.scheduled_date DESC, s.scheduled_time DESC
";

$stmt = $conn->prepare($sql);
if (!empty($params)) {
    $stmt->bind_param($type_str, ...$params);
}
$stmt->execute();
$result = $stmt->get_result();
$schedules = [];
while ($row = $result->fetch_assoc()) {
    $schedules[] = $row;
}
$stmt->close();
$conn->close();

$page_title = 'Active Schedules';

// Include header
include __DIR__ . '/../includes/client_header.php';
?>

<div class="page-header">
    <h1 class="page-title">Active Schedules</h1>
    <p class="page-subtitle">Track your scheduled trips and driver status</p>
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
                <?php if ($status): ?>
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
            <div class="empty-state-text"><?php echo $status ? 'No schedules with this status' : 'You don\'t have any schedules yet'; ?></div>
        </div>
    <?php else: ?>
        <table class="data-table">
            <thead>
                <tr>
                    <th>Driver</th>
                    <th>Vehicle</th>
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
                        <td>
                            <?php echo htmlspecialchars($schedule['driver_name']); ?>
                            <?php if ($schedule['driver_phone']): ?>
                                <br><small style="color: var(--text-muted);"><?php echo htmlspecialchars($schedule['driver_phone']); ?></small>
                            <?php endif; ?>
                        </td>
                        <td>
                            <?php echo htmlspecialchars($schedule['vehicle_assigned'] ?? 'N/A'); ?>
                            <?php if ($schedule['plate_number']): ?>
                                <br><small style="color: var(--text-muted);"><?php echo htmlspecialchars($schedule['plate_number']); ?></small>
                            <?php endif; ?>
                        </td>
                        <td><?php echo htmlspecialchars($schedule['pickup_location']); ?></td>
                        <td><?php echo htmlspecialchars($schedule['dropoff_location']); ?></td>
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
                            <div class="action-buttons">
                                <a href="schedule_view.php?id=<?php echo $schedule['id']; ?>" class="btn-icon view" title="View">
                                    <i class="fas fa-eye"></i>
                                </a>
                            </div>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    <?php endif; ?>
</div>

<?php include __DIR__ . '/../includes/client_footer.php'; ?>

