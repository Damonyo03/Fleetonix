/**
 * Fleettonix - Address Autocomplete
 * Provides autocomplete functionality for Philippine addresses
 */

class AddressAutocomplete {
    constructor(inputElement, latInput, lngInput) {
        this.input = inputElement;
        this.latInput = latInput;
        this.lngInput = lngInput;
        this.suggestionsContainer = null;
        this.currentSuggestions = [];
        this.selectedIndex = -1;
        this.debounceTimer = null;
        this.isLoading = false;
        this.cache = new Map();
        this.MAX_CACHE_ITEMS = 25;
        this.activeController = null;
        
        this.init();
    }
    
    init() {
        // Create suggestions container
        this.suggestionsContainer = document.createElement('div');
        this.suggestionsContainer.className = 'address-suggestions';
        this.suggestionsContainer.style.display = 'none';
        this.input.parentNode.appendChild(this.suggestionsContainer);
        
        this.isSelecting = false;
        this.hasSelectedSuggestion = false;
        
        // Event listeners
        this.input.addEventListener('input', (e) => {
            if (!this.isSelecting) {
                this.hasSelectedSuggestion = false;
                this.handleInput(e);
            }
        });
        this.input.addEventListener('keydown', (e) => this.handleKeyDown(e));
        this.input.addEventListener('blur', () => {
            if (!this.isSelecting && !this.hasSelectedSuggestion) {
                setTimeout(() => {
                    if (!this.isSelecting && !this.hasSelectedSuggestion) {
                        this.hideSuggestions();
                    }
                }, 200);
            }
        });
        this.input.addEventListener('focus', () => {
            if (this.hasSelectedSuggestion) return;
            const hasValue = this.input.value.trim().length >= 2;
            if (hasValue && this.currentSuggestions.length > 0 && !this.isSelecting) {
                this.showSuggestions();
            }
        });
    }
    
    handleInput(e) {
        if (this.isSelecting || this.hasSelectedSuggestion) {
            if (this.hasSelectedSuggestion) {
                setTimeout(() => { this.hasSelectedSuggestion = false; }, 300);
            }
            return;
        }
        
        const query = e.target.value.trim();
        
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        
        if (query.length < 2) {
            this.hideSuggestions();
            this.currentSuggestions = [];
            if (query.length === 0) {
                this.latInput.value = '0';
                this.lngInput.value = '0';
            }
            return;
        }
        
        this.debounceTimer = setTimeout(() => {
            this.searchAddresses(query);
        }, 150);
    }
    
    async searchAddresses(query) {
        try {
            // Check cache first
            if (this.cache.has(query)) {
                this.currentSuggestions = this.cache.get(query);
                this.selectedIndex = -1;
                this.renderSuggestions();
                this.showSuggestions();
                return;
            }

            // Abort any in-flight request
            if (this.activeController) {
                this.activeController.abort();
            }
            this.activeController = new AbortController();
            this.setLoadingState(true);

            // Determine base path based on current location
            const basePath = window.location.pathname.includes('/client/') ? '../' : '';
            const response = await fetch(
                `${basePath}api/address_search.php?q=${encodeURIComponent(query)}&limit=10`,
                { signal: this.activeController.signal }
            );
            const data = await response.json();
            
            this.currentSuggestions = data;
            this.selectedIndex = -1;
            this.addToCache(query, data);
            
            if (data.length > 0) {
                this.showSuggestions();
                this.renderSuggestions();
            } else {
                this.hideSuggestions();
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Error searching addresses:', error);
                this.hideSuggestions();
            }
        }
        this.setLoadingState(false);
        this.activeController = null;
    }
    
    renderSuggestions() {
        if (!this.suggestionsContainer) return;
        
        this.suggestionsContainer.innerHTML = '';
        
        this.currentSuggestions.forEach((suggestion, index) => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            if (index === this.selectedIndex) {
                item.classList.add('selected');
            }
            
            // Build address display with house number and zip code
            let addressDisplay = this.highlightMatch(suggestion.address);
            let details = [];
            
            if (suggestion.house_number) {
                details.push(`House #${suggestion.house_number}`);
            }
            if (suggestion.zip_code) {
                details.push(`Zip: ${suggestion.zip_code}`);
            }
            
            item.innerHTML = `
                <div class="suggestion-address">${addressDisplay}</div>
                <div class="suggestion-details">
                    ${details.length > 0 ? `<span class="suggestion-meta">${details.join(' • ')}</span>` : ''}
                    <span class="suggestion-region">${suggestion.region}</span>
                </div>
            `;
            
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                this.isSelecting = true;
                this.hasSelectedSuggestion = true;
                
                const address = (suggestion.address && suggestion.address.trim()) || (suggestion.place_name && suggestion.place_name.trim()) || '';
                const lat = parseFloat(suggestion.lat) || 0;
                const lng = parseFloat(suggestion.lng) || 0;
                
                this.currentSuggestions = [];
                if (this.suggestionsContainer) {
                    this.suggestionsContainer.innerHTML = '';
                    this.suggestionsContainer.style.display = 'none';
                }
                
                // Set the input value and coordinates
                this.input.value = address;
                if (this.latInput) {
                    this.latInput.value = lat;
                    this.latInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
                if (this.lngInput) {
                    this.lngInput.value = lng;
                    this.lngInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
                
                setTimeout(() => {
                    this.isSelecting = false;
                    this.input.dispatchEvent(new Event('input', { bubbles: true }));
                    this.input.dispatchEvent(new Event('change', { bubbles: true }));
                    if (typeof window.refreshFleetonixRoutePreview === 'function') {
                        window.refreshFleetonixRoutePreview();
                    }
                    if (document.activeElement === this.input) {
                        this.input.blur();
                    }
                }, 200);
            });
            
            item.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
            
            item.addEventListener('mouseenter', () => {
                this.selectedIndex = index;
                this.renderSuggestions();
            });
            
            this.suggestionsContainer.appendChild(item);
        });
    }

    setLoadingState(state) {
        this.isLoading = state;
        if (state) {
            this.suggestionsContainer.innerHTML = '<div class="suggestion-item loading">Searching…</div>';
            this.showSuggestions();
        }
    }

    addToCache(query, data) {
        if (this.cache.has(query)) {
            this.cache.delete(query);
        }
        this.cache.set(query, data);
        if (this.cache.size > this.MAX_CACHE_ITEMS) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
    }
    
    highlightMatch(text) {
        const query = this.input.value.trim();
        if (!query) return text;
        
        const regex = new RegExp(`(${query})`, 'gi');
        return text.replace(regex, '<strong>$1</strong>');
    }
    
    handleKeyDown(e) {
        if (!this.suggestionsContainer || this.suggestionsContainer.style.display === 'none') {
            return;
        }
        
        switch(e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.selectedIndex = Math.min(this.selectedIndex + 1, this.currentSuggestions.length - 1);
                this.renderSuggestions();
                break;
                
            case 'ArrowUp':
                e.preventDefault();
                this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
                this.renderSuggestions();
                break;
                
            case 'Enter':
                e.preventDefault();
                if (this.selectedIndex >= 0 && this.currentSuggestions[this.selectedIndex]) {
                    const selected = this.currentSuggestions[this.selectedIndex];
                    this.isSelecting = true;
                    this.hasSelectedSuggestion = true;
                    
                    this.currentSuggestions = [];
                    if (this.suggestionsContainer) {
                        this.suggestionsContainer.innerHTML = '';
                        this.suggestionsContainer.style.display = 'none';
                    }
                    
                    this.input.value = selected.address;
                    if (this.latInput) {
                        this.latInput.value = selected.lat;
                        this.latInput.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    if (this.lngInput) {
                        this.lngInput.value = selected.lng;
                        this.lngInput.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    
                    setTimeout(() => {
                        this.isSelecting = false;
                        this.hasSelectedSuggestion = false;
                        this.input.dispatchEvent(new Event('input', { bubbles: true }));
                        this.input.dispatchEvent(new Event('change', { bubbles: true }));
                        if (typeof window.refreshFleetonixRoutePreview === 'function') {
                            window.refreshFleetonixRoutePreview();
                        }
                    }, 200);
                }
                break;
                
            case 'Escape':
                this.hideSuggestions();
                break;
        }
    }
    
    showSuggestions() {
        if (this.suggestionsContainer && this.currentSuggestions.length > 0 && !this.isSelecting && !this.hasSelectedSuggestion) {
            this.suggestionsContainer.style.display = 'block';
        }
    }
    
    hideSuggestions() {
        if (this.suggestionsContainer) {
            this.suggestionsContainer.style.display = 'none';
            this.suggestionsContainer.innerHTML = '';
        }
    }
}

// Initialize autocomplete when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Initialize for pickup location
    const pickupInput = document.getElementById('pickup_location');
    const pickupLat = document.getElementById('pickup_latitude');
    const pickupLng = document.getElementById('pickup_longitude');
    
    if (pickupInput && pickupLat && pickupLng) {
        new AddressAutocomplete(pickupInput, pickupLat, pickupLng);
    }
    
    // Initialize for dropoff location
    const dropoffInput = document.getElementById('dropoff_location');
    const dropoffLat = document.getElementById('dropoff_latitude');
    const dropoffLng = document.getElementById('dropoff_longitude');
    
    if (dropoffInput && dropoffLat && dropoffLng) {
        new AddressAutocomplete(dropoffInput, dropoffLat, dropoffLng);
    }
});

