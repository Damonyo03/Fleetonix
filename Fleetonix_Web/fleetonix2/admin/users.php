<?php
/**
 * Fleettonix - User Management
 */

session_start();
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/admin_functions.php';

// Require admin access
requireUserType('admin');

$currentUser = getCurrentUser();
$page_title = 'User Management';

// Get filter parameters
$type = isset($_GET['type']) ? $_GET['type'] : null;
$search = isset($_GET['search']) ? trim($_GET['search']) : '';
$page = isset($_GET['page']) ? (int)$_GET['page'] : 1;

// Get users
$usersData = getUsers($type, $search, $page, 20);
$users = $usersData['users'];
$totalPages = $usersData['pages'];

// Include header
include __DIR__ . '/../includes/admin_header.php';
?>

<div class="page-header">
    <h1 class="page-title">User Management</h1>
    <p class="page-subtitle">Manage all system users: Admins, Clients, and Drivers</p>
</div>

<!-- Page Actions -->
<div class="page-actions">
    <a href="user_add.php?type=admin" class="btn btn-primary">
        <i class="fas fa-user-shield"></i> Add Admin
    </a>
    <a href="user_add.php?type=client" class="btn btn-primary">
        <i class="fas fa-building"></i> Add Client
    </a>
    <a href="user_add.php?type=driver" class="btn btn-primary">
        <i class="fas fa-car"></i> Add Driver
    </a>
</div>

<!-- Users Table -->
<div class="data-table-wrapper">
    <div class="table-header">
        <h3 class="table-title">All Users</h3>
        <div class="table-filters">
            <form method="GET" action="" style="display: flex; gap: 10px; align-items: center;">
                <select name="type" class="form-input" style="width: auto; padding: 8px 12px;">
                    <option value="">All Types</option>
                    <option value="admin" <?php echo $type === 'admin' ? 'selected' : ''; ?>>Admin</option>
                    <option value="client" <?php echo $type === 'client' ? 'selected' : ''; ?>>Client</option>
                    <option value="driver" <?php echo $type === 'driver' ? 'selected' : ''; ?>>Driver</option>
                </select>
                <input 
                    type="text" 
                    name="search" 
                    class="form-input" 
                    placeholder="Search by name or email..."
                    value="<?php echo htmlspecialchars($search); ?>"
                    style="width: 250px; padding: 8px 12px;"
                >
                <button type="submit" class="btn-icon view">
                    <i class="fas fa-search"></i> Search
                </button>
                <?php if ($type || $search): ?>
                    <a href="users.php" class="btn-icon edit">
                        <i class="fas fa-times"></i> Clear
                    </a>
                <?php endif; ?>
            </form>
        </div>
    </div>

    <?php if (empty($users)): ?>
        <div class="empty-state">
            <div class="empty-state-icon"><i class="fas fa-users"></i></div>
            <div class="empty-state-title">No Users Found</div>
            <div class="empty-state-text"><?php echo $search || $type ? 'Try adjusting your search filters' : 'Get started by adding a new user'; ?></div>
        </div>
    <?php else: ?>
        <table class="data-table">
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($users as $user): ?>
                    <tr>
                        <td><?php echo htmlspecialchars($user['full_name']); ?></td>
                        <td><?php echo htmlspecialchars($user['email']); ?></td>
                        <td><?php echo htmlspecialchars($user['phone'] ?? 'N/A'); ?></td>
                        <td>
                            <span class="status-badge <?php echo $user['user_type'] === 'admin' ? 'teal' : ($user['user_type'] === 'driver' ? 'blue' : 'green'); ?>">
                                <?php echo ucfirst($user['user_type']); ?>
                            </span>
                        </td>
                        <td>
                            <span class="status-badge <?php echo $user['status'] === 'active' ? 'active' : 'inactive'; ?>">
                                <?php echo ucfirst($user['status']); ?>
                            </span>
                        </td>
                        <td><?php echo date('M d, Y', strtotime($user['created_at'])); ?></td>
                        <td>
                            <div class="action-buttons">
                                <a href="user_view.php?id=<?php echo $user['id']; ?>" class="btn-icon view" title="View">
                                    <i class="fas fa-eye"></i>
                                </a>
                                <a href="user_edit.php?id=<?php echo $user['id']; ?>" class="btn-icon edit" title="Edit">
                                    <i class="fas fa-edit"></i>
                                </a>
                                <?php if ($user['id'] != $_SESSION['user_id']): ?>
                                    <a href="user_delete.php?id=<?php echo $user['id']; ?>" 
                                       class="btn-icon delete" 
                                       title="Delete"
                                       onclick="return confirm('Are you sure you want to delete this user?');">
                                        <i class="fas fa-trash"></i>
                                    </a>
                                <?php endif; ?>
                            </div>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>

        <!-- Pagination -->
        <?php if ($totalPages > 1): ?>
            <div class="pagination">
                <?php if ($page > 1): ?>
                    <a href="?page=<?php echo $page - 1; ?>&type=<?php echo $type; ?>&search=<?php echo urlencode($search); ?>">
                        <i class="fas fa-chevron-left"></i> Previous
                    </a>
                <?php endif; ?>
                
                <?php for ($i = 1; $i <= $totalPages; $i++): ?>
                    <?php if ($i == $page): ?>
                        <span class="active"><?php echo $i; ?></span>
                    <?php else: ?>
                        <a href="?page=<?php echo $i; ?>&type=<?php echo $type; ?>&search=<?php echo urlencode($search); ?>"><?php echo $i; ?></a>
                    <?php endif; ?>
                <?php endfor; ?>
                
                <?php if ($page < $totalPages): ?>
                    <a href="?page=<?php echo $page + 1; ?>&type=<?php echo $type; ?>&search=<?php echo urlencode($search); ?>">
                        Next <i class="fas fa-chevron-right"></i>
                    </a>
                <?php endif; ?>
            </div>
        <?php endif; ?>
    <?php endif; ?>
</div>

<?php include __DIR__ . '/../includes/admin_footer.php'; ?>

