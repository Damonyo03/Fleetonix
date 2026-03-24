/**
 * Fleetonix - Google Places Autocomplete Integration
 * Replaces the custom search with Google's robust address matching
 */

// Handle Google Maps authentication failures
window.gm_authFailure = () => {
    console.error("Google Maps Authentication Failed. Check API Key, Billing, and Restrictions.");
    const statusMsg = document.createElement('div');
    statusMsg.style.cssText = "background: #f87171; color: white; padding: 10px; border-radius: 8px; margin-bottom: 10px; font-size: 0.9em;";
    statusMsg.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Google Maps failed to load. Please check if the Places API is enabled and domain restrictions are correct.';
    
    // Inject into form containers if they exist
    const containers = document.querySelectorAll('.form-group');
    if (containers.length > 0) {
        containers[0].prepend(statusMsg);
    }
};

/**
 * Fleetonix - Shared Address Autocomplete (Google Places)
 * Optimized for both static pages and dynamic modals.
 */

class AddressAutocomplete {
    constructor(inputElement, latInput, lngInput) {
        if (!inputElement || !latInput || !lngInput) return;
        
        this.input = inputElement;
        this.latInput = latInput;
        this.lngInput = lngInput;
        this.autocomplete = null;
        
        this.init();
    }

    init() {
        if (!window.google || !window.google.maps || !window.google.maps.places) return;

        // Initialize Google Autocomplete
        this.autocomplete = new google.maps.places.Autocomplete(this.input, {
            componentRestrictions: { country: "ph" },
            fields: ["address_components", "geometry", "formatted_address"],
            types: ["geocode", "establishment"]
        });

        // Ensure dropdown Visibility above modals
        if (!document.getElementById('pac-style-fix')) {
            const style = document.createElement('style');
            style.id = 'pac-style-fix';
            style.innerHTML = '.pac-container { z-index: 9999 !important; }';
            document.head.appendChild(style);
        }

        // Prevent form submission on enter
        this.input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") e.preventDefault();
        });

        // Handle place selection
        this.autocomplete.addListener("place_changed", () => {
            const place = this.autocomplete.getPlace();
            if (!place.geometry || !place.geometry.location) return;

            this.latInput.value = place.geometry.location.lat();
            this.lngInput.value = place.geometry.location.lng();
            
            // Trigger events
            this.input.dispatchEvent(new Event('change', { bubbles: true }));
            this.latInput.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }

    async getCurrentLocation() {
        if (!navigator.geolocation) {
            alert("Geolocation not supported.");
            return;
        }

        const originalPlaceholder = this.input.placeholder;
        this.input.placeholder = "Detecting location...";
        
        navigator.geolocation.getCurrentPosition(async (position) => {
            const { latitude, longitude } = position.coords;
            this.latInput.value = latitude;
            this.lngInput.value = longitude;

            const geocoder = new google.maps.Geocoder();
            geocoder.geocode({ location: { lat: latitude, lng: longitude } }, (results, status) => {
                if (status === "OK" && results[0]) {
                    this.input.value = results[0].formatted_address;
                }
                this.input.placeholder = originalPlaceholder;
                this.input.dispatchEvent(new Event('change', { bubbles: true }));
            });
        }, () => {
            this.input.placeholder = originalPlaceholder;
            alert("Unable to get location.");
        });
    }
}

// Global initialization function
window.initAllAutocompletes = () => {
    const configs = [
        { input: 'pickup_location', lat: 'pickup_latitude', lng: 'pickup_longitude', key: 'pickupAuto' },
        { input: 'dropoff_location', lat: 'dropoff_latitude', lng: 'dropoff_longitude', key: 'dropoffAuto' }
    ];

    configs.forEach(conf => {
        const input = document.getElementById(conf.input);
        const lat = document.getElementById(conf.lat);
        const lng = document.getElementById(conf.lng);

        if (input && lat && !input.dataset.autocompleteBound) {
            input.dataset.autocompleteBound = "true";
            window[conf.key] = new AddressAutocomplete(input, lat, lng);
            
            // Re-bind target buttons if they exist
            const targetBtn = input.id === 'pickup_location' ? document.getElementById('locatePickup') : document.getElementById('locateDropoff');
            if (targetBtn) {
                targetBtn.onclick = () => window[conf.key].getCurrentLocation();
            }
        }
    });
};

// Auto-init on DOM changes (to catch modals)
const observer = new MutationObserver(() => {
    if (window.google && window.google.maps && window.google.maps.places) {
        window.initAllAutocompletes();
    }
});
observer.observe(document.body, { childList: true, subtree: true });

// Initial check
document.addEventListener('DOMContentLoaded', () => {
    if (window.google && window.google.maps && window.google.maps.places) {
        window.initAllAutocompletes();
    }
});
