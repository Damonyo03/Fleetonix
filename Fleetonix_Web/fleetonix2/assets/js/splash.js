/**
 * Fleettonix - Splash Screen Script
 * Handles logo fade in/out animation and redirect to login page
 */

document.addEventListener('DOMContentLoaded', function() {
    const splashLogo = document.getElementById('splashLogo');
    const logoText = document.querySelector('.logo-text');
    
    // Total splash duration: 3 seconds (matching CSS animation)
    const splashDuration = 3000;
    
    // After splash animation completes, redirect to login page
    setTimeout(function() {
        // Fade out the entire splash container
        const splashContainer = document.querySelector('.splash-container');
        splashContainer.style.transition = 'opacity 0.5s ease-out';
        splashContainer.style.opacity = '0';
        
        // Redirect after fade out completes
        setTimeout(function() {
            window.location.href = 'login.php';
        }, 500);
    }, splashDuration);
    
    // Optional: Add click to skip splash
    document.addEventListener('click', function() {
        window.location.href = 'login.php';
    });
    
    // Optional: Add keyboard skip (Enter or Space)
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            window.location.href = 'login.php';
        }
    });
});

