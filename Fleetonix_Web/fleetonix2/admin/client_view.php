<?php
/**
 * Fleettonix - View Client Details
 */

session_start();
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/admin_functions.php';
require_once __DIR__ . '/../includes/db_connect.php';

// Require admin access
requireUserType('admin');

$currentUser = getCurrentUser();
$client_id = isset($_GET['id']) ? (int)$_GET['id'] : 0;

if (!$client_id) {
    $_SESSION['error'] = 'Invalid client ID';
    header('Location: clients.php');
    exit;
}

$conn = getConnection();

// Get client info
$stmt = $conn->prepare("
    SELECT c.*, u.full_name, u.email, u.phone, u.status as user_status, u.created_at
    FROM clients c
    JOIN users u ON c.user_id = u.id
    WHERE c.id = ?
");
$stmt->bind_param("i", $client_id);
$stmt->execute();
$result = $stmt->get_result();
$client = $result->fetch_assoc();
$stmt->close();

if (!$client) {
    $_SESSION['error'] = 'Client not found';
    $conn->close();
    header('Location: clients.php');
    exit;
}

// Get booking statistics
$stmt = $conn->prepare("
    SELECT 
        COUNT(*) as total_bookings,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled
    FROM bookings
    WHERE client_id = ?
");
$stmt->bind_param("i", $client_id);
$stmt->execute();
$stats_result = $stmt->get_result();
$booking_stats = $stats_result->fetch_assoc();
$stmt->close();

// Get recent bookings
$stmt = $conn->prepare("
    SELECT *
    FROM bookings
    WHERE client_id = ?
    ORDER BY created_at DESC
    LIMIT 10
");
$stmt->bind_param("i", $client_id);
$stmt->execute();
$bookings_result = $stmt->get_result();
$recent_bookings = [];
while ($row = $bookings_result->fetch_assoc()) {
    $recent_bookings[] = $row;
}
$stmt->close();

$conn->close();

$page_title = 'Client Details - ' . htmlspecialchars($client['company_name'] ?? $client['full_name']);

// Include header
include __DIR__ . '/../includes/admin_header.php';
?>

<div class="page-header">
    <h1 class="page-title">Client Details</h1>
    <p class="page-subtitle">View information and booking history for <?php echo htmlspecialchars($client['company_name'] ?? $client['full_name']); ?></p>
</div>

<!-- Booking Statistics -->
<div class="stats-grid" style="margin-bottom: 30px;">
    <div class="stat-card">
        <div class="stat-header">
            <span class="stat-title">Total Bookings</span>
            <div class="stat-icon blue">
                <i class="fas fa-calendar-check"></i>
            </div>
        </div>
        <div class="stat-value"><?php echo $booking_stats['total_bookings'] ?? 0; ?></div>
        <div class="stat-change">All time</div>
    </div>

    <div class="stat-card">
        <div class="stat-header">
            <span class="stat-title">Pending</span>
            <div class="stat-icon teal">
                <i class="fas fa-clock"></i>
            </div>
        </div>
        <div class="stat-value"><?php echo $booking_stats['pending'] ?? 0; ?></div>
        <div class="stat-change">Awaiting approval</div>
    </div>

    <div class="stat-card">
        <div class="stat-header">
            <span class="stat-title">Completed</span>
            <div class="stat-icon green">
                <i class="fas fa-check-circle"></i>
            </div>
        </div>
        <div class="stat-value"><?php echo $booking_stats['completed'] ?? 0; ?></div>
        <div class="stat-change">Successfully completed</div>
    </div>

    <div class="stat-card">
        <div class="stat-header">
            <span class="stat-title">Cancelled</span>
            <div class="stat-icon teal">
                <i class="fas fa-times-circle"></i>
            </div>
        </div>
        <div class="stat-value"><?php echo $booking_stats['cancelled'] ?? 0; ?></div>
        <div class="stat-change">Cancelled bookings</div>
    </div>
</div>

<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
    <!-- Client Information -->
    <div class="form-card">
        <h3 style="color: var(--text-primary); margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">Client Information</h3>
        
        <div class="form-group">
            <label>Company Name</label>
            <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                <?php echo htmlspecialchars($client['company_name'] ?? 'N/A'); ?>
            </div>
        </div>

        <div class="form-row">
            <div class="form-group">
                <label>Contact Person</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php echo htmlspecialchars($client['full_name']); ?>
                </div>
            </div>

            <div class="form-group">
                <label>Email</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php echo htmlspecialchars($client['email']); ?>
                </div>
            </div>
        </div>

        <div class="form-row">
            <div class="form-group">
                <label>Phone</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php echo htmlspecialchars($client['phone'] ?? 'N/A'); ?>
                </div>
            </div>

            <div class="form-group">
                <label>Status</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px;">
                    <span class="status-badge <?php echo $client['user_status'] === 'active' ? 'active' : 'inactive'; ?>">
                        <?php echo ucfirst($client['user_status']); ?>
                    </span>
                </div>
            </div>
        </div>

        <?php if ($client['address']): ?>
            <div class="form-group">
                <label>Address</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php echo htmlspecialchars($client['address']); ?>
                </div>
            </div>
        <?php endif; ?>

        <div class="form-group">
            <label>Created At</label>
            <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                <?php echo date('F d, Y h:i A', strtotime($client['created_at'])); ?>
            </div>
        </div>

        <div class="page-actions" style="margin-top: 20px;">
            <a href="user_edit.php?id=<?php echo $client['user_id']; ?>" class="btn btn-primary">
                <i class="fas fa-edit"></i> Edit Client
            </a>
            <a href="clients.php" class="btn btn-secondary">
                <i class="fas fa-arrow-left"></i> Back to Clients
            </a>
        </div>
    </div>

    <!-- Recent Bookings -->
    <div class="data-table-wrapper">
        <div class="table-header">
            <h3 class="table-title">Recent Bookings</h3>
            <a href="bookings.php?client_id=<?php echo $client_id; ?>" class="btn-icon view">View All</a>
        </div>
        <?php if (empty($recent_bookings)): ?>
            <div class="empty-state">
                <div class="empty-state-icon"><i class="fas fa-calendar-times"></i></div>
                <div class="empty-state-title">No Bookings Yet</div>
                <div class="empty-state-text">This client hasn't made any bookings</div>
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
                    <?php foreach ($recent_bookings as $booking): ?>
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
</div>

<?php include __DIR__ . '/../includes/admin_footer.php'; ?>

