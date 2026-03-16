<?php
/**
 * Fleettonix - Admin Dashboard
 */

session_start();
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/admin_functions.php';

// Require admin access
requireUserType('admin');

$currentUser = getCurrentUser();
$page_title = 'Dashboard';

// Get dashboard statistics
try {
    $stats = getDashboardStats();
    $recentBookings = getRecentBookings(5);
    $recentActivities = getRecentActivities(10);
    
    // Group activities by schedule_id for completed trips
    $completed_schedules = [];
    $other_activities = [];
    $completed_schedule_ids = [];
    
    // First pass: identify completed schedules
    foreach ($recentActivities as $activity) {
        if ($activity['activity_type'] === 'schedule_completed' && $activity['schedule_id']) {
            $schedule_id = $activity['schedule_id'];
            $completed_schedule_ids[] = $schedule_id;
            if (!isset($completed_schedules[$schedule_id])) {
                $completed_schedules[$schedule_id] = [
                    'main' => $activity,
                    'sub' => []
                ];
            }
        }
    }
    
    // Second pass: group activities by schedule
    foreach ($recentActivities as $activity) {
        if ($activity['activity_type'] === 'schedule_completed' && $activity['schedule_id']) {
            // Already handled in first pass
            continue;
        } elseif ($activity['schedule_id'] && in_array($activity['schedule_id'], $completed_schedule_ids)) {
            // This activity belongs to a completed schedule
            $schedule_id = $activity['schedule_id'];
            $completed_schedules[$schedule_id]['sub'][] = $activity;
        } else {
            // This is a standalone activity (not part of a completed trip)
            $other_activities[] = $activity;
        }
    }
    
    // Sort sub-activities by time for each completed schedule
    foreach ($completed_schedules as $schedule_id => $group) {
        usort($completed_schedules[$schedule_id]['sub'], function($a, $b) {
            return strtotime($a['created_at']) - strtotime($b['created_at']);
        });
    }
    
    // Limit to 5 items for display (prioritize completed trips, then other activities)
    $display_items = [];
    $count = 0;
    foreach ($completed_schedules as $schedule_id => $group) {
        if ($count >= 5) break;
        $display_items[] = ['type' => 'completed', 'schedule_id' => $schedule_id, 'group' => $group];
        $count++;
    }
    foreach ($other_activities as $activity) {
        if ($count >= 5) break;
        $display_items[] = ['type' => 'other', 'activity' => $activity];
        $count++;
    }
} catch (Exception $e) {
    // If there's an error, set defaults
    $stats = [
        'total_drivers' => 0,
        'active_drivers' => 0,
        'total_clients' => 0,
        'pending_bookings' => 0,
        'active_schedules' => 0,
        'today_completed' => 0,
        'unread_notifications' => 0
    ];
    $recentBookings = [];
    $display_items = [];
}

// Include header
include __DIR__ . '/../includes/admin_header.php';
?>

<div class="page-header">
    <h1 class="page-title">Dashboard Overview</h1>
    <p class="page-subtitle">Welcome back, <?php echo htmlspecialchars($currentUser['full_name']); ?>! Here's what's happening with your fleet.</p>
</div>

<!-- Statistics Cards -->
<div class="stats-grid">
    <div class="stat-card">
        <div class="stat-header">
            <span class="stat-title">Total Drivers</span>
            <div class="stat-icon blue">
                <i class="fas fa-car"></i>
            </div>
        </div>
        <div class="stat-value"><?php echo $stats['total_drivers']; ?></div>
        <div class="stat-change"><?php echo $stats['active_drivers']; ?> active</div>
    </div>

    <div class="stat-card">
        <div class="stat-header">
            <span class="stat-title">Total Clients</span>
            <div class="stat-icon teal">
                <i class="fas fa-building"></i>
            </div>
        </div>
        <div class="stat-value"><?php echo $stats['total_clients']; ?></div>
        <div class="stat-change">Registered companies</div>
    </div>

    <div class="stat-card">
        <div class="stat-header">
            <span class="stat-title">Pending Bookings</span>
            <div class="stat-icon blue">
                <i class="fas fa-calendar-check"></i>
            </div>
        </div>
        <div class="stat-value"><?php echo $stats['pending_bookings']; ?></div>
        <div class="stat-change">Awaiting approval</div>
    </div>

    <div class="stat-card">
        <div class="stat-header">
            <span class="stat-title">Active Schedules</span>
            <div class="stat-icon green">
                <i class="fas fa-calendar-alt"></i>
            </div>
        </div>
        <div class="stat-value"><?php echo $stats['active_schedules']; ?></div>
        <div class="stat-change">In progress</div>
    </div>

    <div class="stat-card">
        <div class="stat-header">
            <span class="stat-title">Today's Completed</span>
            <div class="stat-icon green">
                <i class="fas fa-check-circle"></i>
            </div>
        </div>
        <div class="stat-value"><?php echo $stats['today_completed']; ?></div>
        <div class="stat-change">Trips completed today</div>
    </div>

    <div class="stat-card">
        <div class="stat-header">
            <span class="stat-title">Notifications</span>
            <div class="stat-icon teal">
                <i class="fas fa-bell"></i>
            </div>
        </div>
        <div class="stat-value"><?php echo $stats['unread_notifications']; ?></div>
        <div class="stat-change">Unread notifications</div>
    </div>
</div>

<!-- Quick Actions -->
<div class="page-actions">
    <a href="user_add.php?type=driver" class="btn btn-primary">
        <i class="fas fa-plus"></i> Add Driver
    </a>
    <a href="user_add.php?type=client" class="btn btn-primary">
        <i class="fas fa-plus"></i> Add Client
    </a>
    <a href="user_add.php?type=admin" class="btn btn-secondary">
        <i class="fas fa-user-shield"></i> Add Admin
    </a>
    <a href="bookings.php?status=pending" class="btn btn-secondary">
        <i class="fas fa-eye"></i> View Pending Bookings
    </a>
</div>

<!-- Live Driver Locations Map -->
<div class="data-table-wrapper" style="margin-top: 30px;">
    <div class="table-header">
        <h3 class="table-title">Live Driver Locations</h3>
        <span id="map-update-status" style="color: var(--text-muted); font-size: 0.9em;">Updating...</span>
    </div>
    <div id="drivers-map" style="width: 100%; height: 500px; border-radius: 8px; overflow: hidden; background: var(--bg-secondary);"></div>
    <div id="drivers-legend" style="margin-top: 15px; display: flex; gap: 20px; flex-wrap: wrap; font-size: 0.9em; color: var(--text-secondary);"></div>
</div>

<!-- Recent Bookings & Activity -->
<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px; margin-top: 30px;">
    <!-- Recent Bookings -->
    <div class="data-table-wrapper">
        <div class="table-header">
            <h3 class="table-title">Recent Bookings</h3>
            <a href="bookings.php" class="btn-icon view">View All</a>
        </div>
        <?php if (empty($recentBookings)): ?>
            <div class="empty-state">
                <div class="empty-state-icon"><i class="fas fa-calendar-times"></i></div>
                <div class="empty-state-title">No Bookings Yet</div>
                <div class="empty-state-text">New bookings will appear here</div>
            </div>
        <?php else: ?>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Client</th>
                        <th>Pickup</th>
                        <th>Date</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($recentBookings as $booking): ?>
                        <tr>
                            <td><?php echo htmlspecialchars($booking['company_name']); ?></td>
                            <td><?php echo htmlspecialchars($booking['pickup_location']); ?></td>
                            <td><?php echo date('M d, Y', strtotime($booking['booking_date'])); ?></td>
                            <td>
                                <span class="status-badge <?php echo strtolower($booking['status']); ?>">
                                    <?php echo ucfirst($booking['status']); ?>
                                </span>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        <?php endif; ?>
    </div>

    <!-- Recent Activity -->
    <div class="data-table-wrapper">
        <div class="table-header">
            <h3 class="table-title">Recent Activity</h3>
            <a href="activity.php" class="btn-icon view">View All</a>
        </div>
        <?php if (empty($display_items)): ?>
            <div class="empty-state">
                <div class="empty-state-icon"><i class="fas fa-history"></i></div>
                <div class="empty-state-title">No Activity Yet</div>
                <div class="empty-state-text">Driver activities will appear here</div>
            </div>
        <?php else: ?>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Driver</th>
                        <th>Activity</th>
                        <th>Time</th>
                        <th style="width: 50px;"></th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($display_items as $item): ?>
                        <?php if ($item['type'] === 'completed'): 
                            $group = $item['group'];
                            $main_activity = $group['main'];
                            $sub_activities = $group['sub'];
                            $schedule_id = $item['schedule_id'];
                        ?>
                            <tr class="completed-trip-row" data-schedule-id="<?php echo $schedule_id; ?>">
                                <td><?php echo htmlspecialchars($main_activity['driver_name']); ?></td>
                                <td>
                                    <span class="status-badge completed" style="margin-right: 8px;">Schedule Completed</span>
                                    <?php echo htmlspecialchars($main_activity['description'] ?? 'Driver completed trip'); ?>
                                </td>
                                <td><?php echo date('M d, H:i', strtotime($main_activity['created_at'])); ?></td>
                                <td>
                                    <?php if (!empty($sub_activities)): ?>
                                        <button type="button" class="btn-icon edit" onclick="toggleDashboardActivities(<?php echo $schedule_id; ?>)" id="dashboardToggleBtn<?php echo $schedule_id; ?>" title="Show/Hide Activity Logs" style="background: transparent; border: none; cursor: pointer; padding: 4px;">
                                            <i class="fas fa-chevron-down" id="dashboardIcon<?php echo $schedule_id; ?>"></i>
                                        </button>
                                    <?php endif; ?>
                                </td>
                            </tr>
                            <?php if (!empty($sub_activities)): ?>
                                <tr id="dashboardActivities<?php echo $schedule_id; ?>" style="display: none;">
                                    <td colspan="4" style="padding: 0;">
                                        <div style="background: var(--bg-input); padding: 15px; margin: 5px 0;">
                                            <div style="display: flex; flex-direction: column; gap: 8px;">
                                                <?php foreach ($sub_activities as $sub): ?>
                                                    <div style="display: grid; grid-template-columns: 100px 1fr; gap: 10px; padding: 8px; background: var(--bg-secondary); border-radius: 4px; align-items: center;">
                                                        <div style="color: var(--text-muted); font-size: 0.85rem;">
                                                            <?php echo date('h:i A', strtotime($sub['created_at'])); ?>
                                                        </div>
                                                        <div>
                                                            <span class="status-badge <?php 
                                                                echo $sub['activity_type'] === 'schedule_started' ? 'in-progress' : 'active'; 
                                                            ?>" style="margin-right: 8px;">
                                                                <?php echo ucfirst(str_replace('_', ' ', $sub['activity_type'])); ?>
                                                            </span>
                                                            <span style="color: var(--text-secondary); font-size: 0.9rem;">
                                                                <?php echo htmlspecialchars($sub['description'] ?? 'N/A'); ?>
                                                            </span>
                                                        </div>
                                                    </div>
                                                <?php endforeach; ?>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            <?php endif; ?>
                        <?php else: 
                            $activity = $item['activity'];
                        ?>
                            <tr>
                                <td><?php echo htmlspecialchars($activity['driver_name']); ?></td>
                                <td><?php echo htmlspecialchars(str_replace('_', ' ', $activity['activity_type'])); ?></td>
                                <td><?php echo date('M d, H:i', strtotime($activity['created_at'])); ?></td>
                                <td></td>
                            </tr>
                        <?php endif; ?>
                    <?php endforeach; ?>
                </tbody>
            </table>
        <?php endif; ?>
    </div>
</div>

<?php include __DIR__ . '/../includes/admin_footer.php'; ?>

<!-- Mapbox GL JS -->
<script src="https://api.mapbox.com/mapbox-gl-js/v3.0.0/mapbox-gl.js"></script>
<link href="https://api.mapbox.com/mapbox-gl-js/v3.0.0/mapbox-gl.css" rel="stylesheet" />

<script>
const MAPBOX_TOKEN = 'YOUR_MAPBOX_TOKEN';
mapboxgl.accessToken = MAPBOX_TOKEN;

let driversMap = null;
let driverMarkers = {};
let updateInterval = null;

function initDriversMap() {
    if (!document.getElementById('drivers-map')) return;
    
    driversMap = new mapboxgl.Map({
        container: 'drivers-map',
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [120.9842, 14.5995], // Manila, Philippines
        zoom: 11
    });

    driversMap.on('load', () => {
        updateDriverLocations();
        // Update every 10 seconds
        updateInterval = setInterval(updateDriverLocations, 10000);
    });
}

function updateDriverLocations() {
    fetch('../api/driver_locations.php')
        .then(response => {
            if (!response.ok) {
                throw new Error('HTTP error! status: ' + response.status);
            }
            return response.json();
        })
        .then(data => {
            if (data.success && data.data && Array.isArray(data.data)) {
                displayDriversOnMap(data.data);
            } else {
                // No drivers or invalid data
                clearAllMarkers();
                // Ensure map is centered on Philippines
                if (driversMap) {
                    driversMap.setCenter([120.9842, 14.5995]);
                    driversMap.setZoom(11);
                }
                updateStatus('No active drivers with location data');
            }
        })
        .catch(error => {
            console.error('Error fetching driver locations:', error);
            updateStatus('Error loading locations');
            // Ensure map is centered on Philippines even on error
            if (driversMap) {
                driversMap.setCenter([120.9842, 14.5995]);
                driversMap.setZoom(11);
            }
        });
}

function displayDriversOnMap(drivers) {
    // Clear existing markers
    Object.values(driverMarkers).forEach(marker => marker.remove());
    driverMarkers = {};
    
    const legendItems = [];
    
    // Create bounds to fit all drivers (or default to Philippines)
    const bounds = new mapboxgl.LngLatBounds();
    let hasValidDrivers = false;
    
    drivers.forEach(driver => {
        if (driver.latitude && driver.longitude) {
            // Validate coordinates are in Philippines or reasonable range
            const lat = driver.latitude;
            const lng = driver.longitude;
            const isInPhilippines = (lat >= 4 && lat <= 21) && (lng >= 116 && lng <= 127);
            const isLikelyUS = (lat >= 25 && lat <= 50) && (lng >= -130 && lng <= -65);
            
            // Skip drivers with invalid coordinates (like US default locations)
            if (isLikelyUS) {
                console.warn(`Skipping driver ${driver.driver_name} with invalid US coordinates: ${lat}, ${lng}`);
                return; // Skip this driver
            }
            
            hasValidDrivers = true;
            const el = document.createElement('div');
            el.className = 'driver-marker';
            el.style.width = '32px';
            el.style.height = '32px';
            el.style.borderRadius = '50%';
            el.style.border = '3px solid white';
            el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
            el.style.cursor = 'pointer';
            el.title = driver.driver_name;
            
            // Add blinking effect for vehicle issues and accidents
            if (driver.has_vehicle_issue || driver.has_accident) {
                console.log(`Adding blink effect for driver ${driver.driver_name}: has_vehicle_issue=${driver.has_vehicle_issue}, has_accident=${driver.has_accident}`);
                el.classList.add('vehicle-issue-blink');
                el.style.animation = 'blinkRedBlue 1s infinite';
                // Don't set background color - let animation handle it
            } else {
                // Only set background color if not blinking
                el.style.backgroundColor = getStatusColor(driver.status);
            }
            
            const updateText = driver.seconds_since_update !== null 
                ? `Updated ${driver.seconds_since_update}s ago`
                : 'Location data available';
            
            const marker = new mapboxgl.Marker(el)
                .setLngLat([driver.longitude, driver.latitude])
                .setPopup(new mapboxgl.Popup({ offset: 25 })
                    .setHTML(`
                        <div style="padding: 8px;">
                            <strong>${driver.driver_name}</strong><br>
                            ${driver.vehicle_assigned ? 'Vehicle: ' + driver.vehicle_assigned + '<br>' : ''}
                            ${driver.plate_number ? 'Plate: ' + driver.plate_number + '<br>' : ''}
                            Status: <span style="color: ${getStatusColor(driver.status)}">${driver.status}</span><br>
                            ${driver.has_vehicle_issue ? '<span style="color: #f59e0b; font-weight: bold;">⚠ Vehicle Issue Reported</span><br>' : ''}
                            ${driver.has_accident ? '<span style="color: #ef4444; font-weight: bold;">🚨 Accident Reported</span><br>' : ''}
                            <small>${updateText}</small>
                        </div>
                    `))
                .addTo(driversMap);
            
            driverMarkers[driver.driver_id] = marker;
            bounds.extend([driver.longitude, driver.latitude]);
            
            // Add to legend
            if (!legendItems.find(item => item.status === driver.status)) {
                legendItems.push({
                    status: driver.status,
                    color: getStatusColor(driver.status)
                });
            }
        }
    });
    
    // Fit map to show all drivers, or default to Philippines if no drivers
    if (hasValidDrivers && Object.keys(driverMarkers).length > 0) {
        driversMap.fitBounds(bounds, {
            padding: 50,
            maxZoom: 15
        });
        updateStatus('Last updated: ' + new Date().toLocaleTimeString() + ' - ' + Object.keys(driverMarkers).length + ' driver(s)');
    } else {
        // Center on Philippines if no valid drivers
        driversMap.setCenter([120.9842, 14.5995]);
        driversMap.setZoom(11);
        updateStatus('No active drivers with valid location data');
    }
    
    // Update legend
    const legendEl = document.getElementById('drivers-legend');
    if (legendEl) {
        legendEl.innerHTML = legendItems.map(item => `
            <div style="display: flex; align-items: center; gap: 8px;">
                <div style="width: 16px; height: 16px; border-radius: 50%; background: ${item.color}; border: 2px solid white;"></div>
                <span>${item.status.replace('_', ' ')}</span>
            </div>
        `).join('');
    }
}

function getStatusColor(status) {
    const colors = {
        'available': '#10b981', // green
        'on_schedule': '#3b82f6', // blue
        'in_progress': '#f59e0b', // orange
        'offline': '#6b7280' // gray
    };
    return colors[status] || '#6b7280';
}

function clearAllMarkers() {
    Object.values(driverMarkers).forEach(marker => marker.remove());
    driverMarkers = {};
    // Reset map to Philippines center
    if (driversMap) {
        driversMap.setCenter([120.9842, 14.5995]);
        driversMap.setZoom(11);
    }
}

function updateStatus(message) {
    const statusEl = document.getElementById('map-update-status');
    if (statusEl) {
        statusEl.textContent = message;
    }
}

// Initialize map when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDriversMap);
} else {
    initDriversMap();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
});

// Toggle dashboard activities
function toggleDashboardActivities(scheduleId) {
    const activitiesRow = document.getElementById('dashboardActivities' + scheduleId);
    const icon = document.getElementById('dashboardIcon' + scheduleId);
    
    if (activitiesRow && icon) {
        if (activitiesRow.style.display === 'none') {
            activitiesRow.style.display = '';
            icon.classList.remove('fa-chevron-down');
            icon.classList.add('fa-chevron-up');
        } else {
            activitiesRow.style.display = 'none';
            icon.classList.remove('fa-chevron-up');
            icon.classList.add('fa-chevron-down');
        }
    }
}
</script>

<!-- Accident Alert Popup -->
<div id="accidentAlertPopup" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 10000; align-items: center; justify-content: center;" onclick="event.stopPropagation();">
    <div style="background: white; border-radius: 12px; padding: 24px; max-width: 500px; width: 90%; box-shadow: 0 10px 40px rgba(0,0,0,0.3);" onclick="event.stopPropagation();">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
            <div style="width: 48px; height: 48px; border-radius: 50%; background: #ef4444; display: flex; align-items: center; justify-content: center; color: white; font-size: 24px;">
                🚨
            </div>
            <h2 style="margin: 0; color: #ef4444; font-size: 24px;">Accident Alert</h2>
        </div>
        <div id="accidentAlertContent" style="margin-bottom: 20px;">
            <!-- Content will be populated by JavaScript -->
        </div>
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
            <button id="takeActionBtn" type="button" class="btn btn-primary" style="padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; background: #ef4444; color: white; font-weight: bold;">
                Take Action
            </button>
        </div>
    </div>
</div>

<style>
.driver-marker {
    transition: transform 0.2s;
}
.driver-marker:hover {
    transform: scale(1.2);
}

@keyframes blinkRedBlue {
    0%, 100% {
        background-color: #ef4444;
        box-shadow: 0 0 10px #ef4444;
    }
    50% {
        background-color: #3b82f6;
        box-shadow: 0 0 10px #3b82f6;
    }
}

.vehicle-issue-blink {
    animation: blinkRedBlue 1s infinite;
}
</style>

<script>
let currentAccidentId = null;
let accidentCheckInterval = null;

// Check for pending accidents
function checkPendingAccidents() {
    fetch('../api/get_pending_accidents.php')
        .then(response => {
            if (!response.ok) {
                throw new Error('HTTP error! status: ' + response.status);
            }
            return response.json();
        })
        .then(data => {
            console.log('Pending accidents check:', data);
            // Only show popup if there are actual accidents with status 'reported'
            if (data.success && data.data && Array.isArray(data.data) && data.data.length > 0) {
                // The API already filters for status='reported', but double-check
                const pendingAccidents = data.data.filter(acc => acc.status === 'reported' || !acc.status);
                
                console.log('Pending accidents found:', pendingAccidents.length);
                
                if (pendingAccidents.length > 0) {
                    // Show popup for first unacknowledged accident
                    const accident = pendingAccidents[0];
                    console.log('Accident to show:', accident);
                    // Only show if we have a valid accident ID
                    if (accident.accident_id && currentAccidentId !== accident.accident_id) {
                        console.log('Showing accident alert for ID:', accident.accident_id);
                        showAccidentAlert(accident);
                    } else {
                        console.log('Skipping - already showing accident ID:', currentAccidentId);
                    }
                } else {
                    // No pending accidents, hide popup
                    console.log('No pending accidents, hiding popup');
                    hideAccidentAlert();
                }
            } else {
                // No accidents at all, hide popup
                console.log('No accidents in response, hiding popup');
                hideAccidentAlert();
            }
        })
        .catch(error => {
            console.error('Error checking accidents:', error);
            // Don't show popup on error
            if (currentAccidentId !== null) {
                hideAccidentAlert();
            }
        });
}

function showAccidentAlert(accident) {
    // Validate accident data
    if (!accident || !accident.accident_id) {
        console.error('Invalid accident data:', accident);
        return;
    }
    
    currentAccidentId = accident.accident_id;
    const popup = document.getElementById('accidentAlertPopup');
    const content = document.getElementById('accidentAlertContent');
    
    if (!popup || !content) {
        console.error('Popup elements not found');
        return;
    }
    
    // Format time - database now returns time in Philippines timezone (UTC+8)
    let reportedTime = 'N/A';
    if (accident.reported_at) {
        const dateStr = accident.reported_at;
        // MySQL datetime is now in Philippines timezone, so parse as-is
        const date = new Date(dateStr);
        
        // Format as readable date/time
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        let hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // 0 should be 12
        const hoursStr = String(hours).padStart(2, '0');
        
        reportedTime = `${month}/${day}/${year}, ${hoursStr}:${minutes}:${seconds} ${ampm}`;
    }
    const clientInfo = accident.client 
        ? `<strong style="color: #1f2937;">Client:</strong> <span style="color: #1f2937;">${accident.client.company_name || 'N/A'}</span><br>
           <strong style="color: #1f2937;">Contact Person:</strong> <span style="color: #1f2937;">${accident.client.client_name || 'N/A'}</span><br>
           <strong style="color: #1f2937;">Number of Passengers:</strong> <span style="color: #1f2937;">${accident.client.passengers || 'N/A'}</span><br>`
        : '<strong style="color: #1f2937;">Client:</strong> <span style="color: #1f2937;">No active schedule</span>';
    
    content.innerHTML = `
        <div style="line-height: 1.8; color: #1f2937;">
            <div style="margin-bottom: 12px; color: #1f2937;">
                <strong style="color: #1f2937;">Driver:</strong> <span style="color: #1f2937;">${accident.driver_name || 'N/A'}</span><br>
                <strong style="color: #1f2937;">Vehicle:</strong> <span style="color: #1f2937;">${accident.vehicle_assigned || 'N/A'} ${accident.plate_number ? '(' + accident.plate_number + ')' : ''}</span><br>
                <strong style="color: #1f2937;">Phone:</strong> <span style="color: #1f2937;">${accident.driver_phone || 'N/A'}</span>
            </div>
            <div style="margin-bottom: 12px; color: #1f2937;">
                <strong style="color: #1f2937;">Location:</strong> <span style="color: #1f2937;">${accident.latitude ? accident.latitude.toFixed(6) : 'N/A'}, ${accident.longitude ? accident.longitude.toFixed(6) : 'N/A'}</span><br>
                ${accident.latitude && accident.longitude ? `<a href="https://www.google.com/maps?q=${accident.latitude},${accident.longitude}" target="_blank" style="color: #3b82f6; text-decoration: none;">View on Google Maps</a>` : ''}
            </div>
            <div style="margin-bottom: 12px; color: #1f2937;">
                <strong style="color: #1f2937;">Time:</strong> <span style="color: #1f2937;">${reportedTime}</span>
            </div>
            <div style="margin-bottom: 12px; color: #1f2937;">
                ${clientInfo}
            </div>
            ${accident.description ? `<div style="margin-top: 12px; padding: 12px; background: #fef2f2; border-radius: 6px; border-left: 4px solid #ef4444;">
                <strong style="color: #1f2937;">Description:</strong> <span style="color: #1f2937;">${accident.description}</span>
            </div>` : ''}
        </div>
    `;
    
    // Ensure popup is visible
    popup.style.display = 'flex';
    popup.style.alignItems = 'center';
    popup.style.justifyContent = 'center';
    
    console.log('Accident popup displayed for ID:', currentAccidentId);
    
    // Re-enable button if it was disabled
    const btn = document.getElementById('takeActionBtn');
    if (btn) {
        btn.disabled = false;
        btn.textContent = 'Take Action';
    } else {
        console.error('Take Action button not found!');
    }
}

function hideAccidentAlert() {
    currentAccidentId = null;
    const popup = document.getElementById('accidentAlertPopup');
    if (popup) {
        popup.style.display = 'none';
    }
}

function acknowledgeAccident() {
    if (!currentAccidentId) {
        console.error('No accident ID to acknowledge');
        alert('No accident selected. Please refresh the page.');
        return;
    }
    
    // Disable button to prevent double-clicking
    const btn = document.getElementById('takeActionBtn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Processing...';
    }
    
    fetch('../api/acknowledge_accident.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            accident_id: currentAccidentId
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('HTTP error! status: ' + response.status);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            hideAccidentAlert();
            // Refresh the page to update the map
            location.reload();
        } else {
            alert('Failed to acknowledge accident: ' + (data.message || 'Unknown error'));
            // Re-enable button on error
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Take Action';
            }
        }
    })
    .catch(error => {
        console.error('Error acknowledging accident:', error);
        alert('Error acknowledging accident. Please try again.');
        // Re-enable button on error
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Take Action';
        }
    });
}

// Attach event listener to button
document.addEventListener('DOMContentLoaded', function() {
    const takeActionBtn = document.getElementById('takeActionBtn');
    if (takeActionBtn) {
        takeActionBtn.addEventListener('click', acknowledgeAccident);
    }
});

// Check for accidents every 5 seconds
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Wait a bit before first check to ensure page is fully loaded
        setTimeout(() => {
            checkPendingAccidents();
            accidentCheckInterval = setInterval(checkPendingAccidents, 5000);
        }, 1000);
    });
} else {
    // Wait a bit before first check
    setTimeout(() => {
        checkPendingAccidents();
        accidentCheckInterval = setInterval(checkPendingAccidents, 5000);
    }, 1000);
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (accidentCheckInterval) {
        clearInterval(accidentCheckInterval);
    }
});
</script>

