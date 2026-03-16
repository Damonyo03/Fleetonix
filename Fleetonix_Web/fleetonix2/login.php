<?php
session_start();
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fleetonix - Login</title>
    <link rel="icon" type="image/jpeg" href="img/logo.jpg">
    <link rel="stylesheet" href="assets/css/style.css">
</head>
<body class="login-body">
    <div class="login-container">
        <!-- Logo Section -->
        <div class="logo-section">
            <img src="img/logo.jpg" alt="Fleettonix Logo" class="logo-main">
        </div>

        <!-- Login Form Card -->
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
            
            <form id="loginForm" method="POST" action="includes/login_handler.php">
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

                <!-- Password Input -->
                <div class="form-group">
                    <label for="password">Password</label>
                    <input 
                        type="password" 
                        id="password" 
                        name="password" 
                        class="form-input" 
                        placeholder="Enter your password"
                        required
                        autocomplete="current-password"
                    >
                </div>

                <!-- Remember Me & Forgot Password -->
                <div class="form-options">
                    <label class="checkbox-label">
                        <input type="checkbox" name="remember" id="remember">
                        <span class="checkbox-custom"></span>
                        <span class="checkbox-text">Remember me</span>
                    </label>
                    <a href="forgot_password.php" class="forgot-link">Forgot password?</a>
                </div>

                <!-- Login Button -->
                <button type="submit" class="btn btn-primary">Log in</button>

                <!-- Create Account Button -->
                <button type="button" class="btn btn-secondary" onclick="window.location.href='register.php'">Create an account</button>
            </form>
        </div>
    </div>

    <script src="assets/js/login.js"></script>
</body>
</html>

