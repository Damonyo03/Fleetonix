    <?php
    /**
     * Fleettonix - Edit Schedule
     */

    session_start();
    require_once __DIR__ . '/../includes/auth.php';
    require_once __DIR__ . '/../includes/admin_functions.php';
    require_once __DIR__ . '/../includes/db_connect.php';

    // Require admin access
    requireUserType('admin');

    $currentUser = getCurrentUser();
    $schedule_id = isset($_GET['id']) ? (int)$_GET['id'] : 0;

    if (!$schedule_id) {
        $_SESSION['error'] = 'Invalid schedule ID';
        header('Location: schedules.php');
        exit;
    }

    $conn = getConnection();

    // Get schedule info
    $stmt = $conn->prepare("
        SELECT s.*, d.user_id as driver_user_id, u_driver.full_name as driver_name
        FROM schedules s
        JOIN drivers d ON s.driver_id = d.id
        JOIN users u_driver ON d.user_id = u_driver.id
        WHERE s.id = ?
    ");
    $stmt->bind_param("i", $schedule_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $schedule = $result->fetch_assoc();
    $stmt->close();

    if (!$schedule) {
        $_SESSION['error'] = 'Schedule not found';
        $conn->close();
        header('Location: schedules.php');
        exit;
    }

    // Get drivers - if schedule has pickup location, sort by nearest distance
    if (!empty($schedule['pickup_latitude']) && !empty($schedule['pickup_longitude'])) {
        $all_drivers = getNearestDrivers(
            (float)$schedule['pickup_latitude'],
            (float)$schedule['pickup_longitude']
        );
        // Filter to only active users
        $all_drivers = array_filter($all_drivers, function($driver) {
            return $driver['user_status'] === 'active';
        });
    } else {
        // Fallback to regular list if no pickup location
        $all_drivers = getAllDrivers();
        $all_drivers = array_filter($all_drivers, function($driver) {
            return $driver['user_status'] === 'active';
        });
    }

    // If form submitted
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $driver_id = isset($_POST['driver_id']) ? (int)$_POST['driver_id'] : 0;
        $scheduled_date = isset($_POST['scheduled_date']) ? trim($_POST['scheduled_date']) : '';
        $scheduled_time = isset($_POST['scheduled_time']) ? trim($_POST['scheduled_time']) : '';
        $status = isset($_POST['status']) ? trim($_POST['status']) : '';
        
        if (empty($driver_id) || empty($scheduled_date) || empty($scheduled_time) || empty($status)) {
            $_SESSION['error'] = 'Please fill in all required fields';
        } else {
            $stmt = $conn->prepare("
                UPDATE schedules 
                SET driver_id = ?, scheduled_date = ?, scheduled_time = ?, status = ?
                WHERE id = ?
            ");
            $stmt->bind_param("isssi", $driver_id, $scheduled_date, $scheduled_time, $status, $schedule_id);
            
            if ($stmt->execute()) {
                $_SESSION['success'] = 'Schedule updated successfully!';
                $stmt->close();
                $conn->close();
                header('Location: schedule_view.php?id=' . $schedule_id);
                exit;
            } else {
                $_SESSION['error'] = 'Failed to update schedule. Please try again.';
                $stmt->close();
            }
        }
    }

    $conn->close();

    $page_title = 'Edit Schedule #' . $schedule_id;

    // Include header
    include __DIR__ . '/../includes/admin_header.php';
    ?>

    <div class="page-header">
        <h1 class="page-title">Edit Schedule</h1>
        <p class="page-subtitle">Update schedule #<?php echo $schedule_id; ?></p>
    </div>

    <div class="form-card">
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

        <form method="POST" action="">
            <div class="form-group">
                <label for="driver_id">Driver * 
                    <?php if (!empty($schedule['pickup_latitude']) && !empty($schedule['pickup_longitude'])): ?>
                        <small style="color: var(--text-muted); font-weight: normal;">(Sorted by nearest to pickup location)</small>
                    <?php endif; ?>
                </label>
                <select id="driver_id" name="driver_id" class="form-input" required>
                    <option value="">-- Select Driver --</option>
                    <?php foreach ($all_drivers as $driver): ?>
                        <option value="<?php echo $driver['id']; ?>" <?php echo $driver['id'] == $schedule['driver_id'] ? 'selected' : ''; ?>>
                            <?php echo htmlspecialchars($driver['full_name']); ?>
                            <?php if ($driver['vehicle_assigned']): ?>
                                - <?php echo htmlspecialchars($driver['vehicle_assigned']); ?>
                            <?php endif; ?>
                            <?php if (isset($driver['distance_km'])): ?>
                                - <?php echo number_format($driver['distance_km'], 2); ?> km away
                            <?php endif; ?>
                        </option>
                    <?php endforeach; ?>
                </select>
                <?php if (!empty($schedule['pickup_latitude']) && !empty($schedule['pickup_longitude'])): ?>
                    <small style="color: var(--text-muted); display: block; margin-top: 5px;">
                        <i class="fas fa-info-circle"></i> Drivers are sorted by distance from pickup location.
                    </small>
                <?php endif; ?>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label for="scheduled_date">Scheduled Date *</label>
                    <input 
                        type="date" 
                        id="scheduled_date" 
                        name="scheduled_date" 
                        class="form-input" 
                        required
                        value="<?php echo $schedule['scheduled_date']; ?>"
                    >
                </div>

                <div class="form-group">
                    <label for="scheduled_time">Scheduled Time *</label>
                    <input 
                        type="time" 
                        id="scheduled_time" 
                        name="scheduled_time" 
                        class="form-input" 
                        required
                        value="<?php echo date('H:i', strtotime($schedule['scheduled_time'])); ?>"
                    >
                </div>
            </div>

            <div class="form-group">
                <label for="status">Status *</label>
                <select id="status" name="status" class="form-input" required>
                    <option value="pending" <?php echo $schedule['status'] === 'pending' ? 'selected' : ''; ?>>Pending</option>
                    <option value="started" <?php echo $schedule['status'] === 'started' ? 'selected' : ''; ?>>Started</option>
                    <option value="in_progress" <?php echo $schedule['status'] === 'in_progress' ? 'selected' : ''; ?>>In Progress</option>
                    <option value="completed" <?php echo $schedule['status'] === 'completed' ? 'selected' : ''; ?>>Completed</option>
                    <option value="cancelled" <?php echo $schedule['status'] === 'cancelled' ? 'selected' : ''; ?>>Cancelled</option>
                </select>
            </div>

            <div class="page-actions" style="margin-top: 30px;">
                <button type="submit" class="btn btn-primary">
                    <i class="fas fa-save"></i> Update Schedule
                </button>
                <a href="schedule_view.php?id=<?php echo $schedule_id; ?>" class="btn btn-secondary">
                    <i class="fas fa-times"></i> Cancel
                </a>
            </div>
        </form>
    </div>

    <?php include __DIR__ . '/../includes/admin_footer.php'; ?>

