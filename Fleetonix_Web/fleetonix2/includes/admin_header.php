<?php
/**
 * Fleettonix - Admin Header & Sidebar
 * Include this in all admin pages
 */

if (!isset($currentUser)) {
    $currentUser = getCurrentUser();
}

$current_page = basename($_SERVER['PHP_SELF']);
$page_name = pathinfo($current_page, PATHINFO_FILENAME);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fleetonix - Admin<?php echo isset($page_title) ? ' - ' . $page_title : ''; ?></title>
    <link rel="icon" type="image/jpeg" href="<?php echo strpos($_SERVER['REQUEST_URI'], '/admin/') !== false ? '../' : ''; ?>img/logo.jpg">
    <link rel="stylesheet" href="<?php echo strpos($_SERVER['REQUEST_URI'], '/admin/') !== false ? '../' : ''; ?>assets/css/style.css">
    <link rel="stylesheet" href="<?php echo strpos($_SERVER['REQUEST_URI'], '/admin/') !== false ? '../' : ''; ?>assets/css/admin.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
<body>
    <div class="admin-container">
        <!-- Sidebar Navigation -->
        <aside class="admin-sidebar" id="sidebar">
            <div class="sidebar-header">
                <img src="<?php echo strpos($_SERVER['REQUEST_URI'], '/admin/') !== false ? '../' : ''; ?>img/logo.jpg" alt="Logo" class="sidebar-logo">
                <span class="sidebar-title">Fleetonix</span>
            </div>
            <nav class="sidebar-nav">
                <?php $base_path = strpos($_SERVER['REQUEST_URI'], '/admin/') !== false ? '' : 'admin/'; ?>
                <a href="<?php echo $base_path; ?>dashboard.php" class="nav-item <?php echo $page_name == 'dashboard' ? 'active' : ''; ?>">
                    <i class="fas fa-home"></i> Dashboard
                </a>
                <a href="<?php echo $base_path; ?>users.php" class="nav-item <?php echo strpos($_SERVER['REQUEST_URI'], 'user') !== false ? 'active' : ''; ?>">
                    <i class="fas fa-users"></i> User Management
                </a>
                <a href="<?php echo $base_path; ?>drivers.php" class="nav-item <?php echo strpos($_SERVER['REQUEST_URI'], 'driver') !== false ? 'active' : ''; ?>">
                    <i class="fas fa-car"></i> Driver Management
                </a>
                <a href="<?php echo $base_path; ?>clients.php" class="nav-item <?php echo strpos($_SERVER['REQUEST_URI'], 'client') !== false ? 'active' : ''; ?>">
                    <i class="fas fa-building"></i> Client Management
                </a>
                <a href="<?php echo $base_path; ?>bookings.php" class="nav-item <?php echo strpos($_SERVER['REQUEST_URI'], 'booking') !== false ? 'active' : ''; ?>">
                    <i class="fas fa-calendar-check"></i> Bookings
                </a>
                <a href="<?php echo $base_path; ?>schedules.php" class="nav-item <?php echo strpos($_SERVER['REQUEST_URI'], 'schedule') !== false ? 'active' : ''; ?>">
                    <i class="fas fa-calendar-alt"></i> Schedules
                </a>
                <a href="<?php echo $base_path; ?>activity.php" class="nav-item <?php echo strpos($_SERVER['REQUEST_URI'], 'activity') !== false ? 'active' : ''; ?>">
                    <i class="fas fa-history"></i> Activity Logs
                </a>
                <a href="<?php echo $base_path; ?>notifications.php" class="nav-item <?php echo strpos($_SERVER['REQUEST_URI'], 'notification') !== false ? 'active' : ''; ?>">
                    <i class="fas fa-bell"></i> Notifications
                </a>
                <a href="<?php echo strpos($_SERVER['REQUEST_URI'], '/admin/') !== false ? '../' : ''; ?>includes/logout.php" class="nav-item">
                    <i class="fas fa-sign-out-alt"></i> Logout
                </a>
            </nav>
        </aside>

        <!-- Main Content -->
        <main class="admin-main" id="mainContent">
            <!-- Top Header -->
            <header class="admin-header">
                <div class="header-left">
                    <button class="menu-toggle" id="menuToggle">
                        <i class="fas fa-bars"></i>
                    </button>
                    <h2>
                        <?php echo isset($page_title) ? $page_title : 'Admin Dashboard'; ?>
                    </h2>
                </div>
                <div class="header-right">
                    <a href="<?php echo $base_path; ?>notifications.php" class="notification-icon" id="notificationIcon" style="text-decoration: none;">
                        <i class="fas fa-bell"></i>
                        <?php
                        require_once __DIR__ . '/admin_functions.php';
                        $stats = getDashboardStats();
                        if ($stats['unread_notifications'] > 0):
                        ?>
                            <span class="notification-badge"><?php echo $stats['unread_notifications']; ?></span>
                        <?php endif; ?>
                    </a>
                    <a href="<?php echo $base_path; ?>profile.php" class="user-menu" style="text-decoration: none;">
                        <div class="user-avatar">
                            <?php echo strtoupper(substr($currentUser['full_name'], 0, 1)); ?>
                        </div>
                        <span><?php echo htmlspecialchars($currentUser['full_name']); ?></span>
                    </a>
                </div>
            </header>

            <!-- Content Area -->
            <div class="admin-content">

