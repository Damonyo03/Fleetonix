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

    // Apply role-based nav restrictions instantly from cache (before Firebase resolves)
    const cachedRole = localStorage.getItem(USER_ROLE_KEY);
    if (cachedRole) {
        _applyRoleNavRestrictions(cachedRole);
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

/**
 * Hides sidebar nav items that should not be visible for a given role.
 * Currently: 'admin' cannot see the Dashboard Map link.
 * @param {string} role
 */
function _applyRoleNavRestrictions(role) {
    if (role === 'admin') {
        // Hide all nav links pointing to dashboard.html
        document.querySelectorAll('.nav-item, a[href]').forEach(el => {
            const href = el.getAttribute('href') || '';
            if (href.includes('dashboard.html')) {
                el.style.display = 'none';
            }
        });

        // Also hide the MONITORING section label if Dashboard Map was the only item
        // (keep DTR and Drivers visible — they're accessible to admins)
    }
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

import { initTheme, toggleTheme } from './theme.js';

/**
 * Initialises the shared page layout (header title, user menu, sidebar toggle, notification badge).
 *
 * @param {string} pageTitle   - Text shown in the header <h2>
 * @param {string} [userName]  - Logged-in user's display name. If omitted, the cached name is used.
 * @param {number} [unreadCount=0]
 */
export function initLayout(pageTitle, userName, unreadCount = 0, role = '') {
    const sidebar    = document.getElementById('sidebar');
    const menuToggle = document.getElementById('menuToggle');

    // ── Theme Management ─────────────────────────────────────────────────────
    initTheme();
    _injectThemeToggle();

    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('show');
        });

        // Close sidebar on mobile when clicking a nav item
        const navItems = sidebar.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    sidebar.classList.remove('show');
                }
            });
        });

        // Close sidebar when clicking outside on mobile
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && 
                sidebar.classList.contains('show') && 
                !sidebar.contains(e.target) && 
                !menuToggle.contains(e.target)) {
                sidebar.classList.remove('show');
            }
        });
    }

    // ── Resolve the display name ──────────────────────────────────────────────
    // Use the supplied name if truthy, otherwise fall back to the localStorage cache.
    const resolvedName = (userName && userName.trim()) ? userName.trim() : (getCachedUserName() || 'User');

    // Persist/update the cache so the NEXT page can render it immediately.
    const resolvedRole = role || localStorage.getItem(USER_ROLE_KEY) || '';
    if (userName && userName.trim()) {
        cacheUser(userName.trim(), resolvedRole);
    }

    // ── Header title ─────────────────────────────────────────────────────────
    const headerTitle = document.querySelector('.header h2, .client-header h2');
    if (headerTitle) headerTitle.innerText = pageTitle;

    // ── User menu: name & avatar initial ──────────────────────────────────────
    // Support both the admin pattern (.user-menu span / .avatar)
    // and the client pattern (#userName / #userInitial)
    const userMenuName = document.querySelector('.user-profile span, .user-menu span');
    if (userMenuName) userMenuName.innerText = resolvedName;

    const userAvatar = document.querySelector('.avatar');
    if (userAvatar) userAvatar.innerText = resolvedName.charAt(0).toUpperCase();

    // Client dashboard uses explicit IDs
    const userNameEl   = document.getElementById('userName');
    const userInitialEl = document.getElementById('userInitial');
    if (userNameEl)   userNameEl.innerText   = resolvedName;
    if (userInitialEl) userInitialEl.innerText = resolvedName.charAt(0).toUpperCase();

    // ── Notification badge ────────────────────────────────────────────────────
    const badge = document.querySelector('.notification-badge, .notif-count');
    if (badge) {
        badge.innerText    = unreadCount > 0 ? unreadCount : '';
        badge.style.display = unreadCount > 0 ? 'block' : 'none';
    }

    const sidebarCount = document.querySelector('.notif-count');
    if (sidebarCount) {
        sidebarCount.innerText = unreadCount >= 0 ? unreadCount : '0';
        sidebarCount.style.display = 'inline-flex';
    }

    // ── Role-based nav restrictions ───────────────────────────────────────────
    if (resolvedRole) {
        _applyRoleNavRestrictions(resolvedRole);
    }
}

/** Injects a fixed theme toggle button into the body */
function _injectThemeToggle() {
    if (document.getElementById('globalThemeToggle')) return;

    const toggle = document.createElement('button');
    toggle.id = 'globalThemeToggle';
    toggle.className = 'w-14 h-14 rounded-full bg-primary text-white flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-2xl focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-2';
    toggle.setAttribute('aria-label', 'Toggle Dark Mode');
    toggle.innerHTML = `
        <i id="theme-sun" class="fas fa-sun text-xl"></i>
        <i id="theme-moon" class="fas fa-moon text-xl hidden"></i>
    `;
    
    toggle.onclick = toggleTheme;
    document.body.appendChild(toggle);
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

// --- Toast Notification System ---
let toastContainer = null;

function ensureToastContainer() {
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }
}

/**
 * Shows a premium toast notification.
 * @param {string} title - Title text
 * @param {string} message - Description text
 * @param {string} type - 'info', 'success', 'warning', 'danger'
 * @param {number} duration - ms to show
 */
export function showToast(title, message, type = 'info', duration = 5000) {
    ensureToastContainer();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const iconMap = {
        'info': 'fa-info-circle',
        'success': 'fa-check-circle',
        'warning': 'fa-exclamation-triangle',
        'danger': 'fa-radiation-alt'
    };
    const icon = iconMap[type] || 'fa-bell';

    toast.innerHTML = `
        <div class="toast-icon"><i class="fas ${icon}"></i></div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close"><i class="fas fa-times"></i></button>
    `;

    toastContainer.prepend(toast);

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.onclick = () => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    };

    if (duration > 0) {
        setTimeout(() => {
            if (toast.parentNode) {
                toast.classList.add('fade-out');
                setTimeout(() => toast.remove(), 300);
            }
        }, duration);
    }
}
