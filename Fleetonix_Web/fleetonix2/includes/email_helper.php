<?php
/**
 * Fleetonix - Email Helper Functions
 * Handles email sending using PHPMailer
 */

// PHPMailer will be installed via Composer
// If not using Composer, download PHPMailer and include it manually
// For now, we'll use a simple approach that works with XAMPP

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

// Check if PHPMailer is available via Composer
$composer_autoload = __DIR__ . '/../vendor/autoload.php';
if (file_exists($composer_autoload)) {
    require_once $composer_autoload;
} else {
    // Fallback: Manual PHPMailer inclusion (if downloaded manually)
    // You can download PHPMailer from: https://github.com/PHPMailer/PHPMailer
    // And place it in: includes/PHPMailer/
    $phpmailer_path = __DIR__ . '/PHPMailer/src/Exception.php';
    if (file_exists($phpmailer_path)) {
        require_once __DIR__ . '/PHPMailer/src/Exception.php';
        require_once __DIR__ . '/PHPMailer/src/PHPMailer.php';
        require_once __DIR__ . '/PHPMailer/src/SMTP.php';
    } else {
        // If PHPMailer is not found, we'll use basic mail() function as fallback
        // This is less reliable but will work for basic setups
    }
}

/**
 * Send OTP email to user
 * @param string $to_email Recipient email
 * @param string $otp_code 6-digit OTP code
 * @param string $user_name User's name
 * @return bool True on success, false on failure
 */
function sendOTPEmail($to_email, $otp_code, $user_name = 'User') {
    // Email configuration
    $from_email = 'jettsmart101@gmail.com';
    $from_name = 'Fleetonix';
    $smtp_host = 'smtp.gmail.com';
    $smtp_port = 587;
    $smtp_username = 'jettsmart101@gmail.com';
    $smtp_password = 'smwd dpqt aesz jtaf'; // App password
    
    // Check if PHPMailer is available
    if (class_exists('PHPMailer\PHPMailer\PHPMailer')) {
        try {
            $mail = new PHPMailer(true);
            
            // Server settings
            $mail->isSMTP();
            $mail->Host = $smtp_host;
            $mail->SMTPAuth = true;
            $mail->Username = $smtp_username;
            $mail->Password = $smtp_password;
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS; // Use TLS
            $mail->Port = $smtp_port;
            $mail->CharSet = 'UTF-8';
            
            // Recipients
            $mail->setFrom($from_email, $from_name);
            $mail->addAddress($to_email, $user_name);
            
            // Content
            $mail->isHTML(true);
            $mail->Subject = 'Your Fleetonix Login OTP Code';
            
            $mail->Body = "
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset='UTF-8'>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: #1a1a2e; color: #fff; padding: 20px; text-align: center; }
                        .content { background: #f4f4f4; padding: 30px; }
                        .otp-box { background: #fff; border: 2px solid #0f3460; padding: 20px; text-align: center; margin: 20px 0; }
                        .otp-code { font-size: 32px; font-weight: bold; color: #0f3460; letter-spacing: 5px; }
                        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
                    </style>
                </head>
                <body>
                    <div class='container'>
                        <div class='header'>
                            <h1>Fleetonix</h1>
                        </div>
                        <div class='content'>
                            <h2>Your Login Verification Code</h2>
                            <p>Hello {$user_name},</p>
                            <p>You have requested to login to your Fleetonix account. Please use the following One-Time Password (OTP) to complete your login:</p>
                            
                            <div class='otp-box'>
                                <p style='margin: 0; color: #666;'>Your OTP Code:</p>
                                <div class='otp-code'>{$otp_code}</div>
                            </div>
                            
                            <p><strong>This code will expire in 5 minutes.</strong></p>
                            <p>If you did not request this code, please ignore this email or contact support if you have concerns.</p>
                            
                            <p>For security reasons, never share this code with anyone.</p>
                        </div>
                        <div class='footer'>
                            <p>This is an automated message from Fleetonix. Please do not reply to this email.</p>
                            <p>&copy; " . date('Y') . " Fleetonix. All rights reserved.</p>
                        </div>
                    </div>
                </body>
                </html>
            ";
            
            $mail->AltBody = "Hello {$user_name},\n\nYour Fleetonix login OTP code is: {$otp_code}\n\nThis code will expire in 5 minutes.\n\nIf you did not request this code, please ignore this email.\n\nFleetonix";
            
            $mail->send();
            return true;
            
        } catch (Exception $e) {
            error_log("Email sending failed: " . $mail->ErrorInfo);
            return false;
        }
    } else {
        // Fallback to basic mail() function if PHPMailer is not available
        $subject = 'Your Fleetonix Login OTP Code';
        $message = "Hello {$user_name},\n\nYour Fleetonix login OTP code is: {$otp_code}\n\nThis code will expire in 5 minutes.\n\nIf you did not request this code, please ignore this email.\n\nFleetonix";
        $headers = "From: {$from_name} <{$from_email}>\r\n";
        $headers .= "Reply-To: {$from_email}\r\n";
        $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
        
        return mail($to_email, $subject, $message, $headers);
    }
}

/**
 * Send Password Reset OTP email to user
 * @param string $to_email Recipient email
 * @param string $otp_code 6-digit OTP code
 * @param string $user_name User's name
 * @return bool True on success, false on failure
 */
function sendPasswordResetOTPEmail($to_email, $otp_code, $user_name = 'User') {
    // Email configuration
    $from_email = 'jettsmart101@gmail.com';
    $from_name = 'Fleetonix';
    $smtp_host = 'smtp.gmail.com';
    $smtp_port = 587;
    $smtp_username = 'jettsmart101@gmail.com';
    $smtp_password = 'smwd dpqt aesz jtaf'; // App password
    
    // Check if PHPMailer is available
    if (class_exists('PHPMailer\PHPMailer\PHPMailer')) {
        try {
            $mail = new PHPMailer(true);
            
            // Server settings
            $mail->isSMTP();
            $mail->Host = $smtp_host;
            $mail->SMTPAuth = true;
            $mail->Username = $smtp_username;
            $mail->Password = $smtp_password;
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS; // Use TLS
            $mail->Port = $smtp_port;
            $mail->CharSet = 'UTF-8';
            
            // Recipients
            $mail->setFrom($from_email, $from_name);
            $mail->addAddress($to_email, $user_name);
            
            // Content
            $mail->isHTML(true);
            $mail->Subject = 'Your Fleetonix Password Reset OTP Code';
            
            $mail->Body = "
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset='UTF-8'>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: #1a1a2e; color: #fff; padding: 20px; text-align: center; }
                        .content { background: #f4f4f4; padding: 30px; }
                        .otp-box { background: #fff; border: 2px solid #0f3460; padding: 20px; text-align: center; margin: 20px 0; }
                        .otp-code { font-size: 32px; font-weight: bold; color: #0f3460; letter-spacing: 5px; }
                        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
                    </style>
                </head>
                <body>
                    <div class='container'>
                        <div class='header'>
                            <h1>Fleetonix</h1>
                        </div>
                        <div class='content'>
                            <h2>Password Reset Verification Code</h2>
                            <p>Hello {$user_name},</p>
                            <p>You have requested to reset your password for your Fleetonix account. Please use the following One-Time Password (OTP) to verify your identity:</p>
                            
                            <div class='otp-box'>
                                <p style='margin: 0; color: #666;'>Your OTP Code:</p>
                                <div class='otp-code'>{$otp_code}</div>
                            </div>
                            
                            <p><strong>This code will expire in 5 minutes.</strong></p>
                            <p>If you did not request a password reset, please ignore this email or contact support if you have concerns.</p>
                            
                            <p>For security reasons, never share this code with anyone.</p>
                        </div>
                        <div class='footer'>
                            <p>This is an automated message from Fleetonix. Please do not reply to this email.</p>
                            <p>&copy; " . date('Y') . " Fleetonix. All rights reserved.</p>
                        </div>
                    </div>
                </body>
                </html>
            ";
            
            $mail->AltBody = "Hello {$user_name},\n\nYour Fleetonix password reset OTP code is: {$otp_code}\n\nThis code will expire in 5 minutes.\n\nIf you did not request a password reset, please ignore this email.\n\nFleetonix";
            
            $mail->send();
            return true;
            
        } catch (Exception $e) {
            error_log("Email sending failed: " . $mail->ErrorInfo);
            return false;
        }
    } else {
        // Fallback to basic mail() function if PHPMailer is not available
        $subject = 'Your Fleetonix Password Reset OTP Code';
        $message = "Hello {$user_name},\n\nYour Fleetonix password reset OTP code is: {$otp_code}\n\nThis code will expire in 5 minutes.\n\nIf you did not request a password reset, please ignore this email.\n\nFleetonix";
        $headers = "From: {$from_name} <{$from_email}>\r\n";
        $headers .= "Reply-To: {$from_email}\r\n";
        $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
        
        return mail($to_email, $subject, $message, $headers);
    }
}

