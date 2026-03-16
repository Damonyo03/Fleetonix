<?php
/**
 * Fleettonix - Add User
 */

session_start();
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/admin_functions.php';

// Require admin access
requireUserType('admin');

$currentUser = getCurrentUser();
$user_type = isset($_GET['type']) ? $_GET['type'] : '';

// Validate user type
if (!in_array($user_type, ['admin', 'client', 'driver'])) {
    $_SESSION['error'] = 'Invalid user type';
    header('Location: users.php');
    exit;
}

$page_title = 'Add ' . ucfirst($user_type);

// Include header
include __DIR__ . '/../includes/admin_header.php';
?>

<div class="page-header">
    <h1 class="page-title">Add <?php echo ucfirst($user_type); ?></h1>
    <p class="page-subtitle">Create a new <?php echo $user_type; ?> account</p>
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

    <form method="POST" action="user_add_handler.php">
        <input type="hidden" name="user_type" value="<?php echo htmlspecialchars($user_type); ?>">
        
        <div class="form-row">
            <div class="form-group">
                <label for="full_name">Full Name *</label>
                <input 
                    type="text" 
                    id="full_name" 
                    name="full_name" 
                    class="form-input" 
                    placeholder="Enter full name"
                    required
                    value="<?php echo isset($_POST['full_name']) ? htmlspecialchars($_POST['full_name']) : ''; ?>"
                >
            </div>

            <div class="form-group">
                <label for="email">Email *</label>
                <input 
                    type="email" 
                    id="email" 
                    name="email" 
                    class="form-input" 
                    placeholder="Enter email address"
                    required
                    value="<?php echo isset($_POST['email']) ? htmlspecialchars($_POST['email']) : ''; ?>"
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
                    placeholder="Enter phone number"
                    value="<?php echo isset($_POST['phone']) ? htmlspecialchars($_POST['phone']) : ''; ?>"
                >
            </div>

            <div class="form-group">
                <label for="password">Password *</label>
                <input 
                    type="password" 
                    id="password" 
                    name="password" 
                    class="form-input" 
                    placeholder="Create password (min. 16 characters)"
                    required
                    minlength="16"
                >
                <small style="color: var(--text-muted); font-size: 0.85rem; margin-top: 5px; display: block;">
                    Must contain: uppercase, lowercase, number, and special character
                </small>
            </div>
        </div>

        <?php if ($user_type === 'client'): ?>
            <div class="form-group">
                <label for="company_name">Company Name *</label>
                <input 
                    type="text" 
                    id="company_name" 
                    name="company_name" 
                    class="form-input" 
                    placeholder="Enter company name"
                    required
                    value="<?php echo isset($_POST['company_name']) ? htmlspecialchars($_POST['company_name']) : ''; ?>"
                >
            </div>
        <?php endif; ?>

        <?php if ($user_type === 'driver'): ?>
            <div class="form-row">
                <div class="form-group">
                    <label for="license_number">License Number</label>
                    <input 
                        type="text" 
                        id="license_number" 
                        name="license_number" 
                        class="form-input" 
                        placeholder="Enter license number"
                        value="<?php echo isset($_POST['license_number']) ? htmlspecialchars($_POST['license_number']) : ''; ?>"
                    >
                </div>

                <div class="form-group">
                    <label for="license_expiry">License Expiry</label>
                    <input 
                        type="date" 
                        id="license_expiry" 
                        name="license_expiry" 
                        class="form-input" 
                        value="<?php echo isset($_POST['license_expiry']) ? htmlspecialchars($_POST['license_expiry']) : ''; ?>"
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
                        placeholder="Enter vehicle information"
                        value="<?php echo isset($_POST['vehicle_assigned']) ? htmlspecialchars($_POST['vehicle_assigned']) : ''; ?>"
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
                        value="<?php echo isset($_POST['plate_number']) ? htmlspecialchars($_POST['plate_number']) : ''; ?>"
                    >
                </div>
            </div>
        <?php endif; ?>

        <div class="page-actions" style="margin-top: 30px;">
            <button type="submit" class="btn btn-primary">
                <i class="fas fa-save"></i> Create User
            </button>
            <a href="users.php" class="btn btn-secondary">
                <i class="fas fa-times"></i> Cancel
            </a>
        </div>
    </form>
</div>

<?php include __DIR__ . '/../includes/admin_footer.php'; ?>

