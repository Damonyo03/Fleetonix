/**
 * Fleetonix - Enhanced Address Autocomplete (Cloud Function Proxy)
 * Uses LocationIQ via addressSearch Cloud Function for reliable results.
 */

export class CloudAddressSearch {
    /**
     * @param {HTMLInputElement} inputElement - The text input for address
     * @param {HTMLInputElement} latInput - The hidden input for latitude
     * @param {HTMLInputElement} lngInput - The hidden input for longitude
     * @param {Object} options - Optional callbacks or settings
     */
    constructor(inputElement, latInput, lngInput, options = {}) {
        this.input = inputElement;
        this.latInput = latInput;
        this.lngInput = lngInput;
        this.options = {
            onSelect: null,
            ...options
        };
        
        this.suggestionsContainer = null;
        this.debounceTimer = null;
        this.init();
    }

    init() {
        // Ensure container exists
        this.suggestionsContainer = document.createElement('div');
        this.suggestionsContainer.className = 'address-suggestions';
        this.suggestionsContainer.style.display = 'none';
        
        // Append to parent container (must be position: relative)
        const parent = this.input.parentElement;
        if (parent) {
            parent.style.position = 'relative';
            parent.appendChild(this.suggestionsContainer);
        }

        this.input.addEventListener('input', () => {
            clearTimeout(this.debounceTimer);
            const query = this.input.value.trim();
            
            if (query.length < 2) {
                this.hideSuggestions();
                return;
            }

            this.debounceTimer = setTimeout(() => this.search(query), 300);
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.input.contains(e.target) && !this.suggestionsContainer.contains(e.target)) {
                this.hideSuggestions();
            }
        });
        
        // Prevent form submission on enter if suggestion is highlighted
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && this.suggestionsContainer.style.display !== 'none') {
                const selected = this.suggestionsContainer.querySelector('.suggestion-item.selected');
                if (selected) {
                    e.preventDefault();
                    selected.click();
                }
            }
        });
    }

    async search(query) {
        try {
            this.suggestionsContainer.innerHTML = '<div class="suggestion-item loading">Searching...</div>';
            this.suggestionsContainer.style.display = 'block';

            const url = `https://us-central1-appfleetonix.cloudfunctions.net/addressSearch?q=${encodeURIComponent(query)}`;
            const response = await fetch(url);
            const results = await response.json();

            this.renderSuggestions(results);
        } catch (error) {
            console.error("Address search error:", error);
            this.hideSuggestions();
        }
    }

    renderSuggestions(results) {
        if (!results || results.length === 0) {
            this.hideSuggestions();
            return;
        }

        const suggestionsHTML = results.map((res, index) => {
            const parts = res.display_name.split(',');
            const mainText = parts[0].trim();
            const secondaryText = parts.slice(1).join(',').trim();

            return `
                <div class="suggestion-item" data-index="${index}" data-lat="${res.lat}" data-lng="${res.lon}">
                    <div class="suggestion-icon">
                        <i class="fas fa-map-marker-alt"></i>
                    </div>
                    <div class="suggestion-content">
                        <div class="suggestion-address"><strong>${mainText}</strong></div>
                        <div class="suggestion-details">${secondaryText}</div>
                    </div>
                </div>
            `;
        }).join('');

        this.suggestionsContainer.innerHTML = `
            ${suggestionsHTML}
            <div class="suggestions-footer">
                Powered by <span>Fleetonix Cloud Search</span>
            </div>
        `;

        this.suggestionsContainer.style.display = 'block';

        // Add listeners to items
        const items = this.suggestionsContainer.querySelectorAll('.suggestion-item');
        items.forEach(item => {
            item.onclick = (e) => {
                const lat = item.getAttribute('data-lat');
                const lng = item.getAttribute('data-lng');
                const mainAddress = item.querySelector('.suggestion-address strong').innerText;
                const secondaryAddress = item.querySelector('.suggestion-details').innerText;
                const fullAddress = secondaryAddress ? `${mainAddress}, ${secondaryAddress}` : mainAddress;

                this.input.value = fullAddress;
                this.latInput.value = lat;
                this.lngInput.value = lng;
                
                this.hideSuggestions();

                if (this.options.onSelect) {
                    this.options.onSelect({ address: fullAddress, lat, lng });
                }
                
                // Trigger change event
                this.input.dispatchEvent(new Event('change', { bubbles: true }));
            };
        });
    }

    async getCurrentLocation() {
        if (!navigator.geolocation) {
            alert("Geolocation is not supported by your browser.");
            return;
        }

        this.input.placeholder = "Detecting location...";
        this.input.value = "";
        
        navigator.geolocation.getCurrentPosition(async (position) => {
            const { latitude, longitude } = position.coords;
            this.latInput.value = latitude;
            this.lngInput.value = longitude;

            try {
                // Reverse geocode via LocationIQ
                const url = `https://us-central1-appfleetonix.cloudfunctions.net/addressSearch?reverse=true&lat=${latitude}&lng=${longitude}`;
                const response = await fetch(url);
                const data = await response.json();
                
                if (data && data.display_name) {
                    this.input.value = data.display_name;
                } else {
                    this.input.value = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
                }
                this.input.placeholder = "Search for address...";
                this.input.dispatchEvent(new Event('change', { bubbles: true }));
            } catch (error) {
                console.error("Reverse geocoding error:", error);
                this.input.value = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
                this.input.placeholder = "Search for address...";
            }
        }, (error) => {
            console.error("Geolocation error:", error);
            alert("Unable to retrieve your location. Please type it manually.");
            this.input.placeholder = "Search for address...";
        });
    }

    hideSuggestions() {
        this.suggestionsContainer.style.display = 'none';
        this.suggestionsContainer.innerHTML = '';
    }
}
