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

        this.suggestionsContainer.innerHTML = results.map((res, index) => `
            <div class="suggestion-item" data-index="${index}" data-lat="${res.lat}" data-lng="${res.lon}">
                <div class="suggestion-icon">
                    <i class="fas fa-map-marker-alt"></i>
                </div>
                <div class="suggestion-content">
                    <div class="suggestion-address">${res.display_name}</div>
                    <div class="suggestion-details">
                        <span class="suggestion-region">${this.getRegion(res.display_name)}</span>
                    </div>
                </div>
            </div>
        `).join('');

        this.suggestionsContainer.style.display = 'block';

        // Add listeners to items
        const items = this.suggestionsContainer.querySelectorAll('.suggestion-item');
        items.forEach(item => {
            item.onclick = (e) => {
                const lat = item.getAttribute('data-lat');
                const lng = item.getAttribute('data-lng');
                const address = item.querySelector('.suggestion-address').innerText;

                this.input.value = address;
                this.latInput.value = lat;
                this.lngInput.value = lng;
                
                this.hideSuggestions();

                if (this.options.onSelect) {
                    this.options.onSelect({ address, lat, lng });
                }
                
                // Trigger change event
                this.input.dispatchEvent(new Event('change', { bubbles: true }));
            };
        });
    }

    getRegion(displayName) {
        if (displayName.includes("Metro Manila") || displayName.includes("NCR")) return "NCR";
        if (displayName.includes("Pampanga")) return "Central Luzon";
        if (displayName.includes("Cavite") || displayName.includes("Laguna") || displayName.includes("Batangas")) return "South Luzon";
        return "Philippines";
    }

    hideSuggestions() {
        this.suggestionsContainer.style.display = 'none';
        this.suggestionsContainer.innerHTML = '';
    }
}
