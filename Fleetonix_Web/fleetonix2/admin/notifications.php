<?php
/**
 * Fleettonix - Notifications
 */

session_start();
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db_connect.php';

// Require admin access
requireUserType('admin');

$currentUser = getCurrentUser();
$page_title = 'Notifications';

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

// Count unread
$stmt = $conn->prepare("SELECT COUNT(*) as unread FROM notifications WHERE user_id = ? AND is_read = FALSE");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$unread_result = $stmt->get_result();
$unread_count = $unread_result->fetch_assoc()['unread'];
$stmt->close();

$conn->close();

// Include header
include __DIR__ . '/../includes/admin_header.php';
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

    <?php if (empty($notifications)): ?>
        <div class="empty-state">
            <div class="empty-state-icon"><i class="fas fa-bell-slash"></i></div>
            <div class="empty-state-title">No Notifications</div>
            <div class="empty-state-text">You don't have any notifications yet</div>
        </div>
    <?php else: ?>
        <div style="display: flex; flex-direction: column; gap: 10px;">
            <?php foreach ($notifications as $notification): ?>
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
            <?php endforeach; ?>
        </div>
    <?php endif; ?>
</div>

<?php include __DIR__ . '/../includes/admin_footer.php'; ?>

