<?php
/**
 * Fleettonix - Accredited Companies Management
 */

session_start();
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/admin_functions.php';

// Require super_admin access
requireUserType('super_admin');

$currentUser = getCurrentUser();
$page_title = 'Accredited Companies';

// Handle success/error messages
$success = isset($_SESSION['success']) ? $_SESSION['success'] : '';
$error = isset($_SESSION['error']) ? $_SESSION['error'] : '';
unset($_SESSION['success'], $_SESSION['error']);

// Get all companies
$companies = getAllAccreditedCompanies();

// Include header
include __DIR__ . '/../includes/admin_header.php';
?>

<div class="page-header">
    <h1 class="page-title">Accredited Companies</h1>
    <p class="page-subtitle">Manage the master list of approved client companies</p>
</div>

<?php if ($success): ?>
    <div class="alert alert-success"><?php echo htmlspecialchars($success); ?></div>
<?php endif; ?>

<?php if ($error): ?>
    <div class="alert alert-error"><?php echo htmlspecialchars($error); ?></div>
<?php endif; ?>

<!-- Page Actions -->
<div class="page-actions">
    <button class="btn btn-primary" onclick="openAddModal()">
        <i class="fas fa-plus"></i> Add New Company
    </button>
</div>

<!-- Companies Table -->
<div class="data-table-wrapper">
    <table class="data-table">
        <thead>
            <tr>
                <th>ID</th>
                <th>Company Name</th>
                <th>Status</th>
                <th>Created At</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
            <?php if (empty($companies)): ?>
                <tr>
                    <td colspan="5" style="text-align: center; padding: 40px;">
                        No accredited companies found. Add one to get started.
                    </td>
                </tr>
            <?php else: ?>
                <?php foreach ($companies as $company): ?>
                    <tr>
                        <td><?php echo $company['id']; ?></td>
                        <td><strong><?php echo htmlspecialchars($company['name']); ?></strong></td>
                        <td>
                            <span class="status-badge <?php echo $company['status'] === 'active' ? 'active' : 'inactive'; ?>">
                                <?php echo ucfirst($company['status']); ?>
                            </span>
                        </td>
                        <td><?php echo date('M d, Y', strtotime($company['created_at'])); ?></td>
                        <td>
                            <div class="action-buttons">
                                <button class="btn-icon edit" title="Edit" 
                                        onclick="openEditModal(<?php echo $company['id']; ?>, '<?php echo addslashes($company['name']); ?>', '<?php echo $company['status']; ?>')">
                                    <i class="fas fa-edit"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                <?php endforeach; ?>
            <?php endif; ?>
        </tbody>
    </table>
</div>

<!-- Add/Edit Company Modal -->
<div id="companyModal" class="modal" style="display:none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5);">
    <div class="modal-content" style="background: var(--card-bg); margin: 10% auto; padding: 30px; border-radius: 12px; width: 400px; position: relative;">
        <h3 id="modalTitle" style="margin-top: 0;">Add New Company</h3>
        <form action="company_handler.php" method="POST">
            <input type="hidden" name="action" id="modalAction" value="add">
            <input type="hidden" name="id" id="companyId" value="">
            
            <div class="form-group" style="margin-bottom: 20px;">
                <label for="companyName">Company Name *</label>
                <input type="text" name="name" id="companyName" class="form-input" required placeholder="Enter formal company name">
            </div>
            
            <div class="form-group" style="margin-bottom: 20px;" id="statusGroup">
                <label for="companyStatus">Status</label>
                <select name="status" id="companyStatus" class="form-input">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                </select>
            </div>
            
            <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary">Save Company</button>
            </div>
        </form>
    </div>
</div>

<script>
function openAddModal() {
    document.getElementById('modalTitle').innerText = 'Add New Company';
    document.getElementById('modalAction').value = 'add';
    document.getElementById('companyId').value = '';
    document.getElementById('companyName').value = '';
    document.getElementById('statusGroup').style.display = 'none';
    document.getElementById('companyModal').style.display = 'block';
}

function openEditModal(id, name, status) {
    document.getElementById('modalTitle').innerText = 'Edit Company';
    document.getElementById('modalAction').value = 'edit';
    document.getElementById('companyId').value = id;
    document.getElementById('companyName').value = name;
    document.getElementById('companyStatus').value = status;
    document.getElementById('statusGroup').style.display = 'block';
    document.getElementById('companyModal').style.display = 'block';
}

function closeModal() {
    document.getElementById('companyModal').style.display = 'none';
}

// Close when clicking outside
window.onclick = function(event) {
    let modal = document.getElementById('companyModal');
    if (event.target == modal) {
        closeModal();
    }
}
</script>

<?php include __DIR__ . '/../includes/admin_footer.php'; ?>
