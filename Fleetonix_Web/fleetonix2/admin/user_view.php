<?php
/**
 * Fleettonix - View User
 */

session_start();
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/admin_functions.php';
require_once __DIR__ . '/../includes/db_connect.php';

// Require admin access
requireUserType('admin');

$currentUser = getCurrentUser();
$user_id = isset($_GET['id']) ? (int)$_GET['id'] : 0;

if (!$user_id) {
    $_SESSION['error'] = 'Invalid user ID';
    header('Location: users.php');
    exit;
}

$user = getUserById($user_id);
if (!$user) {
    $_SESSION['error'] = 'User not found';
    header('Location: users.php');
    exit;
}

// Get additional info based on user type
$additional_info = null;
$conn = getConnection();

if ($user['user_type'] === 'driver') {
    $stmt = $conn->prepare("SELECT * FROM drivers WHERE user_id = ?");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $additional_info = $result->fetch_assoc();
    $stmt->close();
} elseif ($user['user_type'] === 'client') {
    $stmt = $conn->prepare("SELECT * FROM clients WHERE user_id = ?");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $additional_info = $result->fetch_assoc();
    $stmt->close();
}

$conn->close();

$page_title = 'View User - ' . htmlspecialchars($user['full_name']);

// Include header
include __DIR__ . '/../includes/admin_header.php';
?>

<div class="page-header">
    <h1 class="page-title">User Details</h1>
    <p class="page-subtitle">View information for <?php echo htmlspecialchars($user['full_name']); ?></p>
</div>

<div class="form-card">
    <div class="page-actions" style="margin-bottom: 20px;">
        <a href="user_edit.php?id=<?php echo $user['id']; ?>" class="btn btn-primary">
            <i class="fas fa-edit"></i> Edit User
        </a>
        <a href="users.php" class="btn btn-secondary">
            <i class="fas fa-arrow-left"></i> Back to Users
        </a>
    </div>

    <h3 style="color: var(--text-primary); margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">Basic Information</h3>
    
    <div class="form-row">
        <div class="form-group">
            <label>Full Name</label>
            <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                <?php echo htmlspecialchars($user['full_name']); ?>
            </div>
        </div>

        <div class="form-group">
            <label>Email</label>
            <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                <?php echo htmlspecialchars($user['email']); ?>
            </div>
        </div>
    </div>

    <div class="form-row">
        <div class="form-group">
            <label>Phone</label>
            <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                <?php echo htmlspecialchars($user['phone'] ?? 'N/A'); ?>
            </div>
        </div>

        <div class="form-group">
            <label>User Type</label>
            <div style="padding: 12px; background: var(--bg-input); border-radius: 8px;">
                <span class="status-badge <?php echo $user['user_type'] === 'admin' ? 'teal' : ($user['user_type'] === 'driver' ? 'blue' : 'green'); ?>">
                    <?php echo ucfirst($user['user_type']); ?>
                </span>
            </div>
        </div>
    </div>

    <div class="form-row">
        <div class="form-group">
            <label>Status</label>
            <div style="padding: 12px; background: var(--bg-input); border-radius: 8px;">
                <span class="status-badge <?php echo $user['status'] === 'active' ? 'active' : 'inactive'; ?>">
                    <?php echo ucfirst($user['status']); ?>
                </span>
            </div>
        </div>

        <div class="form-group">
            <label>Created At</label>
            <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                <?php echo date('F d, Y h:i A', strtotime($user['created_at'])); ?>
            </div>
        </div>
    </div>

    <?php if ($user['user_type'] === 'client' && $additional_info): ?>
        <h3 style="color: var(--text-primary); margin: 30px 0 20px 0; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">Client Information</h3>
        
        <div class="form-group">
            <label>Company Name</label>
            <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                <?php echo htmlspecialchars($additional_info['company_name'] ?? 'N/A'); ?>
            </div>
        </div>
    <?php endif; ?>

    <?php if ($user['user_type'] === 'driver' && $additional_info): ?>
        <h3 style="color: var(--text-primary); margin: 30px 0 20px 0; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">Driver Information</h3>
        
        <div class="form-row">
            <div class="form-group">
                <label>License Number</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php echo htmlspecialchars($additional_info['license_number'] ?? 'N/A'); ?>
                </div>
            </div>

            <div class="form-group">
                <label>License Expiry</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php echo $additional_info['license_expiry'] ? date('F d, Y', strtotime($additional_info['license_expiry'])) : 'N/A'; ?>
                </div>
            </div>
        </div>

        <div class="form-row">
            <div class="form-group">
                <label>Vehicle Assigned</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php echo htmlspecialchars($additional_info['vehicle_assigned'] ?? 'N/A'); ?>
                </div>
            </div>

            <div class="form-group">
                <label>Plate Number</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px; color: var(--text-primary);">
                    <?php echo htmlspecialchars($additional_info['plate_number'] ?? 'N/A'); ?>
                </div>
            </div>
        </div>

        <div class="form-row">
            <div class="form-group">
                <label>Current Status</label>
                <div style="padding: 12px; background: var(--bg-input); border-radius: 8px;">
                    <span class="status-badge <?php echo $additional_info['current_status'] === 'available' ? 'active' : ($additional_info['current_status'] === 'offline' ? 'inactive' : 'in-progress'); ?>">
                        <?php echo ucfirst(str_replace('_', ' ', $additional_info['current_status'])); ?>
                    </span>
                </div>
            </div>
        </div>
    <?php endif; ?>
</div>

<?php include __DIR__ . '/../includes/admin_footer.php'; ?>

