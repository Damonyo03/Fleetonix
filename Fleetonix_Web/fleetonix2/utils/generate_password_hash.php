<?php
/**
 * Utility script to generate password hash
 * Run this once: php utils/generate_password_hash.php
 */

$password = 'admin123';
$hash = password_hash($password, PASSWORD_DEFAULT);

echo "Password: " . $password . "\n";
echo "Hash: " . $hash . "\n";
echo "\n";
echo "SQL Update Statement:\n";
echo "UPDATE users SET password = '" . $hash . "' WHERE email = 'admin@fleetonix.com';\n";
echo "\n";
echo "Or use this in INSERT:\n";
echo "INSERT INTO users (email, password, full_name, user_type, status) \n";
echo "VALUES ('admin@fleetonix.com', '" . $hash . "', 'System Administrator', 'admin', 'active')\n";
echo "ON DUPLICATE KEY UPDATE password = '" . $hash . "';\n";

