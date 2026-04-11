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
 * Official GCR Consortium Export
 * Maps Trip Ticket documents to the exact 10 columns required for the official ledger.
 */
export function mapTicketsForExport(tickets) {
    return tickets.map(t => {
        const date = t.schedule_date || (t.completed_at?.toDate ? t.completed_at.toDate().toLocaleDateString() : '—');
        
        // Handle Multi-Segment Format with Geocoding Transparency
        let pickupLocation = t.pickup_location || t.location_name || '—';
        let dropoffLocation = t.dropoff_location || '—';
        
        if (t.segments && Array.isArray(t.segments) && t.segments.length > 0) {
            pickupLocation = t.segments[0].pickup || '—';
            dropoffLocation = t.segments[t.segments.length - 1].dropoff || '—';
        }

        return {
            "DATE/TIME": date,
            "DEPARTURE TIME": t.time_of_departure || t.accepted_at || '—',
            "PICK-UP PLACE": pickupLocation,
            "ARRIVAL TIME": t.time_of_arrival || '—',
            "DROP-OFF PLACE": dropoffLocation,
            "PASSENGER'S NAME": t.passenger_name || t.client_name || '—',
            "SIGNATURE": "", // Image will be overlaid here
            "PURPOSE": t.isOfficial !== false ? "OFFICIAL" : "PERSONAL",
            "ODOMETER": t.odometer_reading_end || t.odometer_end || '—',
            "OVERTIME": t.is_overtime ? "YES" : "NO",
            // Hidden fields for processing
            "_raw_signature": t.driver_signature || null,
            "_pickup_coords": t.segments?.[0]?.pickup_lat ? { lat: t.segments[0].pickup_lat, lng: t.segments[0].pickup_lng } : (t.latitude ? { lat: t.latitude, lng: t.longitude } : null)
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
        // Title (Row 2)
        worksheet.mergeCells('B2:J2');
        const titleCell = worksheet.getCell('B2');
        titleCell.value = 'DAILY VEHICLE TRIP TICKET';
        titleCell.font = { name: 'Arial Black', size: 14, bold: true };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

        // Metadata Labels (Row 3, 4)
        worksheet.getCell('A3').value = 'VEHICLE DETAILS:';
        worksheet.getCell('B3').value = `${context.vehicle} (${context.plate})`;
        worksheet.getCell('A4').value = 'TRANSPORT OFFICER:';
        worksheet.getCell('B4').value = context.driverName;

        worksheet.getCell('I3').value = 'FOR THE MONTH OF:';
        worksheet.getCell('J3').value = context.month;
        worksheet.getCell('K3').value = context.year;

        // Styling Labels
        ['A3', 'A4', 'I3'].forEach(cellId => {
            const cell = worksheet.getCell(cellId);
            cell.font = { bold: true };
            cell.alignment = { horizontal: 'right' };
        });

        // 2. Table Headers (Row 6)
        const headerRowNumber = 6;
        const keys = Object.keys(data[0]).filter(k => !k.startsWith('_'));
        const headerRow = worksheet.getRow(headerRowNumber);
        headerRow.values = keys;
        
        headerRow.eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FF000000' } };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFFFF00' } // Yellow
            };
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });

        // Column Widths
        worksheet.columns = keys.map(k => {
            let width = 15;
            if (k.includes('PLACE') || k.includes('NAME')) width = 30;
            return { header: k, key: k, width: width };
        });

        // 3. Data Rows
        let rowCount = 0;
        for (const item of data) {
            const rowValues = keys.map(k => item[k]);
            const row = worksheet.addRow(rowValues);
            
            // Signature Column (Index 7)
            if (item._raw_signature && item._raw_signature.startsWith('data:image')) {
                try {
                    const imageId = workbook.addImage({
                        base64: item._raw_signature,
                        extension: 'png',
                    });
                    worksheet.addImage(imageId, {
                        tl: { col: 6, row: row.number - 1 },
                        ext: { width: 80, height: 35 }
                    });
                    row.height = 40;
                } catch (e) {
                    console.error("Signature image error:", e);
                }
            }

            // Borders for all cells
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
            rowCount++;
        }

        // 4. Logo Injection (Placeholder or fetched)
        try {
            // Attempt to fetch logo from web/img/logo.jpg if it exists in expected path
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
            
            worksheet.addImage(logoId, {
                tl: { col: 4, row: 0 },
                ext: { width: 120, height: 60 }
            });
        } catch (err) {
            console.warn("Logo injection failed, skipping. Error:", err);
            worksheet.getCell('E1').value = 'FLEETONIX';
            worksheet.getCell('E1').font = { bold: true, size: 20 };
        }

        // 5. Download
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

