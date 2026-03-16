/**
 * UI Helper for Admin and Client Layouts
 */

export function initLayout(pageTitle, userName, unreadCount = 0) {
    const mainContent = document.getElementById('mainContent');
    const sidebar = document.getElementById('sidebar');
    const menuToggle = document.getElementById('menuToggle');
    
    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('show');
        });
    }

    // Set Header Data
    const headerTitle = document.querySelector('.admin-header h2');
    if (headerTitle) headerTitle.innerText = pageTitle;

    const userMenuName = document.querySelector('.user-menu span');
    if (userMenuName) userMenuName.innerText = userName;

    const userAvatar = document.querySelector('.user-avatar');
    if (userAvatar) userAvatar.innerText = userName.charAt(0).toUpperCase();

    const badge = document.querySelector('.notification-badge');
    if (badge) {
        if (unreadCount > 0) {
            badge.innerText = unreadCount;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }

    // Sidebar text counter
    const sidebarCount = document.querySelector('.notif-count');
    if (sidebarCount) {
        sidebarCount.innerText = unreadCount;
    }
}

export function showModal(id, title, content, onSave) {
    const container = document.getElementById('modalContainer');
    container.innerHTML = `
        <div class="modal-backdrop" id="${id}-backdrop">
            <div class="modal">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button class="close-modal">&times;</button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary cancel-modal">Cancel</button>
                    <button class="btn btn-primary save-modal">Save Changes</button>
                </div>
            </div>
        </div>
    `;

    const backdrop = document.getElementById(`${id}-backdrop`);
    backdrop.style.display = 'flex';

    backdrop.querySelector('.close-modal').onclick = () => hideModal(id);
    backdrop.querySelector('.cancel-modal').onclick = () => hideModal(id);
    
    const saveBtn = backdrop.querySelector('.save-modal');
    saveBtn.onclick = async () => {
        saveBtn.disabled = true;
        saveBtn.innerText = 'Saving...';
        try {
            await onSave();
            hideModal(id);
        } catch (error) {
            alert("Error saving: " + error.message);
            saveBtn.disabled = false;
            saveBtn.innerText = 'Save Changes';
        }
    };
}

export function hideModal(id) {
    const backdrop = document.getElementById(`${id}-backdrop`);
    if (backdrop) backdrop.remove();
}
