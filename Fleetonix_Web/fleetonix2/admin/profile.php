<?php
/**
 * Fleettonix - Admin Profile Edit
 */

session_start();
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/admin_functions.php';
require_once __DIR__ . '/../includes/db_connect.php';

// Require admin access
requireUserType('admin');

$currentUser = getCurrentUser();
$user_id = $currentUser['id'];

// Get user info
$user = getUserById($user_id);
if (!$user) {
    $_SESSION['error'] = 'User not found';
    header('Location: dashboard.php');
    exit;
}

$page_title = 'My Profile';

// Include header
include __DIR__ . '/../includes/admin_header.php';
?>

<div class="page-header">
    <h1 class="page-title">My Profile</h1>
    <p class="page-subtitle">Update your account information</p>
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

    <form method="POST" action="profile_handler.php" id="profileForm">
        <input type="hidden" name="user_id" value="<?php echo $user['id']; ?>">
        
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
                    placeholder="09XX XXX XXXX"
                >
            </div>
        </div>

        <hr style="margin: 30px 0; border: none; border-top: 1px solid var(--border-color);">

        <h3 style="margin-bottom: 20px; color: var(--text-primary);">Change Password</h3>
        <p style="margin-bottom: 20px; color: var(--text-secondary); font-size: 0.9rem;">
            Leave blank if you don't want to change your password
        </p>

        <div class="form-row">
            <div class="form-group">
                <label for="current_password">Current Password</label>
                <input 
                    type="password" 
                    id="current_password" 
                    name="current_password" 
                    class="form-input"
                    placeholder="Enter current password to change"
                >
            </div>
        </div>

        <div class="form-row">
            <div class="form-group">
                <label for="new_password">New Password</label>
                <input 
                    type="password" 
                    id="new_password" 
                    name="new_password" 
                    class="form-input"
                    minlength="16"
                    placeholder="Minimum 16 characters"
                >
                <small style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 5px; display: block;">
                    Must be at least 16 characters with uppercase, lowercase, number, and special character
                </small>
            </div>

            <div class="form-group">
                <label for="confirm_password">Confirm New Password</label>
                <input 
                    type="password" 
                    id="confirm_password" 
                    name="confirm_password" 
                    class="form-input"
                    minlength="16"
                    placeholder="Re-enter new password"
                >
            </div>
        </div>

        <div class="page-actions" style="margin-top: 30px;">
            <button type="submit" class="btn btn-primary" id="submitBtn">
                <i class="fas fa-save"></i> Update Profile
            </button>
            <a href="dashboard.php" class="btn btn-secondary">
                <i class="fas fa-times"></i> Cancel
            </a>
        </div>
    </form>
</div>

<script>
// Add loading state to form submission
(function() {
    const profileForm = document.getElementById('profileForm');
    const submitBtn = document.getElementById('submitBtn');
    
    if (profileForm && submitBtn) {
        profileForm.addEventListener('submit', function(e) {
            const newPassword = document.getElementById('new_password').value;
            const confirmPassword = document.getElementById('confirm_password').value;
            const currentPassword = document.getElementById('current_password').value;
            
            // Validate password if trying to change
            if (newPassword || confirmPassword || currentPassword) {
                if (!currentPassword) {
                    e.preventDefault();
                    alert('Please enter your current password to change it.');
                    return false;
                }
                
                if (newPassword && newPassword.length < 16) {
                    e.preventDefault();
                    alert('New password must be at least 16 characters long.');
                    return false;
                }
                
                if (newPassword !== confirmPassword) {
                    e.preventDefault();
                    alert('New password and confirm password do not match.');
                    return false;
                }
            }
            
            setButtonLoading(submitBtn, true);
        });
    }
})();
</script>

<?php include __DIR__ . '/../includes/admin_footer.php'; ?>

