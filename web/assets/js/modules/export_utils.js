/**
 * Fleetonix - Export Utilities
 * Handles conversion of data to Excel (XLSX) format using SheetJS
 */

/**
 * Exports an array of objects to an Excel file
 * @param {Array} data - Array of objects to export
 * @param {String} fileName - The name of the file (e.g., 'trip_report.xlsx')
 * @param {String} sheetName - Optional name for the worksheet
 */
/**
 * Exports data to an Excel file with optional custom header rows
 * @param {Array} data - Array of objects for the main table
 * @param {String} fileName - The name of the file
 * @param {String} sheetName - Optional name for the worksheet
 * @param {Array} headerLines - Optional array of strings for top header (one per row)
 */
export function exportToExcel(data, fileName, sheetName = 'Sheet1', headerLines = []) {
    if (!window.XLSX) {
        console.error("SheetJS (XLSX) library not loaded.");
        alert("Export failed: XLSX library not loaded.");
        return;
    }

    if (!data || data.length === 0) {
        alert("No data available to export.");
        return;
    }

    try {
        const workbook = XLSX.utils.book_new();
        let worksheet;

        if (headerLines.length > 0) {
            // Create worksheet starting with header lines (AOAs)
            const aoa = headerLines.map(line => [line]);
            worksheet = XLSX.utils.aoa_to_sheet(aoa);
            
            // Add JSON data starting below the header
            XLSX.utils.sheet_add_json(worksheet, data, { 
                origin: `A${headerLines.length + 2}` // +2 to leave a blank row between header and table
            });
        } else {
            worksheet = XLSX.utils.json_to_sheet(data);
        }
        
        // Auto-size columns (Simplified)
        const maxLen = data.reduce((acc, row) => Math.max(acc, ...Object.values(row).map(v => (v || '').toString().length)), 10);
        worksheet['!cols'] = Object.keys(data[0]).map(() => ({ wch: Math.min(maxLen, 30) }));

        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        XLSX.writeFile(workbook, fileName);
    } catch (error) {
        console.error("Excel Export Error:", error);
        alert("An error occurred during export: " + error.message);
    }
}

/**
 * Maps Trip Ticket documents to the exact columns required for the official ledger.
 */
export function mapTicketsForExport(tickets) {
    return tickets.map(t => {
        const date = t.schedule_date || (t.completed_at?.toDate ? t.completed_at.toDate().toLocaleDateString() : '—');
        return {
            "Date/Day": date,
            "Departure Time": t.time_of_departure || t.accepted_at || '—',
            "Pickup place": t.pickup_location || '—',
            "Arrived time": t.time_of_arrival || t.timeOfArrival || '—',
            "Passenger's name": t.client_name || t.passenger_name || '—',
            "Signature": "", // Placeholder for physical sign-off
            "Purpose": t.isOfficial ? "OFFICIAL" : "PERSONAL",
            "Odometer": t.odometer_reading_end || t.odometer_end || '—',
            "Overtime": t.is_overtime ? "YES" : "NO"
        };
    });
}

