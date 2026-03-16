<?php
/**
 * Fleettonix - Client Management
 */

session_start();
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/admin_functions.php';
require_once __DIR__ . '/../includes/db_connect.php';

// Require admin access
requireUserType('admin');

$currentUser = getCurrentUser();
$page_title = 'Client Management';

// Get filter parameters
$search = isset($_GET['search']) ? trim($_GET['search']) : '';

// Get clients
$clients = getAllClients($search);

// Get booking counts for each client
$conn = getConnection();
$client_bookings = [];
foreach ($clients as $client) {
    $stmt = $conn->prepare("
        SELECT 
            COUNT(*) as total_bookings,
            COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_bookings,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_bookings
        FROM bookings
        WHERE client_id = ?
    ");
    $stmt->bind_param("i", $client['id']);
    $stmt->execute();
    $result = $stmt->get_result();
    $client_bookings[$client['id']] = $result->fetch_assoc();
    $stmt->close();
}
$conn->close();

// Include header
include __DIR__ . '/../includes/admin_header.php';
?>

<div class="page-header">
    <h1 class="page-title">Client Management</h1>
    <p class="page-subtitle">Manage all client companies and their bookings</p>
</div>

<!-- Page Actions -->
<div class="page-actions">
    <a href="user_add.php?type=client" class="btn btn-primary">
        <i class="fas fa-plus"></i> Add Client
    </a>
</div>

<!-- Clients Table -->
<div class="data-table-wrapper">
    <div class="table-header">
        <h3 class="table-title">All Clients</h3>
        <div class="table-filters">
            <form method="GET" action="" style="display: flex; gap: 10px; align-items: center;">
                <input 
                    type="text" 
                    name="search" 
                    class="form-input" 
                    placeholder="Search by company name, contact person, or email..."
                    value="<?php echo htmlspecialchars($search); ?>"
                    style="width: 300px; padding: 8px 12px;"
                >
                <button type="submit" class="btn-icon view">
                    <i class="fas fa-search"></i> Search
                </button>
                <?php if ($search): ?>
                    <a href="clients.php" class="btn-icon edit">
                        <i class="fas fa-times"></i> Clear
                    </a>
                <?php endif; ?>
            </form>
        </div>
    </div>

    <?php if (empty($clients)): ?>
        <div class="empty-state">
            <div class="empty-state-icon"><i class="fas fa-building"></i></div>
            <div class="empty-state-title">No Clients Found</div>
            <div class="empty-state-text"><?php echo $search ? 'Try adjusting your search' : 'Get started by adding a new client'; ?></div>
        </div>
    <?php else: ?>
        <table class="data-table">
            <thead>
                <tr>
                    <th>Company Name</th>
                    <th>Contact Person</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Total Bookings</th>
                    <th>Pending</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($clients as $client): 
                    $bookings = $client_bookings[$client['id']] ?? ['total_bookings' => 0, 'pending_bookings' => 0, 'completed_bookings' => 0];
                ?>
                    <tr>
                        <td><?php echo htmlspecialchars($client['company_name'] ?? 'N/A'); ?></td>
                        <td><?php echo htmlspecialchars($client['full_name']); ?></td>
                        <td><?php echo htmlspecialchars($client['email']); ?></td>
                        <td><?php echo htmlspecialchars($client['phone'] ?? 'N/A'); ?></td>
                        <td><?php echo $bookings['total_bookings']; ?></td>
                        <td>
                            <?php if ($bookings['pending_bookings'] > 0): ?>
                                <span class="status-badge pending"><?php echo $bookings['pending_bookings']; ?></span>
                            <?php else: ?>
                                <?php echo $bookings['pending_bookings']; ?>
                            <?php endif; ?>
                        </td>
                        <td>
                            <span class="status-badge <?php echo $client['user_status'] === 'active' ? 'active' : 'inactive'; ?>">
                                <?php echo ucfirst($client['user_status']); ?>
                            </span>
                        </td>
                        <td>
                            <div class="action-buttons">
                                <a href="client_view.php?id=<?php echo $client['id']; ?>" class="btn-icon view" title="View">
                                    <i class="fas fa-eye"></i>
                                </a>
                                <a href="user_edit.php?id=<?php echo $client['user_id']; ?>" class="btn-icon edit" title="Edit">
                                    <i class="fas fa-edit"></i>
                                </a>
                            </div>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    <?php endif; ?>
</div>

<?php include __DIR__ . '/../includes/admin_footer.php'; ?>

