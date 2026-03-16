/**
 * Fleettonix - Admin Dashboard Scripts
 */

document.addEventListener('DOMContentLoaded', function() {
    // Sidebar toggle for mobile
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    
    if (menuToggle) {
        menuToggle.addEventListener('click', function() {
            sidebar.classList.toggle('show');
        });
    }
    
    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', function(e) {
        if (window.innerWidth <= 768) {
            if (!sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
                sidebar.classList.remove('show');
            }
        }
    });
    
    // Handle window resize
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768) {
            sidebar.classList.remove('show');
        }
    });
    
    // Notification icon click (handled by link in header)
    
    // Fix dropdown arrow position - prevent it from moving when clicked
    const selectElements = document.querySelectorAll('select.form-input');
    selectElements.forEach(function(select) {
        // Function to force arrow position
        function fixArrowPosition() {
            select.style.setProperty('background-position', 'right 16px center', 'important');
            select.style.setProperty('direction', 'ltr', 'important');
            select.style.setProperty('text-align', 'left', 'important');
            select.style.setProperty('padding-right', '40px', 'important');
        }
        
        // Force arrow position on all events
        select.addEventListener('focus', fixArrowPosition);
        select.addEventListener('blur', fixArrowPosition);
        select.addEventListener('change', fixArrowPosition);
        select.addEventListener('click', fixArrowPosition);
        select.addEventListener('mousedown', fixArrowPosition);
        select.addEventListener('mouseup', fixArrowPosition);
        
        // Continuously check and fix position (for browsers that change it dynamically)
        setInterval(function() {
            if (document.activeElement === select || select.matches(':focus')) {
                fixArrowPosition();
            }
        }, 50);
    });
    
    // Auto-refresh notifications every 30 seconds
    setInterval(function() {
        // This will be implemented with AJAX later
    }, 30000);
});

