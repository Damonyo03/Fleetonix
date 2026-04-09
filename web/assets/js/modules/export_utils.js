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
            
            // Handle Signature Embedding
            if (item._raw_signature && item._raw_signature.startsWith('data:image')) {
                const imageId = workbook.addImage({
                    base64: item._raw_signature,
                    extension: 'png',
                });
                
                // Position image in the "Signature" column
                const sigColIndex = keys.indexOf("Signature") + 1;
                worksheet.addImage(imageId, {
                    tl: { col: sigColIndex - 0.9, row: row.number - 0.9 },
                    ext: { width: 100, height: 40 }
                });
                row.height = 45; // Adjust row height to fit signature
            }

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
 * Maps Trip Ticket documents to the exact columns required for the official ledger.
 */
export function mapTicketsForExport(tickets) {
    return tickets.map(t => {
        const date = t.schedule_date || (t.completed_at?.toDate ? t.completed_at.toDate().toLocaleDateString() : '—');
        
        // Handle Multi-Segment Format with Geocoding Transparency
        let routeDescription = t.pickup_location || t.location_name || '—';
        if (t.segments && Array.isArray(t.segments) && t.segments.length > 0) {
            routeDescription = t.segments.map((s, i) => `[P${i+1}] ${s.pickup} -> [D${i+1}] ${s.dropoff}`).join(' | ');
        }

        return {
            "Date/Day": date,
            "Departure Time": t.time_of_departure || t.accepted_at || '—',
            "Pickup place": routeDescription,
            "Arrived time": t.time_of_arrival || '—',
            "Passenger's name": t.passenger_name || t.client_name || '—',
            "Signature": "", // Image will be overlaid here
            "Purpose": t.isOfficial !== false ? "OFFICIAL" : "PERSONAL",
            "Odometer": t.odometer_reading_end || t.odometer_end || '—',
            "Overtime": t.is_overtime ? "YES" : "NO",
            // Hidden fields for processing
            "_raw_signature": t.driver_signature || null,
            "_pickup_coords": t.segments?.[0]?.pickup_lat ? { lat: t.segments[0].pickup_lat, lng: t.segments[0].pickup_lng } : (t.latitude ? { lat: t.latitude, lng: t.longitude } : null)
        };
    });
}

