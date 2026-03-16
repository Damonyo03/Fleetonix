<?php
/**
 * Fleettonix - OTP Helper Functions
 * Handles OTP generation, storage, and email sending
 */

require_once __DIR__ . '/db_connect.php';

/**
 * Generate a 6-digit OTP code
 * @return string 6-digit OTP
 */
function generateOTP() {
    return str_pad(rand(0, 999999), 6, '0', STR_PAD_LEFT);
}

/**
 * Create and store OTP for user
 * @param int $user_id User ID
 * @param string $email User email
 * @return string|false OTP code on success, false on failure
 */
function createOTP($user_id, $email) {
    $conn = getConnection();
    
    try {
        // Invalidate any existing unused OTPs for this user
        $stmt = $conn->prepare("UPDATE otp_codes SET is_used = TRUE WHERE user_id = ? AND is_used = FALSE");
        $stmt->bind_param("i", $user_id);
        $stmt->execute();
        $stmt->close();
        
        // Generate new OTP
        $otp_code = generateOTP();
        
        // Set expiration to 5 minutes from now
        $expires_at = date('Y-m-d H:i:s', strtotime('+5 minutes'));
        
        // Store OTP in database
        $stmt = $conn->prepare("INSERT INTO otp_codes (user_id, otp_code, email, expires_at) VALUES (?, ?, ?, ?)");
        $stmt->bind_param("isss", $user_id, $otp_code, $email, $expires_at);
        $stmt->execute();
        $stmt->close();
        
        $conn->close();
        return $otp_code;
        
    } catch (Exception $e) {
        if (isset($conn)) $conn->close();
        error_log("OTP creation error: " . $e->getMessage());
        return false;
    }
}

/**
 * Verify OTP code
 * @param int $user_id User ID
 * @param string $otp_code OTP code to verify
 * @return array|false Returns OTP data on success, false on failure
 */
function verifyOTP($user_id, $otp_code) {
    $conn = getConnection();
    
    try {
        $stmt = $conn->prepare("SELECT * FROM otp_codes WHERE user_id = ? AND otp_code = ? AND is_used = FALSE ORDER BY created_at DESC LIMIT 1");
        $stmt->bind_param("is", $user_id, $otp_code);
        $stmt->execute();
        $result = $stmt->get_result();
        
        if ($result->num_rows === 0) {
            $stmt->close();
            $conn->close();
            return false;
        }
        
        $otp_data = $result->fetch_assoc();
        $stmt->close();
        
        // Check if OTP has expired
        $now = new DateTime();
        $expires_at = new DateTime($otp_data['expires_at']);
        
        if ($now > $expires_at) {
            $conn->close();
            return false; // OTP expired
        }
        
        // Mark OTP as used
        $stmt = $conn->prepare("UPDATE otp_codes SET is_used = TRUE WHERE id = ?");
        $stmt->bind_param("i", $otp_data['id']);
        $stmt->execute();
        $stmt->close();
        
        $conn->close();
        return $otp_data;
        
    } catch (Exception $e) {
        if (isset($conn)) $conn->close();
        error_log("OTP verification error: " . $e->getMessage());
        return false;
    }
}

/**
 * Clean up expired OTPs (optional cleanup function)
 */
function cleanupExpiredOTPs() {
    $conn = getConnection();
    
    try {
        $stmt = $conn->prepare("DELETE FROM otp_codes WHERE expires_at < NOW() AND is_used = FALSE");
        $stmt->execute();
        $stmt->close();
        $conn->close();
    } catch (Exception $e) {
        if (isset($conn)) $conn->close();
        error_log("OTP cleanup error: " . $e->getMessage());
    }
}

