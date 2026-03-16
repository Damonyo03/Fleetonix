/**
 * Data handling utilities for Firestore
 */

/**
 * Strips undefined values from an object and replaces them with defaults
 * to prevent Firestore setDoc/addDoc/updateDoc errors.
 * @param {Object} data - The object to sanitize
 * @param {Object} defaults - Optional default values for specific keys
 * @returns {Object} - Clean data object
 */
export function sanitizeFirestoreData(data, defaults = {}) {
    const cleanData = {};
    
    // Default values for common fields to ensure they exist for Android/Web
    const globalDefaults = {
        client_phone: "",
        client_email: "",
        company_name: "N/A",
        client_name: "N/A",
        pickup_location: "N/A",
        dropoff_location: "N/A",
        special_instructions: "",
        status: "pending",
        trip_phase: "pending",
        ...defaults
    };

    Object.keys(data).forEach(key => {
        let value = data[key];
        
        // If value is undefined or null, try to use a default or empty string
        if (value === undefined || value === null) {
            value = globalDefaults[key] !== undefined ? globalDefaults[key] : "";
        }
        
        cleanData[key] = value;
    });

    // Ensure missing global defaults are added if expected at the root
    Object.keys(globalDefaults).forEach(key => {
        if (cleanData[key] === undefined) {
            // Only add if it's a field we commonly expect to see
            // (Avoiding bloat, but ensuring existence for Android models)
            if (['client_phone', 'client_email', 'status', 'trip_phase'].includes(key)) {
                cleanData[key] = globalDefaults[key];
            }
        }
    });

    return cleanData;
}

/**
 * Generates a numeric ID for compatibility with older Android models 
 * that expect Int for schedule_id or booking_id.
 */
export function generateNumericId() {
    return Math.floor(Date.now() / 1000);
}
