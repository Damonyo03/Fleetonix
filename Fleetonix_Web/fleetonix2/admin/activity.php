<?php
/**
 * Fleettonix - Activity Logs
 */

session_start();
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db_connect.php';

// Require admin access
requireUserType('admin');

$currentUser = getCurrentUser();
$page_title = 'Activity Logs';

// Get filter parameters
$driver_id = isset($_GET['driver_id']) ? (int)$_GET['driver_id'] : null;
$activity_type = isset($_GET['activity_type']) ? $_GET['activity_type'] : null;
$page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
$per_page = 50;

$conn = getConnection();

// Build query
$where = [];
$params = [];
$types = [];

if ($driver_id) {
    $where[] = "da.driver_id = ?";
    $params[] = $driver_id;
    $types[] = "i";
}

if ($activity_type) {
    $where[] = "da.activity_type = ?";
    $params[] = $activity_type;
    $types[] = "s";
}

$where_clause = !empty($where) ? "WHERE " . implode(" AND ", $where) : "";
$type_str = implode("", $types);

// Get total count
$count_sql = "
    SELECT COUNT(*) as total 
    FROM driver_activity da
    $where_clause
";

if (!empty($params)) {
    $stmt = $conn->prepare($count_sql);
    $stmt->bind_param($type_str, ...$params);
    $stmt->execute();
    $total = $stmt->get_result()->fetch_assoc()['total'];
    $stmt->close();
} else {
    $result = $conn->query($count_sql);
    $total = $result->fetch_assoc()['total'];
}

// Get activities
$offset = ($page - 1) * $per_page;
$sql = "
    SELECT da.*, 
           d.user_id as driver_user_id,
           u.full_name as driver_name,
           s.scheduled_date,
           s.id as schedule_id,
           c.company_name
    FROM driver_activity da
    JOIN drivers d ON da.driver_id = d.id
    JOIN users u ON d.user_id = u.id
    LEFT JOIN schedules s ON da.schedule_id = s.id
    LEFT JOIN bookings b ON s.booking_id = b.id
    LEFT JOIN clients c ON b.client_id = c.id
    $where_clause
    ORDER BY da.created_at DESC
    LIMIT ? OFFSET ?
";

$params[] = $per_page;
$params[] = $offset;
$types[] = "ii";
$type_str = implode("", $types);

if (!empty($params)) {
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($type_str, ...$params);
    $stmt->execute();
    $result = $stmt->get_result();
} else {
    $result = $conn->query($sql);
}

$activities = [];
while ($row = $result->fetch_assoc()) {
    $activities[] = $row;
}

if (!empty($params)) {
    $stmt->close();
}

// Group activities by schedule_id for completed trips
$completed_schedules = [];
$other_activities = [];
$completed_schedule_ids = [];

// First pass: identify completed schedules
foreach ($activities as $activity) {
    if ($activity['activity_type'] === 'schedule_completed' && $activity['schedule_id']) {
        $schedule_id = $activity['schedule_id'];
        $completed_schedule_ids[] = $schedule_id;
        if (!isset($completed_schedules[$schedule_id])) {
            $completed_schedules[$schedule_id] = [
                'main' => $activity,
                'sub' => []
            ];
        }
    }
}

// Second pass: group activities by schedule
foreach ($activities as $activity) {
    if ($activity['activity_type'] === 'schedule_completed' && $activity['schedule_id']) {
        // Already handled in first pass
        continue;
    } elseif ($activity['schedule_id'] && in_array($activity['schedule_id'], $completed_schedule_ids)) {
        // This activity belongs to a completed schedule
        $schedule_id = $activity['schedule_id'];
        $completed_schedules[$schedule_id]['sub'][] = $activity;
    } else {
        // This is a standalone activity (not part of a completed trip)
        $other_activities[] = $activity;
    }
}

// Sort sub-activities by time for each completed schedule
foreach ($completed_schedules as $schedule_id => $group) {
    usort($completed_schedules[$schedule_id]['sub'], function($a, $b) {
        return strtotime($a['created_at']) - strtotime($b['created_at']);
    });
}

// Get all drivers for filter
$drivers_result = $conn->query("
    SELECT d.id, u.full_name
    FROM drivers d
    JOIN users u ON d.user_id = u.id
    ORDER BY u.full_name ASC
");
$all_drivers = [];
while ($row = $drivers_result->fetch_assoc()) {
    $all_drivers[] = $row;
}

$conn->close();

$total_pages = ceil($total / $per_page);

// Include header
include __DIR__ . '/../includes/admin_header.php';
?>

<div class="page-header">
    <h1 class="page-title">Activity Logs</h1>
    <p class="page-subtitle">Monitor all system activities and driver actions</p>
</div>

<!-- Activity Logs Table -->
<div class="data-table-wrapper">
    <div class="table-header">
        <h3 class="table-title">System Activities</h3>
        <div class="table-filters">
            <form method="GET" action="" style="display: flex; gap: 10px; align-items: center;">
                <select name="driver_id" class="form-input" style="width: auto; padding: 8px 12px;">
                    <option value="">All Drivers</option>
                    <?php foreach ($all_drivers as $driver): ?>
                        <option value="<?php echo $driver['id']; ?>" <?php echo $driver_id == $driver['id'] ? 'selected' : ''; ?>>
                            <?php echo htmlspecialchars($driver['full_name']); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
                <select name="activity_type" class="form-input" style="width: auto; padding: 8px 12px;">
                    <option value="">All Types</option>
                    <option value="schedule_started" <?php echo $activity_type === 'schedule_started' ? 'selected' : ''; ?>>Schedule Started</option>
                    <option value="pickup_completed" <?php echo $activity_type === 'pickup_completed' ? 'selected' : ''; ?>>Pickup Completed</option>
                    <option value="dropoff_completed" <?php echo $activity_type === 'dropoff_completed' ? 'selected' : ''; ?>>Dropoff Completed</option>
                    <option value="schedule_completed" <?php echo $activity_type === 'schedule_completed' ? 'selected' : ''; ?>>Schedule Completed</option>
                    <option value="location_update" <?php echo $activity_type === 'location_update' ? 'selected' : ''; ?>>Location Update</option>
                    <option value="face_verification" <?php echo $activity_type === 'face_verification' ? 'selected' : ''; ?>>Face Verification</option>
                </select>
                <button type="submit" class="btn-icon view">
                    <i class="fas fa-filter"></i> Filter
                </button>
                <?php if ($driver_id || $activity_type): ?>
                    <a href="activity.php" class="btn-icon edit">
                        <i class="fas fa-times"></i> Clear
                    </a>
                <?php endif; ?>
            </form>
        </div>
    </div>

    <?php if (empty($completed_schedules) && empty($other_activities)): ?>
        <div class="empty-state">
            <div class="empty-state-icon"><i class="fas fa-history"></i></div>
            <div class="empty-state-title">No Activities Found</div>
            <div class="empty-state-text"><?php echo ($driver_id || $activity_type) ? 'Try adjusting your filters' : 'No activities have been logged yet'; ?></div>
        </div>
    <?php else: ?>
        <div style="display: flex; flex-direction: column; gap: 15px; width: 100%;">
            <?php 
            // Display completed trips (grouped)
            foreach ($completed_schedules as $schedule_id => $group): 
                $main_activity = $group['main'];
                $sub_activities = $group['sub'];
            ?>
                <div class="form-card" style="margin-bottom: 0; width: 100%; max-width: 100% !important; margin-left: 0 !important; margin-right: 0 !important;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 10px;">
                                <span class="status-badge completed" style="margin: 0;">
                                    Schedule Completed
                                </span>
                                <strong style="color: var(--text-primary);"><?php echo htmlspecialchars($main_activity['driver_name']); ?></strong>
                                <span style="color: var(--text-muted); font-size: 0.9rem;">
                                    <?php echo date('M d, Y h:i A', strtotime($main_activity['created_at'])); ?>
                                </span>
                            </div>
                            <div style="color: var(--text-secondary); font-size: 0.9rem; margin-left: 0;">
                                <?php echo htmlspecialchars($main_activity['description'] ?? 'Driver completed trip'); ?>
                                <?php if ($main_activity['scheduled_date']): ?>
                                    <br><small style="color: var(--text-muted);">
                                        Schedule: <?php echo date('M d, Y', strtotime($main_activity['scheduled_date'])); ?>
                                        <?php if ($main_activity['company_name']): ?>
                                            - <?php echo htmlspecialchars($main_activity['company_name']); ?>
                                        <?php endif; ?>
                                    </small>
                                <?php endif; ?>
                            </div>
                        </div>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <?php if ($main_activity['schedule_id']): ?>
                                <a href="activity_view.php?id=<?php echo $main_activity['id']; ?>&schedule_id=<?php echo $main_activity['schedule_id']; ?>" class="btn-icon view" title="View Trip Details">
                                    <i class="fas fa-eye"></i> View
                                </a>
                            <?php endif; ?>
                            <?php if (!empty($sub_activities)): ?>
                                <button type="button" class="btn-icon edit" onclick="toggleActivities(<?php echo $schedule_id; ?>)" id="toggleBtn<?php echo $schedule_id; ?>" title="Show/Hide Activity Logs">
                                    <i class="fas fa-chevron-down" id="icon<?php echo $schedule_id; ?>"></i>
                                </button>
                            <?php endif; ?>
                        </div>
                    </div>
                    
                    <?php if (!empty($sub_activities)): ?>
                        <div id="activities<?php echo $schedule_id; ?>" style="display: none; margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--border-color);">
                            <h4 style="color: var(--text-primary); margin-bottom: 15px; font-size: 0.95rem;">Activity Logs</h4>
                            <div style="display: flex; flex-direction: column; gap: 10px;">
                                <?php foreach ($sub_activities as $sub): ?>
                                    <div style="display: grid; grid-template-columns: 150px 1fr; gap: 15px; padding: 12px; background: var(--bg-input); border-radius: 6px; align-items: center;">
                                        <div style="color: var(--text-muted); font-size: 0.85rem;">
                                            <?php echo date('h:i A', strtotime($sub['created_at'])); ?>
                                        </div>
                                        <div>
                                            <span class="status-badge <?php 
                                                echo $sub['activity_type'] === 'schedule_started' ? 'in-progress' : 'active'; 
                                            ?>" style="margin-right: 10px;">
                                                <?php echo ucfirst(str_replace('_', ' ', $sub['activity_type'])); ?>
                                            </span>
                                            <span style="color: var(--text-secondary); font-size: 0.9rem;">
                                                <?php echo htmlspecialchars($sub['description'] ?? 'N/A'); ?>
                                            </span>
                                        </div>
                                    </div>
                                <?php endforeach; ?>
                            </div>
                        </div>
                    <?php endif; ?>
                </div>
            <?php endforeach; ?>
            
            <?php 
            // Display other activities (non-completed) as separate cards
            foreach ($other_activities as $activity): 
            ?>
                <div class="form-card" style="margin-bottom: 0; width: 100%; max-width: 100% !important; margin-left: 0 !important; margin-right: 0 !important;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 10px;">
                                <span class="status-badge <?php 
                                    echo $activity['activity_type'] === 'schedule_started' ? 'in-progress' : 'active'; 
                                ?>" style="margin: 0;">
                                    <?php echo ucfirst(str_replace('_', ' ', $activity['activity_type'])); ?>
                                </span>
                                <strong style="color: var(--text-primary);"><?php echo htmlspecialchars($activity['driver_name']); ?></strong>
                                <span style="color: var(--text-muted); font-size: 0.9rem;">
                                    <?php echo date('M d, Y h:i A', strtotime($activity['created_at'])); ?>
                                </span>
                            </div>
                            <div style="color: var(--text-secondary); font-size: 0.9rem;">
                                <?php echo htmlspecialchars($activity['description'] ?? 'N/A'); ?>
                                <?php if ($activity['scheduled_date']): ?>
                                    <br><small style="color: var(--text-muted);">
                                        Schedule: <?php echo date('M d, Y', strtotime($activity['scheduled_date'])); ?>
                                        <?php if ($activity['company_name']): ?>
                                            - <?php echo htmlspecialchars($activity['company_name']); ?>
                                        <?php endif; ?>
                                    </small>
                                <?php endif; ?>
                            </div>
                        </div>
                    </div>
                </div>
            <?php endforeach; ?>
        </div>

        <!-- Pagination -->
        <?php if ($total_pages > 1): ?>
            <div class="pagination">
                <?php if ($page > 1): ?>
                    <a href="?page=<?php echo $page - 1; ?>&driver_id=<?php echo $driver_id; ?>&activity_type=<?php echo urlencode($activity_type); ?>">
                        <i class="fas fa-chevron-left"></i> Previous
                    </a>
                <?php endif; ?>
                
                <?php for ($i = 1; $i <= $total_pages; $i++): ?>
                    <?php if ($i == $page): ?>
                        <span class="active"><?php echo $i; ?></span>
                    <?php else: ?>
                        <a href="?page=<?php echo $i; ?>&driver_id=<?php echo $driver_id; ?>&activity_type=<?php echo urlencode($activity_type); ?>"><?php echo $i; ?></a>
                    <?php endif; ?>
                <?php endfor; ?>
                
                <?php if ($page < $total_pages): ?>
                    <a href="?page=<?php echo $page + 1; ?>&driver_id=<?php echo $driver_id; ?>&activity_type=<?php echo urlencode($activity_type); ?>">
                        Next <i class="fas fa-chevron-right"></i>
                    </a>
                <?php endif; ?>
            </div>
        <?php endif; ?>
    <?php endif; ?>
</div>

<script>
function toggleActivities(scheduleId) {
    const activitiesDiv = document.getElementById('activities' + scheduleId);
    const icon = document.getElementById('icon' + scheduleId);
    
    if (activitiesDiv.style.display === 'none') {
        activitiesDiv.style.display = 'block';
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-up');
    } else {
        activitiesDiv.style.display = 'none';
        icon.classList.remove('fa-chevron-up');
        icon.classList.add('fa-chevron-down');
    }
}
</script>

<?php include __DIR__ . '/../includes/admin_footer.php'; ?>

