<?php
session_start();

// Check if user is in password reset flow
if (!isset($_SESSION['reset_user_id'])) {
    $_SESSION['error'] = 'Please verify OTP first';
    header('Location: forgot_password.php');
    exit;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fleetonix - Reset Password</title>
    <link rel="icon" type="image/jpeg" href="img/logo.jpg">
    <link rel="stylesheet" href="assets/css/style.css">
</head>
<body class="login-body">
    <div class="login-container">
        <!-- Logo Section -->
        <div class="logo-section">
            <img src="img/logo.jpg" alt="Fleetonix Logo" class="logo-main">
        </div>

        <!-- Reset Password Form Card -->
        <div class="login-card">
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
            
            <h2 style="text-align: center; color: var(--text-primary); margin-bottom: 10px;">Reset Password</h2>
            <p style="text-align: center; color: var(--text-secondary); margin-bottom: 10px;">
                <strong>Email: <?php echo htmlspecialchars($_SESSION['reset_user_email']); ?></strong>
            </p>
            <p style="text-align: center; color: var(--text-secondary); margin-bottom: 25px;">
                Enter your new password below.
            </p>
            
            <form id="resetPasswordForm" method="POST" action="includes/reset_password_handler.php">
                <!-- New Password Input -->
                <div class="form-group">
                    <label for="password">New Password</label>
                    <input 
                        type="password" 
                        id="password" 
                        name="password" 
                        class="form-input" 
                        placeholder="Enter new password (min. 16 characters)"
                        required
                        autocomplete="new-password"
                        minlength="16"
                    >
                    <div class="password-requirements" id="passwordRequirements">
                        <small style="color: var(--text-muted); display: block; margin-top: 8px;">Password must contain:</small>
                        <ul class="requirement-list">
                            <li id="req-length" class="requirement-item">At least 16 characters</li>
                            <li id="req-uppercase" class="requirement-item">One uppercase letter (A-Z)</li>
                            <li id="req-lowercase" class="requirement-item">One lowercase letter (a-z)</li>
                            <li id="req-number" class="requirement-item">One number (0-9)</li>
                            <li id="req-special" class="requirement-item">One special character (!@#$%^&*)</li>
                        </ul>
                    </div>
                </div>

                <!-- Confirm Password Input -->
                <div class="form-group">
                    <label for="confirm_password">Confirm New Password</label>
                    <input 
                        type="password" 
                        id="confirm_password" 
                        name="confirm_password" 
                        class="form-input" 
                        placeholder="Confirm new password"
                        required
                        autocomplete="new-password"
                        minlength="16"
                    >
                </div>

                <!-- Submit Button -->
                <button type="submit" class="btn btn-primary">Reset Password</button>

                <!-- Back to Login Button -->
                <button type="button" class="btn btn-secondary" onclick="window.location.href='login.php'">Back to Login</button>
            </form>
        </div>
    </div>

    <script src="assets/js/register.js"></script>
    <script src="assets/js/utils.js"></script>
    <script>
        // Add loading state to form submission
        (function() {
            const form = document.getElementById('resetPasswordForm');
            const submitBtn = form.querySelector('button[type="submit"]');
            
            if (form && submitBtn) {
                form.addEventListener('submit', function(e) {
                    const password = document.getElementById('password').value;
                    const confirmPassword = document.getElementById('confirm_password').value;
                    
                    if (password !== confirmPassword) {
                        e.preventDefault();
                        alert('Passwords do not match. Please try again.');
                        return false;
                    }
                    
                    setButtonLoading(submitBtn, true);
                });
            }
        })();
    </script>
</body>
</html>

