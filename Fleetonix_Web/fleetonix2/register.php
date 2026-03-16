<?php
session_start();
require_once __DIR__ . '/includes/db_connect.php';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fleetonix - Create Account</title>
    <link rel="icon" type="image/jpeg" href="img/logo.jpg">
    <link rel="stylesheet" href="assets/css/style.css">
</head>
<body class="login-body">
    <div class="login-container">
        <!-- Logo Section -->
        <div class="logo-section">
            <img src="img/logo.jpg" alt="Fleettonix Logo" class="logo-main">
        </div>

        <!-- Registration Form Card -->
        <div class="login-card">
            <h2 style="text-align: center; margin-bottom: 25px; color: var(--text-primary);">Create Account</h2>
            
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
            
            <form id="registerForm" method="POST" action="includes/register_handler.php">
                <!-- Full Name Input -->
                <div class="form-group">
                    <label for="full_name">Full Name</label>
                    <input 
                        type="text" 
                        id="full_name" 
                        name="full_name" 
                        class="form-input" 
                        placeholder="Enter your full name"
                        required
                        autocomplete="name"
                    >
                </div>

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

                <!-- Phone Input -->
                <div class="form-group">
                    <label for="phone">Phone Number</label>
                    <input 
                        type="tel" 
                        id="phone" 
                        name="phone" 
                        class="form-input" 
                        placeholder="Enter your phone number"
                        autocomplete="tel"
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
                        placeholder="Create a password (min. 16 characters)"
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
                    <label for="confirm_password">Confirm Password</label>
                    <input 
                        type="password" 
                        id="confirm_password" 
                        name="confirm_password" 
                        class="form-input" 
                        placeholder="Confirm your password"
                        required
                        autocomplete="new-password"
                        minlength="16"
                    >
                </div>

                <!-- Company Name Input -->
                <div class="form-group">
                    <label for="company_name">Company Name</label>
                    <input 
                        type="text" 
                        id="company_name" 
                        name="company_name" 
                        class="form-input" 
                        placeholder="Enter your company name"
                        required
                    >
                </div>

                <!-- Hidden field - All registrations are for clients -->
                <input type="hidden" name="user_type" value="client">

                <!-- Submit Button -->
                <button type="submit" class="btn btn-primary">Create Account</button>

                <!-- Back to Login Button -->
                <button type="button" class="btn btn-secondary" onclick="window.location.href='login.php'">Back to Login</button>
            </form>
        </div>
    </div>

    <script src="assets/js/register.js"></script>
</body>
</html>

