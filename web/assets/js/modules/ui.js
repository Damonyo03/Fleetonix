/**
 * UI Helper for Admin and Client Layouts
 *
 * User name caching strategy:
 *   - When initLayout is called with a real name, it is saved to localStorage immediately.
 *   - On every page load (DOMContentLoaded), the cached name is applied BEFORE the Firebase
 *     auth + Firestore fetch completes, so the header always shows the correct name instantly
 *     with no flicker across pages.
 *   - On logout, call clearUserCache() to remove the cached data.
 */

const USER_CACHE_KEY = 'fleetonix_display_name';
const USER_ROLE_KEY  = 'fleetonix_user_role';

// ── Auto-apply on every page load ────────────────────────────────────────────
// Reads from localStorage as soon as the DOM is ready, before Firebase resolves.
document.addEventListener('DOMContentLoaded', () => {
    const cachedName = localStorage.getItem(USER_CACHE_KEY);
    if (cachedName) {
        _applyUserName(cachedName);
    }
});

/** Internal helper: writes the user name to all known user-menu elements. */
function _applyUserName(name) {
    if (!name) return;
    const initial = name.charAt(0).toUpperCase();

    // Admin pattern: .user-menu span + .user-avatar
    const menuSpan  = document.querySelector('.user-menu span');
    const avatar    = document.querySelector('.user-avatar');
    if (menuSpan) menuSpan.innerText = name;
    if (avatar)   avatar.innerText   = initial;

    // Client pattern: #userName + #userInitial
    const userNameEl    = document.getElementById('userName');
    const userInitialEl = document.getElementById('userInitial');
    if (userNameEl)    userNameEl.innerText    = name;
    if (userInitialEl) userInitialEl.innerText = initial;
}

/**
 * Saves user display name & role to localStorage for instant rendering on next page load.
 * @param {string} name
 * @param {string} [role]
 */
export function cacheUser(name, role = '') {
    if (name) localStorage.setItem(USER_CACHE_KEY, name);
    if (role) localStorage.setItem(USER_ROLE_KEY, role);
}

/** Returns the cached display name, or null if not set. */
export function getCachedUserName() {
    return localStorage.getItem(USER_CACHE_KEY);
}

/** Clears the cached user info (call on logout). */
export function clearUserCache() {
    localStorage.removeItem(USER_CACHE_KEY);
    localStorage.removeItem(USER_ROLE_KEY);
}

/**
 * Initialises the shared page layout (header title, user menu, sidebar toggle, notification badge).
 *
 * @param {string} pageTitle   - Text shown in the header <h2>
 * @param {string} [userName]  - Logged-in user's display name. If omitted, the cached name is used.
 * @param {number} [unreadCount=0]
 */
export function initLayout(pageTitle, userName, unreadCount = 0) {
    const sidebar    = document.getElementById('sidebar');
    const menuToggle = document.getElementById('menuToggle');

    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', () => sidebar.classList.toggle('show'));
    }

    // ── Resolve the display name ──────────────────────────────────────────────
    // Use the supplied name if truthy, otherwise fall back to the localStorage cache.
    const resolvedName = (userName && userName.trim()) ? userName.trim() : (getCachedUserName() || 'User');

    // Persist/update the cache so the NEXT page can render it immediately.
    if (userName && userName.trim()) {
        cacheUser(userName.trim());
    }

    // ── Header title ─────────────────────────────────────────────────────────
    const headerTitle = document.querySelector('.admin-header h2, .client-header h2');
    if (headerTitle) headerTitle.innerText = pageTitle;

    // ── User menu: name & avatar initial ──────────────────────────────────────
    // Support both the admin pattern (.user-menu span / .user-avatar)
    // and the client pattern (#userName / #userInitial)
    const userMenuName = document.querySelector('.user-menu span');
    if (userMenuName) userMenuName.innerText = resolvedName;

    const userAvatar = document.querySelector('.user-avatar');
    if (userAvatar) userAvatar.innerText = resolvedName.charAt(0).toUpperCase();

    // Client dashboard uses explicit IDs
    const userNameEl   = document.getElementById('userName');
    const userInitialEl = document.getElementById('userInitial');
    if (userNameEl)   userNameEl.innerText   = resolvedName;
    if (userInitialEl) userInitialEl.innerText = resolvedName.charAt(0).toUpperCase();

    // ── Notification badge ────────────────────────────────────────────────────
    const badge = document.querySelector('.notification-badge');
    if (badge) {
        badge.innerText    = unreadCount > 0 ? unreadCount : '';
        badge.style.display = unreadCount > 0 ? 'block' : 'none';
    }

    const sidebarCount = document.querySelector('.notif-count');
    if (sidebarCount) {
        sidebarCount.innerText = unreadCount > 0 ? unreadCount : '';
        sidebarCount.style.display = unreadCount > 0 ? 'inline-flex' : 'none';
    }
}

// ── Modal helpers ─────────────────────────────────────────────────────────────

export function showModal(id, title, content, onSave) {
    const container = document.getElementById('modalContainer');
    if (!container) return;

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

    backdrop.querySelector('.close-modal').onclick  = () => hideModal(id);
    backdrop.querySelector('.cancel-modal').onclick = () => hideModal(id);

    const saveBtn = backdrop.querySelector('.save-modal');
    saveBtn.onclick = async () => {
        saveBtn.disabled  = true;
        saveBtn.innerText = 'Saving...';
        try {
            await onSave();
            hideModal(id);
        } catch (error) {
            alert('Error saving: ' + error.message);
            saveBtn.disabled  = false;
            saveBtn.innerText = 'Save Changes';
        }
    };
}

export function hideModal(id) {
    const backdrop = document.getElementById(`${id}-backdrop`);
    if (backdrop) backdrop.remove();
}
