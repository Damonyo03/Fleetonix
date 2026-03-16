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

class AddressAutocomplete {
    constructor(inputElement, latInput, lngInput) {
        this.input = inputElement;
        this.latInput = latInput;
        this.lngInput = lngInput;
        this.autocomplete = null;
        
        this.init();
    }
    
    init() {
        console.log("Initializing AddressAutocomplete for input:", this.input.id);
        if (!window.google || !window.google.maps || !window.google.maps.places) {
            console.error("Google Maps Places library not loaded. Check script tag and API key.");
            return;
        }

        // Initialize Autocomplete
        this.autocomplete = new google.maps.places.Autocomplete(this.input, {
            componentRestrictions: { country: "ph" }, // Restrict to Philippines
            fields: ["address_components", "geometry", "formatted_address"],
            types: ["geocode", "establishment"]
        });

        // Prevent form submission on enter while selecting suggestion
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && document.querySelector('.pac-container:not([style*="display: none"])')) {
                e.preventDefault();
            }
        });

        // Handle place selection
        this.autocomplete.addListener("place_changed", () => {
            const place = this.autocomplete.getPlace();
            
            if (!place.geometry || !place.geometry.location) {
                // User pressed enter without selecting a suggestion
                console.warn("No geometry found for selected place.");
                return;
            }

            // Update hidden inputs
            this.latInput.value = place.geometry.location.lat();
            this.lngInput.value = place.geometry.location.lng();
            
            // Dispatch change events for any observers
            this.latInput.dispatchEvent(new Event('change', { bubbles: true }));
            this.lngInput.dispatchEvent(new Event('change', { bubbles: true }));

            console.log(`Selected: ${place.formatted_address} (${this.latInput.value}, ${this.lngInput.value})`);
        });
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // We need to wait a small bit or ensure Google is loaded if script is async
    const initAutocompletes = () => {
        // Pickup
        const pickupInput = document.getElementById('pickup_location');
        const pickupLat = document.getElementById('pickup_latitude');
        const pickupLng = document.getElementById('pickup_longitude');
        if (pickupInput && pickupLat) new AddressAutocomplete(pickupInput, pickupLat, pickupLng);

        // Dropoff
        const dropoffInput = document.getElementById('dropoff_location');
        const dropoffLat = document.getElementById('dropoff_latitude');
        const dropoffLng = document.getElementById('dropoff_longitude');
        if (dropoffInput && dropoffLat) new AddressAutocomplete(dropoffInput, dropoffLat, dropoffLng);
    };

    if (window.google && window.google.maps) {
        initAutocompletes();
    } else {
        // Fallback for async loading
        const checkGoogle = setInterval(() => {
            if (window.google && window.google.maps && window.google.maps.places) {
                initAutocompletes();
                clearInterval(checkGoogle);
            }
        }, 100);
    }
});
