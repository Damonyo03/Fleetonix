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
export function exportToExcel(data, fileName, sheetName = 'Sheet1') {
    if (!window.XLSX) {
        console.error("SheetJS (XLSX) library not loaded.");
        alert("Export failed: XLSX library not loaded. Please contact support.");
        return;
    }

    if (!data || data.length === 0) {
        alert("No data available to export.");
        return;
    }

    try {
        // Create worksheet from JSON data
        const worksheet = XLSX.utils.json_to_sheet(data);
        
        // Create workbook and append worksheet
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        
        // Generate and download file
        XLSX.writeFile(workbook, fileName);
    } catch (error) {
        console.error("Excel Export Error:", error);
        alert("An error occurred during export: " + error.message);
    }
}

/**
 * Maps complex Firestore objects to flat objects suitable for Excel
 * @param {Array} tickets - Array of trip ticket objects
 * @returns {Array} - Flattened objects
 */
export function mapTicketsForExport(tickets) {
    return tickets.map(t => ({
        "Trip ID": t.id || 'N/A',
        "Date": t.schedule_date || '—',
        "Time": t.schedule_time || '—',
        "Client": t.client_name || '—',
        "Driver": t.driver_name || '—',
        "Vehicle": t.vehicle_assigned || t.vehicle_type || '—',
        "Plate Number": t.plate_number || '—',
        "Pickup Location": t.pickup_location || '—',
        "Dropoff Location": t.dropoff_location || '—',
        "Distance (KM)": parseFloat(t.total_km_travelled || t.totalKmTravelled || 0).toFixed(2),
        "Fare/Cost": t.total_fare || 0,
        "Status": t.status || 'completed',
        "Completed At": t.completed_at?.toDate ? t.completed_at.toDate().toLocaleString() : (t.completed_at || '—')
    }));
}
