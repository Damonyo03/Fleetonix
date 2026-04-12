/**
 * Fleetonix - Export Utilities
 * Handles conversion of data to Excel format using ExcelJS
 */

/**
 * Exports data to an Excel file with advanced formatting (Signatures and Hyperlinks)
 * @param {Array} data - Array of objects for the main table
 * @param {String} fileName - The name of the file
 * @param {String} sheetName - Optional name for the worksheet
 * @param {Array} headerLines - Optional array of strings for top header (one per row)
 */
export async function exportToExcel(data, fileName, sheetName = 'Sheet1', headerLines = []) {
    if (typeof ExcelJS === 'undefined') {
        console.error("ExcelJS library not loaded.");
        alert("Export failed: ExcelJS library not loaded.");
        return;
    }

    if (!data || data.length === 0) {
        alert("No data available to export.");
        return;
    }

    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(sheetName);

        // 1. Add Header Lines
        headerLines.forEach((line, index) => {
            const row = worksheet.getRow(index + 1);
            row.getCell(1).value = line;
            row.getCell(1).font = { bold: true, size: 12 };
        });

        const startRow = headerLines.length + 3; // Gap between header and table

        // 2. Define Columns
        const keys = Object.keys(data[0]).filter(k => !k.startsWith('_'));
        worksheet.getRow(startRow).values = keys;
        worksheet.getRow(startRow).font = { bold: true };
        worksheet.getRow(startRow).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        };

        // 3. Add Rows
        let currentRow = startRow + 1;
        for (const item of data) {
            const rowValues = keys.map(k => item[k]);
            const row = worksheet.addRow(rowValues);
            
            // Handle Map Hyperlinks for Pickup place
            const placeColIndex = keys.indexOf("Pickup place") + 1;
            if (item._pickup_coords && item._pickup_coords.lat) {
                const cell = row.getCell(placeColIndex);
                cell.value = {
                    text: item["Pickup place"],
                    hyperlink: `https://www.google.com/maps?q=${item._pickup_coords.lat},${item._pickup_coords.lng}`,
                    tooltip: 'Click to view on Google Maps'
                };
                cell.font = { color: { argb: 'FF0000FF' }, underline: true };
            }

            currentRow++;
        }

        // 4. Formatting
        worksheet.columns.forEach((column, i) => {
            column.width = 25;
            if (keys[i] === "Pickup place") column.width = 50;
        });

        // 5. Download
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        window.URL.revokeObjectURL(url);

    } catch (error) {
        console.error("ExcelJS Export Error:", error);
        alert("An error occurred during export: " + error.message);
    }
}

/**
 * Helper to format Firestore timestamps, dates, and other values for Excel cells.
 */
function formatValue(val, type = 'string') {
    if (!val || val === '—') return '—';
    
    // Handle Firestore Timestamps or generic objects that look like them
    let d = null;
    if (val && typeof val === 'object') {
        if (val.toDate) d = val.toDate();
        else if (val.seconds) d = new Date(val.seconds * 1000);
        else if (val instanceof Date) d = val;
    } else if (typeof val === 'string' && !isNaN(Date.parse(val))) {
        d = new Date(val);
    }

    if (d) {
        if (type === 'time') {
            return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        }
        if (type === 'date') {
            return d.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
        }
        return d.toLocaleString('en-US', { 
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hour12: true 
        });
    }

    // Fallback for numeric strings
    if (type === 'number') {
        const n = parseFloat(val);
        return isNaN(n) ? val : n;
    }

    return String(val);
}

/**
 * Official GCR Consortium Export
 * Maps Trip Ticket documents to the exact 10 columns required for the official ledger.
 */
export function mapTicketsForExport(tickets) {
    return tickets.map(t => {
        const date = formatValue(t.schedule_date || t.completed_at, 'date');
        const startTime = formatValue(t.time_of_departure || t.accepted_at, 'time');
        const arrivalAt = formatValue(t.time_of_arrival || t.timeOfArrival, 'time');
        
        // Handle Multi-Segment Format with Geocoding Transparency
        let pickupLocation = t.pickup_location || t.location_name || '—';
        let dropoffLocation = t.dropoff_location || '—';
        
        if (t.segments && Array.isArray(t.segments) && t.segments.length > 0) {
            pickupLocation = t.segments[0].pickup || '—';
            dropoffLocation = t.segments[t.segments.length - 1].dropoff || '—';
        }

        return {
            "DATE/TIME": date,
            "START TIME": startTime,
            "PICK-UP PLACE": pickupLocation,
            "ARRIVAL TIME": arrivalAt,
            "DROP-OFF PLACE": dropoffLocation,
            "PASSENGER'S NAME": t.passenger_name || t.client_name || '—',
            "PURPOSE": t.isOfficial !== false ? "OFFICIAL" : "PERSONAL",
            "ODOMETER": formatValue(t.odometer_reading_end || t.odometer_end || 0, 'number'),
            "OVERTIME": (t.is_overtime || t.isOvertime) ? "YES" : "NO"
        };
    });
}

/**
 * Specialized export for the GCR Consortium Daily Vehicle Trip Ticket
 */
export async function exportGCRTripTicket(data, context) {
    if (typeof ExcelJS === 'undefined') {
        alert("ExcelJS library not loaded.");
        return;
    }

    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Trip Ticket');

        // 1. Branding & Header Section
        // Clear Row 1
        worksheet.getRow(1).values = [];

        // Title (Row 2) - Move slightly right if logo is on left, or merge full width
        worksheet.mergeCells('A2:K2');
        const titleCell = worksheet.getCell('A2');
        titleCell.value = 'DAILY VEHICLE TRIP TICKET';
        titleCell.font = { name: 'Arial Black', size: 16, bold: true };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

        // Metadata Labels (Row 3, 4)
        worksheet.getCell('A3').value = 'VEHICLE DETAILS:';
        worksheet.getCell('B3').value = `${context.vehicle} (${context.plate})`;
        worksheet.getRow(3).height = 20;

        worksheet.getCell('A4').value = 'TRANSPORT OFFICER:';
        worksheet.getCell('B4').value = context.driverName;
        worksheet.getRow(4).height = 20;

        worksheet.getCell('I3').value = 'FOR THE MONTH OF:';
        worksheet.getCell('J3').value = `${context.month} ${context.year}`;
        worksheet.mergeCells('J3:K3');

        // Styling Labels
        ['A3', 'A4', 'I3'].forEach(cellId => {
            const cell = worksheet.getCell(cellId);
            cell.font = { bold: true, size: 11 };
            cell.alignment = { horizontal: 'left' };
        });

        // 2. Table Headers (Row 6)
        const headerRowNumber = 6;
        const keys = Object.keys(data[0]).filter(k => !k.startsWith('_'));
        const headerRow = worksheet.getRow(headerRowNumber);
        headerRow.values = keys;
        headerRow.height = 30;
        
        headerRow.eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FF000000' } };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFFFF00' } // Yellow
            };
            cell.border = {
                top: { style: 'medium' },
                left: { style: 'thin' },
                bottom: { style: 'medium' },
                right: { style: 'thin' }
            };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });

        // 3. Data Rows
        for (const item of data) {
            const rowValues = keys.map(k => item[k]);
            const row = worksheet.addRow(rowValues);
            row.height = 25;
            
            // Borders for all cells
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
                cell.alignment = { vertical: 'middle' };
            });
        }

        // 4. Logo Injection (Placeholder or fetched)
        try {
            const logoUrl = '../img/logo.jpg';
            const response = await fetch(logoUrl);
            const blob = await response.blob();
            const reader = new FileReader();
            
            const logoData = await new Promise((resolve) => {
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });

            const logoId = workbook.addImage({
                base64: logoData,
                extension: 'png',
            });
            
            // Position logo at the top center, floating above the title areas
            // Or better, top left corner but small
            worksheet.addImage(logoId, {
                tl: { col: 4.5, row: 0 },
                ext: { width: 100, height: 50 },
                editAs: 'absolute'
            });
        } catch (err) {
            console.warn("Logo injection failed.");
        }

        // 5. Column Width Optimization
        worksheet.columns.forEach((column, i) => {
            let maxLength = 0;
            column.eachCell({ includeEmpty: true }, (cell) => {
                const columnLength = cell.value ? cell.value.toString().length : 10;
                if (columnLength > maxLength) maxLength = columnLength;
            });
            column.width = maxLength < 12 ? 12 : maxLength + 5;
            if (column.header && column.header.includes('PLACE')) column.width = 40;
        });

        // 6. Download
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `Trip_Ticket_${context.driverName.replace(/\s+/g, '_')}_${context.month}_${context.year}.xlsx`;
        anchor.click();
        window.URL.revokeObjectURL(url);

    } catch (error) {
        console.error("GCR Export Error:", error);
        alert("Failed to generate official trip ticket: " + error.message);
    }
}

