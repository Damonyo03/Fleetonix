<?php
/**
 * Fleettonix - Edit User
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

// Get additional info
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

$page_title = 'Edit User - ' . htmlspecialchars($user['full_name']);

// Include header
include __DIR__ . '/../includes/admin_header.php';
?>

<div class="page-header">
    <h1 class="page-title">Edit User</h1>
    <p class="page-subtitle">Update information for <?php echo htmlspecialchars($user['full_name']); ?></p>
</div>

<div class="form-card">
    <?php if (isset($_SESSION['error'])): ?>
        <div class="alert alert-error">
            <?php 
            echo htmlspecialchars($_SESSION['error']); 
            unset($_SESSION['error']);
            ?>
        </div>
    <?php endif; ?>
    
    <?php if (isset($_SESSION['success'])): ?>
        <div class="alert alert-success">
            <?php 
            echo htmlspecialchars($_SESSION['success']); 
            unset($_SESSION['success']);
            ?>
        </div>
    <?php endif; ?>

    <form method="POST" action="user_edit_handler.php">
        <input type="hidden" name="user_id" value="<?php echo $user['id']; ?>">
        <input type="hidden" name="user_type" value="<?php echo htmlspecialchars($user['user_type']); ?>">
        
        <div class="form-row">
            <div class="form-group">
                <label for="full_name">Full Name *</label>
                <input 
                    type="text" 
                    id="full_name" 
                    name="full_name" 
                    class="form-input" 
                    required
                    value="<?php echo htmlspecialchars($user['full_name']); ?>"
                >
            </div>

            <div class="form-group">
                <label for="email">Email *</label>
                <input 
                    type="email" 
                    id="email" 
                    name="email" 
                    class="form-input" 
                    required
                    value="<?php echo htmlspecialchars($user['email']); ?>"
                >
            </div>
        </div>

        <div class="form-row">
            <div class="form-group">
                <label for="phone">Phone Number</label>
                <input 
                    type="tel" 
                    id="phone" 
                    name="phone" 
                    class="form-input" 
                    value="<?php echo htmlspecialchars($user['phone'] ?? ''); ?>"
                >
            </div>

            <div class="form-group">
                <label for="status">Status *</label>
                <select id="status" name="status" class="form-input" required>
                    <option value="active" <?php echo $user['status'] === 'active' ? 'selected' : ''; ?>>Active</option>
                    <option value="inactive" <?php echo $user['status'] === 'inactive' ? 'selected' : ''; ?>>Inactive</option>
                    <option value="suspended" <?php echo $user['status'] === 'suspended' ? 'selected' : ''; ?>>Suspended</option>
                </select>
            </div>
        </div>

        <div class="form-group">
            <label for="password">New Password (leave blank to keep current)</label>
            <input 
                type="password" 
                id="password" 
                name="password" 
                class="form-input" 
                placeholder="Enter new password (min. 16 characters)"
                minlength="16"
            >
            <small style="color: var(--text-muted); font-size: 0.85rem; margin-top: 5px; display: block;">
                Must contain: uppercase, lowercase, number, and special character
            </small>
        </div>

        <?php if ($user['user_type'] === 'client' && $additional_info): ?>
            <div class="form-group">
                <label for="company_name">Company Name *</label>
                <input 
                    type="text" 
                    id="company_name" 
                    name="company_name" 
                    class="form-input" 
                    required
                    value="<?php echo htmlspecialchars($additional_info['company_name'] ?? ''); ?>"
                >
            </div>
        <?php endif; ?>

        <?php if ($user['user_type'] === 'driver' && $additional_info): ?>
            <div class="form-row">
                <div class="form-group">
                    <label for="license_number">License Number</label>
                    <input 
                        type="text" 
                        id="license_number" 
                        name="license_number" 
                        class="form-input" 
                        value="<?php echo htmlspecialchars($additional_info['license_number'] ?? ''); ?>"
                    >
                </div>

                <div class="form-group">
                    <label for="license_expiry">License Expiry</label>
                    <input 
                        type="date" 
                        id="license_expiry" 
                        name="license_expiry" 
                        class="form-input" 
                        value="<?php echo $additional_info['license_expiry'] ?? ''; ?>"
                    >
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label for="vehicle_assigned">Vehicle Assigned</label>
                    <input 
                        type="text" 
                        id="vehicle_assigned" 
                        name="vehicle_assigned" 
                        class="form-input" 
                        value="<?php echo htmlspecialchars($additional_info['vehicle_assigned'] ?? ''); ?>"
                    >
                </div>

                <div class="form-group">
                    <label for="plate_number">Plate Number</label>
                    <input 
                        type="text" 
                        id="plate_number" 
                        name="plate_number" 
                        class="form-input" 
                        placeholder="Enter vehicle plate number"
                        value="<?php echo htmlspecialchars($additional_info['plate_number'] ?? ''); ?>"
                    >
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label for="current_status">Driver Status</label>
                    <select id="current_status" name="current_status" class="form-input">
                        <option value="offline" <?php echo ($additional_info['current_status'] ?? 'offline') === 'offline' ? 'selected' : ''; ?>>Offline</option>
                        <option value="available" <?php echo ($additional_info['current_status'] ?? '') === 'available' ? 'selected' : ''; ?>>Available</option>
                        <option value="on_schedule" <?php echo ($additional_info['current_status'] ?? '') === 'on_schedule' ? 'selected' : ''; ?>>On Schedule</option>
                        <option value="in_progress" <?php echo ($additional_info['current_status'] ?? '') === 'in_progress' ? 'selected' : ''; ?>>In Progress</option>
                    </select>
                </div>
            </div>
        <?php endif; ?>

        <div class="page-actions" style="margin-top: 30px;">
            <button type="submit" class="btn btn-primary">
                <i class="fas fa-save"></i> Update User
            </button>
            <a href="user_view.php?id=<?php echo $user['id']; ?>" class="btn btn-secondary">
                <i class="fas fa-times"></i> Cancel
            </a>
        </div>
    </form>
</div>

<?php include __DIR__ . '/../includes/admin_footer.php'; ?>

