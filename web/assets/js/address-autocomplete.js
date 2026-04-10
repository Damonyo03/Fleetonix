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
            
            // Extract City/Area for multi-tenant segment filtering
            let city = "";
            if (place.address_components) {
                const cityComp = place.address_components.find(c => 
                    c.types.includes("locality") || 
                    c.types.includes("administrative_area_level_2") ||
                    c.types.includes("sublocality_level_1")
                );
                if (cityComp) city = cityComp.long_name;
            }
            this.input.dataset.city = city;

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

/**
 * Robust Initialization Helper
 * Can be called with either IDs or actual DOM elements.
 */
window.initAutocompleteForInput = (input, lat, lng) => {
    const inputEl = typeof input === 'string' ? document.getElementById(input) : input;
    let latEl = typeof lat === 'string' ? document.getElementById(lat) : lat;
    let lngEl = typeof lng === 'string' ? document.getElementById(lng) : lng;

    if (!inputEl) return null;

    // Fallback: If lat/lng elements are not provided, look for hidden inputs in the same container
    if (!latEl || !lngEl) {
        const container = inputEl.closest('.form-group') || inputEl.parentElement;
        if (container) {
            latEl = latEl || container.querySelector('.lat-input, .drop-lat-input, [id$="_latitude"]');
            lngEl = lngEl || container.querySelector('.lng-input, .drop-lng-input, [id$="_longitude"]');
        }
    }

    if (inputEl && !inputEl.dataset.autocompleteBound) {
        inputEl.dataset.autocompleteBound = "true";
        const instance = new AddressAutocomplete(inputEl, latEl, lngEl);
        
        // Handle "Use Current Location" buttons if they exist in the same group
        const group = inputEl.closest('.form-group');
        if (group) {
            const locateBtn = group.querySelector('.locate-btn, .btn-input-action');
            if (locateBtn) {
                locateBtn.onclick = () => instance.getCurrentLocation();
            }
        }
        
        return instance;
    }
    return null;
};

// Global initialization function
window.initAllAutocompletes = () => {
    const configs = [
        { input: 'pickup_location', lat: 'pickup_latitude', lng: 'pickup_longitude' },
        { input: 'pickup_location_1', lat: 'pickup_latitude_1', lng: 'pickup_longitude_1' },
        { input: 'dropoff_location', lat: 'dropoff_latitude', lng: 'dropoff_longitude' }
    ];

    configs.forEach(conf => {
        window.initAutocompleteForInput(conf.input, conf.lat, conf.lng);
    });
    
    // Also catch any generic pickup and dropoff inputs without specific IDs (common in dynamic rows)
    document.querySelectorAll('.pickup-input:not([data-autocomplete-bound]), .dropoff-input:not([data-autocomplete-bound])').forEach(el => {
        window.initAutocompleteForInput(el);
    });
};

// Auto-init on DOM changes (to catch modals and dynamic rows)
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
