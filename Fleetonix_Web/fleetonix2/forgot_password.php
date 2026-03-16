<?php
session_start();
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fleetonix - Forgot Password</title>
    <link rel="icon" type="image/jpeg" href="img/logo.jpg">
    <link rel="stylesheet" href="assets/css/style.css">
</head>
<body class="login-body">
    <div class="login-container">
        <!-- Logo Section -->
        <div class="logo-section">
            <img src="img/logo.jpg" alt="Fleetonix Logo" class="logo-main">
        </div>

        <!-- Forgot Password Form Card -->
        <div class="login-card">
            <?php if (isset($_SESSION['error'])): ?>
                <div class="alert alert-error">
                    <?php 
                    echo htmlspecialchars($_SESSION['error']); 
                    unset($_SESSION['error']);
                    ?>
                </div>
            <?php endif; ?>
            
            <?php if (isset($_SESSION['info'])): ?>
                <div class="alert alert-info">
                    <?php 
                    echo htmlspecialchars($_SESSION['info']); 
                    unset($_SESSION['info']);
                    ?>
                </div>
            <?php endif; ?>
            
            <h2 style="text-align: center; color: var(--text-primary); margin-bottom: 10px;">Forgot Password</h2>
            <p style="text-align: center; color: var(--text-secondary); margin-bottom: 25px;">
                Enter your email address and we'll send you an OTP code to reset your password.
            </p>
            
            <form id="forgotPasswordForm" method="POST" action="includes/forgot_password_handler.php">
                <!-- Email Input -->
                <div class="form-group">
                    <label for="email">Email</label>
                    <input 
                        type="email" 
                        id="email" 
                        name="email" 
                        class="form-input" 
                        placeholder="Enter your email"
                        required
                        autocomplete="email"
                    >
                </div>

                <!-- Submit Button -->
                <button type="submit" class="btn btn-primary">Send OTP</button>

                <!-- Back to Login Button -->
                <button type="button" class="btn btn-secondary" onclick="window.location.href='login.php'">Back to Login</button>
            </form>
        </div>
    </div>

    <script src="assets/js/utils.js"></script>
    <script>
        // Add loading state to form submission
        (function() {
            const form = document.getElementById('forgotPasswordForm');
            const submitBtn = form.querySelector('button[type="submit"]');
            
            if (form && submitBtn) {
                form.addEventListener('submit', function(e) {
                    setButtonLoading(submitBtn, true);
                });
            }
        })();
    </script>
</body>
</html>

