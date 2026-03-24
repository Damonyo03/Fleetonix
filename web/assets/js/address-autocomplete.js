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

        // Initialize Google Autocomplete
        this.autocomplete = new google.maps.places.Autocomplete(this.input, {
            componentRestrictions: { country: "ph" },
            fields: ["address_components", "geometry", "formatted_address"],
            types: ["geocode", "establishment"] // More inclusive than just "address"
        });

        // Ensure the dropdown appears above modals
        // Google appends .pac-container to body on first show
        // We can force a style rule or wait for it
        if (!document.getElementById('google-pac-style')) {
            const style = document.createElement('style');
            style.id = 'google-pac-style';
            style.innerHTML = '.pac-container { z-index: 2100 !important; }';
            document.head.appendChild(style);
        }

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

    async getCurrentLocation() {
        if (!navigator.geolocation) {
            alert("Geolocation is not supported by your browser.");
            return;
        }

        const originalPlaceholder = this.input.placeholder;
        this.input.placeholder = "Detecting location...";
        
        navigator.geolocation.getCurrentPosition(async (position) => {
            const { latitude, longitude } = position.coords;
            this.latInput.value = latitude;
            this.lngInput.value = longitude;

            try {
                // Reverse geocode using Google Geocoder since we are using Google anyway
                const geocoder = new google.maps.Geocoder();
                const response = await geocoder.geocode({ location: { lat: latitude, lng: longitude } });
                
                if (response.results && response.results[0]) {
                    this.input.value = response.results[0].formatted_address;
                } else {
                    this.input.value = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
                }
                this.input.placeholder = originalPlaceholder;
                this.input.dispatchEvent(new Event('change', { bubbles: true }));
            } catch (error) {
                console.error("Reverse geocoding error:", error);
                this.input.value = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
                this.input.placeholder = originalPlaceholder;
            }
        }, (error) => {
            console.error("Geolocation error:", error);
            alert("Unable to retrieve your location. Please type it manually.");
            this.input.placeholder = originalPlaceholder;
        });
    }
}

// Function to initialize autocompletes on any set of elements
window.initGoogleAutocompletes = () => {
    console.log("Initializing Google Autocompletes...");
    
    // Pickup
    const pickupInput = document.getElementById('pickup_location');
    const pickupLat = document.getElementById('pickup_latitude');
    const pickupLng = document.getElementById('pickup_longitude');
    if (pickupInput && pickupLat) {
        window.pickupAutocomplete = new AddressAutocomplete(pickupInput, pickupLat, pickupLng);
    }

    // Dropoff
    const dropoffInput = document.getElementById('dropoff_location');
    const dropoffLat = document.getElementById('dropoff_latitude');
    const dropoffLng = document.getElementById('dropoff_longitude');
    if (dropoffInput && dropoffLat) {
        window.dropoffAutocomplete = new AddressAutocomplete(dropoffInput, dropoffLat, dropoffLng);
    }
};

// Initialize when DOM is ready (for static pages like client booking)
document.addEventListener('DOMContentLoaded', () => {
    if (window.google && window.google.maps) {
        window.initGoogleAutocompletes();
    } else {
        const checkGoogle = setInterval(() => {
            if (window.google && window.google.maps && window.google.maps.places) {
                window.initGoogleAutocompletes();
                clearInterval(checkGoogle);
            }
        }, 100);
    }
});
