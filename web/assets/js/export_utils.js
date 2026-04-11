/**
 * Fleetonix Export Utilities
 * Handles Excel generation using SheetJS (XLSX)
 */

// Note: Export buttons were removed from DTR Monitoring UI per user request.
// This file is retained for potential future export requirements in other modules.

export function exportDataToExcel(data, filename, sheetName = 'Report') {
    if (!data || data.length === 0) {
        alert("No data available to export.");
        return;
    }

    try {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        XLSX.writeFile(wb, filename);
    } catch (error) {
        console.error("Export failed:", error);
        alert("An error occurred while generating the Excel file.");
    }
}
