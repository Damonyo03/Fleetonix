/**
 * Fleetonix Export Utilities
 * Handles Excel generation using SheetJS (XLSX)
 */

document.addEventListener('DOMContentLoaded', () => {
    const exportBtn = document.getElementById('exportExcelBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            exportDtrToExcel();
        });
    }
});

function exportDtrToExcel() {
    // Check if we have data to export
    if (!window.currentDtrExportData || window.currentDtrExportData.length === 0) {
        alert("No data available to export. Please refresh or select a different date range.");
        return;
    }

    try {
        // 1. Create a new workbook
        const wb = XLSX.utils.book_new();
        
        // 2. Convert our JSON data to a worksheet
        // Our data already includes the "Signature Designation" column as an empty string per admin-dtr-monitoring.js
        const ws = XLSX.utils.json_to_sheet(window.currentDtrExportData);

        // 3. Set column widths for better readability
        const wscols = [
            {wch: 25}, // Driver Name
            {wch: 15}, // Contractor
            {wch: 15}, // Action Status
            {wch: 25}, // Precision Timestamp
            {wch: 40}, // GPS Location
            {wch: 30}, // Audit Notes
            {wch: 25}  // Signature Designation
        ];
        ws['!cols'] = wscols;

        // 4. Append worksheet to workbook
        const rangeDisplay = document.getElementById('rangeFilter') ? document.getElementById('rangeFilter').value : 'report';
        const dateDisplay = document.getElementById('dateFilter') ? document.getElementById('dateFilter').value : new Date().toISOString().split('T')[0];
        
        XLSX.utils.book_append_sheet(wb, ws, "DTR Report");

        // 5. Generate Excel file and trigger download
        const filename = `Fleetonix_DTR_${rangeDisplay}_${dateDisplay}.xlsx`;
        XLSX.writeFile(wb, filename);

    } catch (error) {
        console.error("Export failed:", error);
        alert("An error occurred while generating the Excel file. Please try again.");
    }
}
