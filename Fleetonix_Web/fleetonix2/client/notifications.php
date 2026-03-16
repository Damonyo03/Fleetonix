<?php
/**
 * Fleettonix - Client Notifications
 */

session_start();
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db_connect.php';

// Require client access
requireUserType('client');

$currentUser = getCurrentUser();
$user_id = $_SESSION['user_id'];

// Handle mark as read
if (isset($_GET['mark_read']) && $_GET['mark_read']) {
    $notif_id = (int)$_GET['mark_read'];
    $conn = getConnection();
    $stmt = $conn->prepare("UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?");
    $stmt->bind_param("ii", $notif_id, $user_id);
    $stmt->execute();
    $stmt->close();
    $conn->close();
    header('Location: notifications.php');
    exit;
}

// Handle mark all as read
if (isset($_GET['mark_all_read'])) {
    $conn = getConnection();
    $stmt = $conn->prepare("UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $stmt->close();
    $conn->close();
    header('Location: notifications.php');
    exit;
}

$conn = getConnection();

// Get notifications
$stmt = $conn->prepare("
    SELECT *
    FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 100
");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$result = $stmt->get_result();
$notifications = [];
while ($row = $result->fetch_assoc()) {
    $notifications[] = $row;
}
$stmt->close();

// Group notifications by trip-related events
// Each "Trip Completed" gets its own group, with related notifications (Started, Pickup, Dropoff, Return Pickup) grouped with it
$trip_groups = [];
$other_notifications = [];

// Trip-related notification titles
$trip_titles = ['Trip Started', 'Pickup Completed', 'Dropoff Completed', 'Return Pickup Completed', 'Trip Completed'];
$trip_sub_titles = ['Trip Started', 'Pickup Completed', 'Dropoff Completed', 'Return Pickup Completed'];

// First pass: Create a group for each "Trip Completed" notification
foreach ($notifications as $notification) {
    if ($notification['title'] === 'Trip Completed') {
        $trip_groups[] = [
            'main' => $notification,
            'sub' => [],
            'time' => strtotime($notification['created_at'])
        ];
    }
}

// Second pass: Add related trip notifications to the nearest "Trip Completed" group (within 2 hours before)
foreach ($notifications as $notification) {
    if (in_array($notification['title'], $trip_sub_titles)) {
        $notification_time = strtotime($notification['created_at']);
        $best_group = null;
        $best_time_diff = null;
        
        // Find the nearest "Trip Completed" that occurred after this notification (within 2 hours)
        foreach ($trip_groups as $group_id => $group) {
            $time_diff = $group['time'] - $notification_time;
            // Must be after the notification and within 2 hours (7200 seconds)
            if ($time_diff >= 0 && $time_diff <= 7200) {
                if ($best_group === null || $time_diff < $best_time_diff) {
                    $best_group = $group_id;
                    $best_time_diff = $time_diff;
                }
            }
        }
        
        if ($best_group !== null) {
            $trip_groups[$best_group]['sub'][] = $notification;
        } else {
            // No matching Trip Completed found, treat as standalone
            $other_notifications[] = $notification;
        }
    } elseif (!in_array($notification['title'], $trip_titles)) {
        // Non-trip notification
        $other_notifications[] = $notification;
    }
}

// Sort sub-notifications by time for each group
foreach ($trip_groups as $group_id => $group) {
    usort($trip_groups[$group_id]['sub'], function($a, $b) {
        return strtotime($a['created_at']) - strtotime($b['created_at']);
    });
}

// Combine for display - each Trip Completed is separate
$display_items = [];
foreach ($trip_groups as $group_id => $group) {
    $display_items[] = ['type' => 'completed_trip', 'group_id' => $group_id, 'group' => $group];
}
foreach ($other_notifications as $notification) {
    $display_items[] = ['type' => 'other', 'notification' => $notification];
}

// Count unread
$stmt = $conn->prepare("SELECT COUNT(*) as unread FROM notifications WHERE user_id = ? AND is_read = FALSE");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$unread_result = $stmt->get_result();
$unread_count = $unread_result->fetch_assoc()['unread'];
$stmt->close();

$conn->close();

$page_title = 'Notifications';

// Include header
include __DIR__ . '/../includes/client_header.php';
?>

<div class="page-header">
    <h1 class="page-title">Notifications</h1>
    <p class="page-subtitle">System notifications and alerts</p>
    <?php if ($unread_count > 0): ?>
        <div class="page-actions" style="margin-top: 10px;">
            <a href="notifications.php?mark_all_read=1" class="btn btn-secondary">
                <i class="fas fa-check-double"></i> Mark All as Read
            </a>
        </div>
    <?php endif; ?>
</div>

<div class="data-table-wrapper">
    <div class="table-header">
        <h3 class="table-title">
            Notifications
            <?php if ($unread_count > 0): ?>
                <span class="status-badge pending" style="margin-left: 10px;"><?php echo $unread_count; ?> unread</span>
            <?php endif; ?>
        </h3>
    </div>

    <?php if (empty($display_items)): ?>
        <div class="empty-state">
            <div class="empty-state-icon"><i class="fas fa-bell-slash"></i></div>
            <div class="empty-state-title">No Notifications</div>
            <div class="empty-state-text">You don't have any notifications yet</div>
        </div>
    <?php else: ?>
        <div style="display: flex; flex-direction: column; gap: 10px;">
            <?php foreach ($display_items as $item): ?>
                <?php if ($item['type'] === 'completed_trip'): 
                    $group = $item['group'];
                    $main_notification = $group['main'];
                    $sub_notifications = $group['sub'];
                    $group_id = $item['group_id'];
                ?>
                    <div style="
                        background: <?php echo $main_notification['is_read'] ? 'var(--bg-input)' : 'var(--bg-card)'; ?>;
                        border: 1px solid var(--border-color);
                        border-left: 4px solid var(--accent-green);
                        border-radius: 8px;
                        padding: 15px 20px;
                        transition: all 0.3s ease;
                    ">
                        <div style="display: flex; justify-content: space-between; align-items: start; gap: 15px;">
                            <div style="flex: 1;">
                                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                                    <h4 style="color: var(--text-primary); margin: 0; font-size: 1rem;">
                                        <span class="status-badge completed" style="margin-right: 8px;">Trip Completed</span>
                                        <?php echo htmlspecialchars($main_notification['title']); ?>
                                    </h4>
                                    <?php if (!$main_notification['is_read']): ?>
                                        <span class="status-badge active" style="font-size: 0.75rem;">New</span>
                                    <?php endif; ?>
                                </div>
                                <p style="color: var(--text-secondary); margin: 0 0 8px 0; font-size: 0.9rem;">
                                    <?php echo nl2br(htmlspecialchars($main_notification['message'])); ?>
                                </p>
                                <small style="color: var(--text-muted); font-size: 0.85rem;">
                                    <?php echo date('F d, Y h:i A', strtotime($main_notification['created_at'])); ?>
                                </small>
                            </div>
                            <div style="display: flex; gap: 10px; align-items: center;">
                                <?php if (!$main_notification['is_read']): ?>
                                    <a href="notifications.php?mark_read=<?php echo $main_notification['id']; ?>" 
                                       class="btn-icon view" 
                                       title="Mark as read"
                                       style="flex-shrink: 0;">
                                        <i class="fas fa-check"></i>
                                    </a>
                                <?php endif; ?>
                                <?php if (!empty($sub_notifications)): ?>
                                    <button type="button" class="btn-icon edit" onclick="toggleClientNotifications(<?php echo $group_id; ?>)" id="clientToggleBtn<?php echo $group_id; ?>" title="Show/Hide Trip Notifications" style="background: transparent; border: none; cursor: pointer; padding: 4px;">
                                        <i class="fas fa-chevron-down" id="clientIcon<?php echo $group_id; ?>"></i>
                                    </button>
                                <?php endif; ?>
                            </div>
                        </div>
                        
                        <?php if (!empty($sub_notifications)): ?>
                            <div id="clientNotifications<?php echo $group_id; ?>" style="display: none; margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--border-color);">
                                <h4 style="color: var(--text-primary); margin-bottom: 15px; font-size: 0.95rem;">Trip Notifications</h4>
                                <div style="display: flex; flex-direction: column; gap: 10px;">
                                    <?php foreach ($sub_notifications as $sub): ?>
                                        <div style="
                                            background: <?php echo $sub['is_read'] ? 'var(--bg-input)' : 'var(--bg-secondary)'; ?>;
                                            border: 1px solid var(--border-color);
                                            border-left: 3px solid <?php 
                                                echo $sub['type'] === 'error' ? '#ff6b6b' : 
                                                    ($sub['type'] === 'success' ? 'var(--accent-green)' : 
                                                    ($sub['type'] === 'warning' ? '#ffc107' : 'var(--accent-blue)')); 
                                            ?>;
                                            border-radius: 6px;
                                            padding: 12px 15px;
                                        ">
                                            <div style="display: flex; justify-content: space-between; align-items: start; gap: 10px;">
                                                <div style="flex: 1;">
                                                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
                                                        <strong style="color: var(--text-primary); font-size: 0.9rem;">
                                                            <?php echo htmlspecialchars($sub['title']); ?>
                                                        </strong>
                                                        <?php if (!$sub['is_read']): ?>
                                                            <span class="status-badge active" style="font-size: 0.7rem;">New</span>
                                                        <?php endif; ?>
                                                    </div>
                                                    <p style="color: var(--text-secondary); margin: 0 0 6px 0; font-size: 0.85rem;">
                                                        <?php echo nl2br(htmlspecialchars($sub['message'])); ?>
                                                    </p>
                                                    <small style="color: var(--text-muted); font-size: 0.8rem;">
                                                        <?php echo date('h:i A', strtotime($sub['created_at'])); ?>
                                                    </small>
                                                </div>
                                                <?php if (!$sub['is_read']): ?>
                                                    <a href="notifications.php?mark_read=<?php echo $sub['id']; ?>" 
                                                       class="btn-icon view" 
                                                       title="Mark as read"
                                                       style="flex-shrink: 0; padding: 4px;">
                                                        <i class="fas fa-check" style="font-size: 0.8rem;"></i>
                                                    </a>
                                                <?php endif; ?>
                                            </div>
                                        </div>
                                    <?php endforeach; ?>
                                </div>
                            </div>
                        <?php endif; ?>
                    </div>
                <?php else: 
                    $notification = $item['notification'];
                ?>
                    <div style="
                        background: <?php echo $notification['is_read'] ? 'var(--bg-input)' : 'var(--bg-card)'; ?>;
                        border: 1px solid var(--border-color);
                        border-left: 4px solid <?php 
                            echo $notification['type'] === 'error' ? '#ff6b6b' : 
                                ($notification['type'] === 'success' ? 'var(--accent-green)' : 
                                ($notification['type'] === 'warning' ? '#ffc107' : 'var(--accent-blue)')); 
                        ?>;
                        border-radius: 8px;
                        padding: 15px 20px;
                        transition: all 0.3s ease;
                    ">
                        <div style="display: flex; justify-content: space-between; align-items: start; gap: 15px;">
                            <div style="flex: 1;">
                                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                                    <h4 style="color: var(--text-primary); margin: 0; font-size: 1rem;">
                                        <?php echo htmlspecialchars($notification['title']); ?>
                                    </h4>
                                    <?php if (!$notification['is_read']): ?>
                                        <span class="status-badge active" style="font-size: 0.75rem;">New</span>
                                    <?php endif; ?>
                                </div>
                                <p style="color: var(--text-secondary); margin: 0 0 8px 0; font-size: 0.9rem;">
                                    <?php echo nl2br(htmlspecialchars($notification['message'])); ?>
                                </p>
                                <small style="color: var(--text-muted); font-size: 0.85rem;">
                                    <?php echo date('F d, Y h:i A', strtotime($notification['created_at'])); ?>
                                </small>
                            </div>
                            <?php if (!$notification['is_read']): ?>
                                <a href="notifications.php?mark_read=<?php echo $notification['id']; ?>" 
                                   class="btn-icon view" 
                                   title="Mark as read"
                                   style="flex-shrink: 0;">
                                    <i class="fas fa-check"></i>
                                </a>
                            <?php endif; ?>
                        </div>
                    </div>
                <?php endif; ?>
            <?php endforeach; ?>
        </div>
    <?php endif; ?>
</div>

<?php include __DIR__ . '/../includes/client_footer.php'; ?>

<script>
// Toggle client notifications
function toggleClientNotifications(groupId) {
    const notificationsDiv = document.getElementById('clientNotifications' + groupId);
    const icon = document.getElementById('clientIcon' + groupId);
    
    if (notificationsDiv && icon) {
        if (notificationsDiv.style.display === 'none') {
            notificationsDiv.style.display = '';
            icon.classList.remove('fa-chevron-down');
            icon.classList.add('fa-chevron-up');
        } else {
            notificationsDiv.style.display = 'none';
            icon.classList.remove('fa-chevron-up');
            icon.classList.add('fa-chevron-down');
        }
    }
}
</script>

