import * as XLSX from "xlsx";

export function exportToExcel(
  sheets: { name: string; headers: string[]; rows: string[][] }[],
  fileName: string
) {
  try {
    const wb = XLSX.utils.book_new();

    sheets.forEach((sheet) => {
      // 2D Array format: first row is headers, remaining are values
      const data = [sheet.headers, ...sheet.rows];
      const ws = XLSX.utils.aoa_to_sheet(data);

      // Highly optimized single-pass column auto-width calculation with max row sampling (first 200 rows)
      // to keep export times near-instantaneous even for very large datasets.
      const wscols = sheet.headers.map((h) => Math.min(Math.max((h || "").toString().length + 2, 8), 50));
      const rowCount = Math.min(sheet.rows.length, 200);
      const colCount = sheet.headers.length;
      
      for (let r = 0; r < rowCount; r++) {
        const row = sheet.rows[r];
        if (!row) continue;
        for (let c = 0; c < colCount; c++) {
          const val = row[c];
          if (val !== undefined && val !== null) {
            const len = val.toString().length;
            if (len + 2 > wscols[c]) {
              wscols[c] = Math.min(len + 2, 50); // Cap column width at 50 to prevent crazy massive widths
            }
          }
        }
      }
      ws["!cols"] = wscols.map(w => ({ wch: w }));

      // Excel worksheet names have a maximum length of 31 characters
      // and cannot contain certain special characters: \ / ? * : [ ]
      const safeName = sheet.name
        .replace(/[\\/?*:[\]]/g, "_")
        .substring(0, 31) || "Sheet1";

      XLSX.utils.book_append_sheet(wb, ws, safeName);
    });

    // Write file
    XLSX.writeFile(wb, `${fileName.replace(/\.[^/.]+$/, "")}.xlsx`);
  } catch (error) {
    console.error("Error exporting to Excel:", error);
    alert("Could not export spreadsheet to Excel. Check console for details.");
  }
}

export function formatToCSV(headers: string[], rows: string[][]): string {
  const rowCount = rows.length;
  const colCount = headers.length;
  const lines: string[] = new Array(rowCount + 1);

  // Format headers
  const headerCells = new Array(colCount);
  for (let c = 0; c < colCount; c++) {
    const h = headers[c];
    const s = h === undefined || h === null ? "" : h.toString();
    if (s.includes(",") || s.includes("\n") || s.includes('"')) {
      headerCells[c] = `"${s.replace(/"/g, '""')}"`;
    } else {
      headerCells[c] = s;
    }
  }
  lines[0] = headerCells.join(",");

  // Format rows
  for (let r = 0; r < rowCount; r++) {
    const row = rows[r];
    const cells = new Array(colCount);
    for (let c = 0; c < colCount; c++) {
      const cell = row[c];
      const s = cell === undefined || cell === null ? "" : cell.toString();
      if (s.includes(",") || s.includes("\n") || s.includes('"')) {
        cells[c] = `"${s.replace(/"/g, '""')}"`;
      } else {
        cells[c] = s;
      }
    }
    lines[r + 1] = cells.join(",");
  }

  return lines.join("\r\n");
}
