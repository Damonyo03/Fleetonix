<?php
/**
 * Fleettonix - Client Header & Sidebar
 * Include this in all client pages
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
    <title>Fleetonix - Client<?php echo isset($page_title) ? ' - ' . $page_title : ''; ?></title>
    <link rel="icon" type="image/jpeg" href="<?php echo strpos($_SERVER['REQUEST_URI'], '/client/') !== false ? '../' : ''; ?>img/logo.jpg">
    <link rel="stylesheet" href="<?php echo strpos($_SERVER['REQUEST_URI'], '/client/') !== false ? '../' : ''; ?>assets/css/style.css">
    <link rel="stylesheet" href="<?php echo strpos($_SERVER['REQUEST_URI'], '/client/') !== false ? '../' : ''; ?>assets/css/admin.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
<body>
    <div class="admin-container">
        <!-- Sidebar Navigation -->
        <aside class="admin-sidebar" id="sidebar">
            <div class="sidebar-header">
                <img src="<?php echo strpos($_SERVER['REQUEST_URI'], '/client/') !== false ? '../' : ''; ?>img/logo.jpg" alt="Logo" class="sidebar-logo">
                <span class="sidebar-title">Fleetonix</span>
            </div>
            <nav class="sidebar-nav">
                <?php $base_path = strpos($_SERVER['REQUEST_URI'], '/client/') !== false ? '' : 'client/'; ?>
                <a href="<?php echo $base_path; ?>dashboard.php" class="nav-item <?php echo $page_name == 'dashboard' ? 'active' : ''; ?>">
                    <i class="fas fa-home"></i> Dashboard
                </a>
                <a href="<?php echo $base_path; ?>bookings.php" class="nav-item <?php echo strpos($_SERVER['REQUEST_URI'], 'booking') !== false ? 'active' : ''; ?>">
                    <i class="fas fa-calendar-check"></i> My Bookings
                </a>
                <a href="<?php echo $base_path; ?>schedules.php" class="nav-item <?php echo strpos($_SERVER['REQUEST_URI'], 'schedule') !== false ? 'active' : ''; ?>">
                    <i class="fas fa-calendar-alt"></i> Active Schedules
                </a>
                <a href="<?php echo $base_path; ?>notifications.php" class="nav-item <?php echo strpos($_SERVER['REQUEST_URI'], 'notification') !== false ? 'active' : ''; ?>">
                    <i class="fas fa-bell"></i> Notifications
                </a>
                <a href="<?php echo strpos($_SERVER['REQUEST_URI'], '/client/') !== false ? '../' : ''; ?>includes/logout.php" class="nav-item">
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
                        <?php echo isset($page_title) ? $page_title : 'Client Dashboard'; ?>
                    </h2>
                </div>
                <div class="header-right">
                    <a href="<?php echo $base_path; ?>notifications.php" class="notification-icon" id="notificationIcon" style="text-decoration: none;">
                        <i class="fas fa-bell"></i>
                        <?php
                        require_once __DIR__ . '/db_connect.php';
                        $conn = getConnection();
                        $user_id = $_SESSION['user_id'];
                        $stmt = $conn->prepare("SELECT COUNT(*) as unread FROM notifications WHERE user_id = ? AND is_read = FALSE");
                        $stmt->bind_param("i", $user_id);
                        $stmt->execute();
                        $result = $stmt->get_result();
                        $unread = $result->fetch_assoc()['unread'];
                        $stmt->close();
                        $conn->close();
                        if ($unread > 0):
                        ?>
                            <span class="notification-badge"><?php echo $unread; ?></span>
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

