import React, { useState, useEffect } from "react";
import { 
  Plus, 
  Trash2, 
  Download, 
  Copy, 
  Check, 
  FileSpreadsheet, 
  Sparkles, 
  ArrowLeft,
  X,
  History,
  CornerDownLeft,
  RefreshCw,
  Info
} from "lucide-react";
import { ExtractionResult, ExtractedTable } from "../types";
import { exportToExcel, formatToCSV } from "../utils/excel";

interface SpreadsheetEditorProps {
  initialResult: ExtractionResult;
  onBack: () => void;
  onUpdate: (updatedResult: ExtractionResult) => void;
}

export function SpreadsheetEditor({ initialResult, onBack, onUpdate }: SpreadsheetEditorProps) {
  // Extract all sheets/tables from result
  // If result.allTables is empty, use the main results as the single sheet
  const [sheets, setSheets] = useState<{ name: string; headers: string[]; rows: string[][] }[]>([]);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; colIndex: number } | null>(null);
  const [editingHeader, setEditingHeader] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  
  // AI Refinement state
  const [refinePrompt, setRefinePrompt] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [refineError, setRefineError] = useState("");
  
  // Save confirmation states
  const [copied, setCopied] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  // Initialize sheets from initialResult
  useEffect(() => {
    const list: { name: string; headers: string[]; rows: string[][] }[] = [];
    
    // Add primary table defensively
    const primaryHeaders = Array.isArray(initialResult.headers) ? [...initialResult.headers] : [];
    const primaryRows = Array.isArray(initialResult.rows) 
      ? initialResult.rows.map((row) => Array.isArray(row) ? [...row] : []) 
      : [];

    list.push({
      name: initialResult.sheetName || "Primary Data",
      headers: primaryHeaders,
      rows: primaryRows,
    });
    
    // Add other sub-tables if detected with extreme defense against non-iterables
    if (initialResult.allTables && Array.isArray(initialResult.allTables)) {
      initialResult.allTables.forEach((t) => {
        if (t && t.name !== initialResult.sheetName) {
          const subHeaders = Array.isArray(t.headers) ? [...t.headers] : [];
          const subRows = Array.isArray(t.rows) 
            ? t.rows.map((row) => Array.isArray(row) ? [...row] : []) 
            : [];

          list.push({
            name: t.name || `Table ${list.length + 1}`,
            headers: subHeaders,
            rows: subRows,
          });
        }
      });
    }
    
    setSheets(list);
    setActiveSheetIndex(0);
  }, [initialResult]);

  const activeSheet = sheets[activeSheetIndex] || { name: "", headers: [], rows: [] };

  // Handler to update the sheets state and propagate back to app
  const updateSheets = (newSheets: typeof sheets) => {
    setSheets(newSheets);
    
    // Form updated ExtractionResult
    const primary = newSheets[0];
    const subTables = newSheets.slice(1).map((s) => ({
      name: s.name,
      headers: s.headers,
      rows: s.rows,
    }));
    
    onUpdate({
      sheetName: primary.name,
      headers: primary.headers,
      rows: primary.rows,
      confidenceScore: initialResult.confidenceScore,
      summary: initialResult.summary,
      allTables: subTables,
    });
  };

  // Inline Cell Editing
  const startEditingCell = (rowIndex: number, colIndex: number, currentVal: string) => {
    setEditingCell({ rowIndex, colIndex });
    setEditingHeader(null);
    setEditValue(currentVal);
  };

  const saveCellEdit = () => {
    if (!editingCell) return;
    const { rowIndex, colIndex } = editingCell;
    const newSheets = [...sheets];
    newSheets[activeSheetIndex].rows[rowIndex][colIndex] = editValue;
    updateSheets(newSheets);
    setEditingCell(null);
  };

  // Inline Header Editing
  const startEditingHeader = (colIndex: number, currentVal: string) => {
    setEditingHeader(colIndex);
    setEditingCell(null);
    setEditValue(currentVal);
  };

  const saveHeaderEdit = () => {
    if (editingHeader === null) return;
    const newSheets = [...sheets];
    newSheets[activeSheetIndex].headers[editingHeader] = editValue;
    updateSheets(newSheets);
    setEditingHeader(null);
  };

  // Keyboard accessibility
  const handleKeyDown = (e: React.KeyboardEvent, type: "cell" | "header") => {
    if (e.key === "Enter") {
      if (type === "cell") saveCellEdit();
      if (type === "header") saveHeaderEdit();
    } else if (e.key === "Escape") {
      setEditingCell(null);
      setEditingHeader(null);
    }
  };

  // Handle Sheet Rename
  const handleRenameSheet = (newName: string) => {
    const newSheets = [...sheets];
    newSheets[activeSheetIndex].name = newName;
    updateSheets(newSheets);
  };

  // Add Row
  const handleAddRow = () => {
    const newSheets = [...sheets];
    const emptyRow = Array(activeSheet.headers.length).fill("");
    newSheets[activeSheetIndex].rows.push(emptyRow);
    updateSheets(newSheets);
  };

  // Delete Row
  const handleDeleteRow = (rowIndex: number) => {
    const newSheets = [...sheets];
    newSheets[activeSheetIndex].rows.splice(rowIndex, 1);
    updateSheets(newSheets);
  };

  // Add Column
  const handleAddColumn = () => {
    const columnName = prompt("Enter new column name:");
    if (!columnName) return;
    
    const newSheets = [...sheets];
    newSheets[activeSheetIndex].headers.push(columnName);
    newSheets[activeSheetIndex].rows = newSheets[activeSheetIndex].rows.map((row) => [...row, ""]);
    updateSheets(newSheets);
  };

  // Delete Column
  const handleDeleteColumn = (colIndex: number) => {
    if (activeSheet.headers.length <= 1) {
      alert("Spreadsheet must have at least 1 column.");
      return;
    }
    const newSheets = [...sheets];
    newSheets[activeSheetIndex].headers.splice(colIndex, 1);
    newSheets[activeSheetIndex].rows = newSheets[activeSheetIndex].rows.map((row) => {
      const updatedRow = [...row];
      updatedRow.splice(colIndex, 1);
      return updatedRow;
    });
    updateSheets(newSheets);
  };

  // AI Refinement Copilot Service Trigger
  const handleAIQuery = async () => {
    if (!refinePrompt.trim()) return;
    setIsRefining(true);
    setRefineError("");
    
    try {
      const response = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentData: {
            sheetName: activeSheet.name,
            headers: activeSheet.headers,
            rows: activeSheet.rows,
            confidenceScore: initialResult.confidenceScore,
            summary: initialResult.summary,
          },
          instruction: refinePrompt,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || "Failed to refine data");
      }

      const updatedData = (await response.json()) as ExtractionResult;
      
      // Update active sheet or reconstruct list of sheets
      const newSheets = [...sheets];
      newSheets[activeSheetIndex] = {
        name: updatedData.sheetName || activeSheet.name,
        headers: updatedData.headers,
        rows: updatedData.rows,
      };

      updateSheets(newSheets);
      setRefinePrompt("");
    } catch (err: any) {
      console.error(err);
      setRefineError(err.message || "An error occurred during AI table updates.");
    } finally {
      setIsRefining(false);
    }
  };

  // Trigger Excel File Download
  const handleDownloadExcel = () => {
    exportToExcel(sheets, activeSheet.name || "extracted_spreadsheet");
  };

  // Trigger CSV File Download
  const handleDownloadCSV = () => {
    const csvContent = formatToCSV(activeSheet.headers, activeSheet.rows);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${activeSheet.name.toLowerCase().replace(/ /g, "_")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Clipboard Copier
  const handleCopyToClipboard = () => {
    const csvContent = formatToCSV(activeSheet.headers, activeSheet.rows);
    navigator.clipboard.writeText(csvContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full space-y-6 flex flex-col h-full animate-fade-in" id="spreadsheet-editor-root">
      
      {/* Top action row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-5" id="editor-actions-header">
        <div className="flex items-center space-x-3">
          <button
            id="back-to-uploader"
            onClick={onBack}
            className="p-2 border border-gray-150 hover:border-gray-200 hover:bg-gray-50 rounded-xl transition-all cursor-pointer mr-1"
          >
            <ArrowLeft className="w-4 h-4 text-gray-600" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 rounded-full" id="confidence-rating">
                Confidence: {Math.round(initialResult.confidenceScore * 100)}%
              </span>
              <span className="text-xs text-gray-400">|</span>
              <span className="text-xs font-medium text-gray-500">
                {activeSheet.rows.length} rows • {activeSheet.headers.length} columns
              </span>
            </div>
            
            {/* Direct Edit Sheet Name Input */}
            <input
              id="sheet-name-title-input"
              type="text"
              value={activeSheet.name}
              onChange={(e) => handleRenameSheet(e.target.value)}
              className="text-xl font-bold bg-transparent border-0 hover:bg-gray-50 focus:bg-white focus:ring-1 focus:ring-emerald-400 focus:outline-none rounded-lg px-2 py-1 -ml-2 text-gray-950 mt-1 max-w-[280px] sm:max-w-[400px]"
              title="Click to rename sheet"
              placeholder="Sheet Name"
            />
          </div>
        </div>

        {/* Exporters and copy targets */}
        <div className="flex flex-wrap items-center gap-2" id="exporter-button-tray">
          <button
            id="copy-csv-btn"
            onClick={handleCopyToClipboard}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 hover:text-gray-950 hover:bg-gray-50 rounded-xl text-xs font-medium transition duration-200 select-none cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-600 font-semibold">Copied CSV!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy to Clipboard</span>
              </>
            )}
          </button>

          <button
            id="download-csv-btn"
            onClick={handleDownloadCSV}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 hover:text-gray-950 hover:bg-gray-50 rounded-xl text-xs font-medium transition duration-200 select-none cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download CSV</span>
          </button>

          <button
            id="download-excel-btn"
            onClick={handleDownloadExcel}
            className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-sm hover:shadow hover:bg-emerald-700 active:scale-98 transition duration-200 select-none cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Download Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Sheet Summary callout box */}
      {initialResult.summary && (
        <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl text-xs leading-relaxed text-gray-600 flex gap-2.5" id="spreadsheet-summary-card">
          <Info className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <strong className="text-gray-800 font-semibold">Document Summation: </strong>
            {initialResult.summary}
          </div>
        </div>
      )}

      {/* Multi-Sheet Tab Navigation */}
      {sheets.length > 1 && (
        <div className="flex border-b border-gray-100 overflow-x-auto select-none" id="sheet-tab-trays">
          {sheets.map((sheet, idx) => (
            <button
              key={idx}
              id={`sheet-tab-${idx}`}
              onClick={() => {
                setActiveSheetIndex(idx);
                setEditingCell(null);
                setEditingHeader(null);
              }}
              className={`px-4 py-2.5 text-xs font-semibold mr-2 border-b-2 whitespace-nowrap cursor-pointer transition-all ${
                activeSheetIndex === idx 
                  ? "border-emerald-500 text-emerald-600 font-bold" 
                  : "border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-100"
              }`}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      )}

      {/* Interactive Spreadsheet Spreadsheet Grid */}
      <div className="flex-1 bg-white border border-gray-150 rounded-2xl overflow-hidden shadow-sm flex flex-col" id="spreadsheet-viewport shadow">
        
        {/* Scrollable Container */}
        <div className="overflow-auto max-h-[500px]" id="excel-table-scroll-container">
          <table className="w-full border-collapse border-spacing-0 table-fixed min-w-[700px]" id="editable-spreadsheet-table">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-150">
                
                {/* Index Row prefix */}
                <th className="w-10 text-center text-[10px] font-bold text-gray-400 select-none bg-gray-50 border-r border-gray-150 py-2 sticky top-0">
                  #
                </th>

                {/* Headers Map */}
                {activeSheet.headers.map((header, colIdx) => (
                  <th 
                    key={colIdx} 
                    id={`table-header-${colIdx}`}
                    className="relative group border-r border-gray-150 py-2.5 px-3 text-left text-xs font-semibold text-gray-700 bg-gray-50 select-none sticky top-0 hover:bg-gray-100 transition-colors"
                  >
                    {editingHeader === colIdx ? (
                      <input
                        id={`header-input-field-${colIdx}`}
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={saveHeaderEdit}
                        onKeyDown={(e) => handleKeyDown(e, "header")}
                        autoFocus
                        className="w-full px-1.5 py-0.5 text-xs border border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-400 rounded bg-white text-gray-900"
                      />
                    ) : (
                      <div className="flex items-center justify-between">
                        <span 
                          className="cursor-pointer truncate block flex-1" 
                          title="Double-click to rename column"
                          onDoubleClick={() => startEditingHeader(colIdx, header)}
                        >
                          {header}
                        </span>
                        
                        {/* Column Delete Target */}
                        <button
                          id={`delete-column-btn-${colIdx}`}
                          onClick={() => handleDeleteColumn(colIdx)}
                          className="opacity-0 group-hover:opacity-100 ml-1 p-0.5 text-gray-400 hover:text-red-500 rounded bg-gray-100 hover:bg-red-50 transition-all cursor-pointer"
                          title="Delete column"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </th>
                ))}
                
                {/* Pad width target control */}
                <th className="w-12 bg-gray-50 py-1 sticky top-0 opacity-80">
                  {/* Blank */}
                </th>
              </tr>
            </thead>

            {/* Rows list */}
            <tbody>
              {activeSheet.rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="border-b border-gray-100 hover:bg-gray-50/40 transition-colors" id={`table-row-${rowIdx}`}>
                  
                  {/* Index column */}
                  <td className="text-center text-[10px] font-bold text-gray-400 select-none bg-gray-50/50 border-r border-gray-100 py-1.5">
                    {rowIdx + 1}
                  </td>

                  {/* Row cell content */}
                  {row.map((cell, colIdx) => (
                    <td 
                      key={colIdx} 
                      id={`cell-${rowIdx}-${colIdx}`}
                      onClick={() => startEditingCell(rowIdx, colIdx, cell)}
                      className={`border-r border-gray-100 px-3 py-1.5 text-xs text-gray-800 transition-colors min-h-[30px] w-28 max-w-[200px] select-text truncate cursor-text hover:bg-emerald-50/30
                        ${editingCell?.rowIndex === rowIdx && editingCell?.colIndex === colIdx 
                          ? "bg-white ring-2 ring-emerald-400 ring-inset overflow-visible z-10" 
                          : ""
                        }`}
                    >
                      {editingCell?.rowIndex === rowIdx && editingCell?.colIndex === colIdx ? (
                        <input
                          id={`cell-input-${rowIdx}-${colIdx}`}
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={saveCellEdit}
                          onKeyDown={(e) => handleKeyDown(e, "cell")}
                          autoFocus
                          className="w-full h-full bg-white text-gray-900 border-0 outline-none p-0 focus:ring-0 focus:outline-none"
                        />
                      ) : (
                        cell === "" || cell === undefined || cell === null ? (
                          <span className="text-gray-300 italic select-none font-light">empty</span>
                        ) : (
                          cell
                        )
                      )}
                    </td>
                  ))}
                  
                  {/* Action row container (Delete row) */}
                  <td className="px-2 text-center">
                    <button
                      id={`delete-row-btn-${rowIdx}`}
                      onClick={() => handleDeleteRow(rowIdx)}
                      className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-all cursor-pointer"
                      title="Delete row"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Empty placeholder rows handler */}
        {activeSheet.rows.length === 0 && (
          <div className="text-center py-10 text-gray-400 flex flex-col items-center justify-center space-y-2" id="empty-cells-alert">
            <p className="text-sm">This sheet is currently empty.</p>
            <button
              id="empty-add-row-btn"
              onClick={handleAddRow}
              className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Row
            </button>
          </div>
        )}

        {/* Grid Footer additions toolbar */}
        <div className="flex items-center justify-between border-t border-gray-100 p-3 bg-gray-50/60 select-none" id="spreadsheet-manipulate-footer">
          <div className="flex items-center gap-2">
            <button
              id="table-action-add-row"
              onClick={handleAddRow}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 text-gray-600 hover:text-gray-950 hover:bg-white rounded-lg text-xs font-semibold shadow-sm transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Row
            </button>
            <button
              id="table-action-add-column"
              onClick={handleAddColumn}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 text-gray-600 hover:text-gray-950 hover:bg-white rounded-lg text-xs font-semibold shadow-sm transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Column
            </button>
          </div>
          <div className="text-[10px] text-gray-400">
            * Tip: Double-click cells to edit. Press Enter to commit or Esc to cancel.
          </div>
        </div>
      </div>

      {/* AI Table Copilot Co-Pilot refinement bar */}
      <div className="bg-emerald-50/30 border border-emerald-100 rounded-2xl p-5 space-y-3" id="ai-copilot-card">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-4.5 h-4.5 text-emerald-600" />
          <h4 className="text-sm font-bold text-emerald-950">AI Spreadsheet Co-pilot</h4>
        </div>
        
        <p className="text-xs text-gray-500 leading-snug">
          Ask the co-pilot to recalculate, formatting columns, clean cells, translate text, insert calculations, or split properties.
        </p>

        <div className="flex items-stretch gap-1.5" id="ai-copilot-input-container">
          <input
            id="ai-copilot-prompt-input"
            type="text"
            disabled={isRefining}
            placeholder="e.g., 'Extract a new Total column that is UnitPrice multiplied by Quantity', 'Clean rows without content', 'Format InvoiceDate to DD/MM/YYYY'"
            value={refinePrompt}
            onChange={(e) => setRefinePrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAIQuery()}
            className="flex-1 px-4 py-2 bg-white border border-gray-200 focus:border-emerald-500 rounded-xl text-xs sm:text-xs outline-none focus:ring-1 focus:ring-emerald-500 transition"
          />
          <button
            id="ai-copilot-submit-btn"
            onClick={handleAIQuery}
            disabled={!refinePrompt.trim() || isRefining}
            className={`px-4 sm:px-6 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 select-none transition cursor-pointer
              ${!refinePrompt.trim() || isRefining 
                ? "bg-gray-300 dark:bg-gray-800 text-gray-400 cursor-not-allowed" 
                : "bg-emerald-600 hover:bg-emerald-700 hover:shadow-md"
              }`}
          >
            {isRefining ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CornerDownLeft className="w-3.5 h-3.5" />
            )}
            <span>Refine</span>
          </button>
        </div>

        {/* AI refinement error */}
        {refineError && (
          <p className="text-[11px] text-red-500 font-medium" id="refinement-error-message">
            Error: {refineError}
          </p>
        )}
      </div>

    </div>
  );
}
