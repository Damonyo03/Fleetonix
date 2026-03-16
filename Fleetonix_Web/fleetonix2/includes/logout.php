<?php
/**
 * Fleettonix - Logout Handler
 */

session_start();
session_unset();
session_destroy();

// Clear remember me cookie if exists
if (isset($_COOKIE['remember_token'])) {
    setcookie('remember_token', '', time() - 3600, '/');
}

header('Location: ../login.php');
exit;
?>

