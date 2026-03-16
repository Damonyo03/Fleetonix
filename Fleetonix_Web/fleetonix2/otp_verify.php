<?php
session_start();

// Check if user is in OTP verification flow
if (!isset($_SESSION['otp_user_id'])) {
    $_SESSION['error'] = 'Please login first';
    header('Location: login.php');
    exit;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fleetonix - Verify OTP</title>
    <link rel="icon" type="image/jpeg" href="img/logo.jpg">
    <link rel="stylesheet" href="assets/css/style.css">
    <style>
        .otp-container {
            max-width: 400px;
            margin: 50px auto;
        }
        .otp-input-group {
            display: flex;
            gap: 10px;
            justify-content: center;
            margin: 30px 0;
        }
        .otp-input {
            width: 50px;
            height: 60px;
            text-align: center;
            font-size: 24px;
            font-weight: bold;
            border: 2px solid var(--border-color);
            border-radius: 8px;
            background: var(--bg-input);
            color: var(--text-primary);
        }
        .otp-input:focus {
            border-color: var(--accent-blue);
            outline: none;
        }
        .otp-info {
            text-align: center;
            color: var(--text-secondary);
            margin: 20px 0;
        }
        .resend-link {
            text-align: center;
            margin-top: 20px;
        }
        .resend-link a {
            color: var(--accent-blue);
            text-decoration: none;
        }
        .resend-link a:hover {
            text-decoration: underline;
        }
        .countdown {
            color: var(--accent-orange);
            font-weight: bold;
        }
    </style>
</head>
<body class="login-body">
    <div class="login-container">
        <!-- Logo Section -->
        <div class="logo-section">
            <img src="img/logo.jpg" alt="Fleettonix Logo" class="logo-main">
        </div>

        <!-- OTP Verification Card -->
        <div class="login-card otp-container">
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
            
            <h2 style="text-align: center; color: var(--text-primary); margin-bottom: 10px;">Verify Your Email</h2>
            <p class="otp-info">
                We've sent a 6-digit OTP code to<br>
                <strong><?php echo htmlspecialchars($_SESSION['otp_user_email']); ?></strong>
            </p>
            <p class="otp-info">
                This code will expire in <span class="countdown" id="countdown">5:00</span>
            </p>
            
            <form id="otpForm" method="POST" action="includes/otp_verify_handler.php">
                <div class="otp-input-group">
                    <input type="text" class="otp-input" name="otp[]" maxlength="1" pattern="[0-9]" required autocomplete="off">
                    <input type="text" class="otp-input" name="otp[]" maxlength="1" pattern="[0-9]" required autocomplete="off">
                    <input type="text" class="otp-input" name="otp[]" maxlength="1" pattern="[0-9]" required autocomplete="off">
                    <input type="text" class="otp-input" name="otp[]" maxlength="1" pattern="[0-9]" required autocomplete="off">
                    <input type="text" class="otp-input" name="otp[]" maxlength="1" pattern="[0-9]" required autocomplete="off">
                    <input type="text" class="otp-input" name="otp[]" maxlength="1" pattern="[0-9]" required autocomplete="off">
                </div>
                
                <button type="submit" class="btn btn-primary" style="width: 100%;">Verify OTP</button>
            </form>
            
            <div class="resend-link">
                <p>Didn't receive the code? <a href="includes/resend_otp.php" id="resendLink">Resend OTP</a></p>
            </div>
            
            <div style="text-align: center; margin-top: 20px;">
                <a href="login.php" style="color: var(--text-secondary); text-decoration: none;">Back to Login</a>
            </div>
        </div>
    </div>

    <script src="assets/js/otp_verify.js"></script>
</body>
</html>

