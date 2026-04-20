/**
 * Fleetonix Theme Manager (Simplified next-themes equivalent)
 */

const THEME_KEY = 'fleetonix_theme_pref';

export function initTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    const theme = savedTheme || (systemDark ? 'dark' : 'light');
    setTheme(theme);

    // Listen for system changes if no preference is saved
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        if (!localStorage.getItem(THEME_KEY)) {
            setTheme(e.matches ? 'dark' : 'light');
        }
    });
}

export function setTheme(theme) {
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
    localStorage.setItem(THEME_KEY, theme);
    updateToggleIcons(theme);
}

export function toggleTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    setTheme(isDark ? 'light' : 'dark');
}

function updateToggleIcons(theme) {
    const sunIcon = document.getElementById('theme-sun');
    const moonIcon = document.getElementById('theme-moon');
    if (sunIcon && moonIcon) {
        if (theme === 'dark') {
            sunIcon.classList.add('hidden');
            moonIcon.classList.remove('hidden');
        } else {
            sunIcon.classList.remove('hidden');
            moonIcon.classList.add('hidden');
        }
    }
}
