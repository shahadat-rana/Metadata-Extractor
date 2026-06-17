import React, { useState, useEffect, useRef } from "react";
import { 
  FileSpreadsheet, 
  Sparkles, 
  HelpCircle, 
  Info, 
  AlertCircle,
  Database,
  History,
  TrendingUp,
  FileCheck2,
  Cpu
} from "lucide-react";
import { UploadZone } from "./components/UploadZone";
import { SpreadsheetEditor } from "./components/SpreadsheetEditor";
import { HistorySidebar } from "./components/HistorySidebar";
import { ExtractionResult, HistoryItem } from "./types";

const PROGRESS_STEPS = [
  "Reading file payload...",
  "Running layout & structure analysis...",
  "Applying Gemini vision OCR...",
  "Extracting tabular grid patterns...",
  "Structuring headers and column details...",
  "Refining cells and creating JSON formulas...",
  "Finalizing spreadsheet assembly..."
];

export default function App() {
  const [activeResult, setActiveResult] = useState<ExtractionResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load history from localStorage
  useEffect(() => {
    try {
      const cached = localStorage.getItem("excelizer_history");
      if (cached) {
        setHistory(JSON.parse(cached));
      }
    } catch (err) {
      console.error("Failed to load history from localStorage:", err);
    }
  }, []);

  // Save history helper
  const saveHistory = (items: HistoryItem[]) => {
    try {
      setHistory(items);
      localStorage.setItem("excelizer_history", JSON.stringify(items));
    } catch (err) {
      console.error("Failed to save history:", err);
    }
  };

  // Loading indicator textual cycle
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoading) {
      setLoadingStep(0);
      interval = setInterval(() => {
        setLoadingStep((prev) => (prev + 1) % PROGRESS_STEPS.length);
      }, 3500);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  // Core Extract handler triggering API service
  const handleExtract = async (
    fileData: string,
    mimeType: string,
    filename: string,
    sizeStr: string,
    preset: string,
    customPrompt: string,
    sampleNumber: string
  ) => {
    setIsLoading(true);
    setError(null);

    // Instantiate new AbortController
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileData,
          mimeType,
          promptPreset: preset,
          customPrompt,
          sampleNumber,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || "Extraction request failed.");
      }

      const result = (await response.json()) as ExtractionResult;

      // Ensure sheetName has a fallback
      if (!result.sheetName) {
        result.sheetName = filename.substring(0, filename.lastIndexOf(".")) || "Extracted Sheet";
      }

      // Add to history list
      const newItem: HistoryItem = {
        id: Date.now().toString(),
        fileName: filename,
        fileSize: sizeStr,
        fileType: mimeType,
        timestamp: new Date().toISOString(),
        result,
      };

      const updatedHistory = [newItem, ...history];
      saveHistory(updatedHistory);

      // Render updated results
      setActiveResult(result);

    } catch (err: any) {
      if (err.name === "AbortError" || (err instanceof DOMException && err.name === "AbortError")) {
        console.log("Extraction stream aborted manually.");
        return; // Exits gracefully without treating as a scary network/API error
      }
      console.error("Extraction workflow error:", err);
      setError(err.message || "An error occurred during file parsing. Please try again with a clear, readable image or PDF file.");
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setIsLoading(false);
    }
  };

  const handleStopExtraction = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setError(null);
  };

  // Back button handler
  const handleBackToUploader = () => {
    setActiveResult(null);
    setError(null);
  };

  // Sync state if user edits tables, deletes elements, or inserts columns
  const handleUpdateResult = (updated: ExtractionResult) => {
    setActiveResult(updated);
    
    // Also find active history item if loaded and update it in cache!
    if (history.length > 0) {
      const activeMatch = history.find(item => item.result.sheetName === initialSheetNameRef);
      if (activeMatch) {
         const updatedHistory = history.map(item => {
           if (item.id === activeMatch.id) {
             return { ...item, result: updated };
           }
           return item;
         });
         saveHistory(updatedHistory);
      }
    }
  };

  // History load selection
  const handleSelectHistoryItem = (item: HistoryItem) => {
    setActiveResult(item.result);
    setError(null);
  };

  // History removal handlers
  const handleDeleteHistoryItem = (id: string) => {
    const filtered = history.filter((item) => item.id !== id);
    saveHistory(filtered);
  };

  const handleClearHistory = () => {
    saveHistory([]);
  };

  // Track the initial sheet name of loaded history to allow updating original cache index 
  const [initialSheetNameRef, setInitialSheetNameRef] = useState("");
  useEffect(() => {
    if (activeResult) {
      setInitialSheetNameRef(activeResult.sheetName);
    }
  }, [activeResult === null]);

  return (
    <div className="min-h-screen bg-gray-50/50 text-gray-800 font-sans flex flex-col" id="app-viewport">
      
      {/* Top Banner Header */}
      <header className="bg-white border-b border-gray-150 py-5 sticky top-0 z-40 shadow-sm" id="main-navigation-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-emerald-600 text-white p-2 rounded-xl shadow-md flex items-center justify-center" id="logo-icon-container">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-gray-950 flex items-center gap-1.5 leading-snug">
                <span>Metadata Extractor</span>
                <span className="text-[10px] uppercase font-bold text-emerald-600 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-100">
                  AI Co-pilot
                </span>
              </h1>
              <p className="text-xs text-gray-400 font-medium">Turn any document or photo into editable spreadsheets instantly</p>
            </div>
          </div>


          {/* Removed info tray as requested */}
        </div>
      </header>

      {/* Main Container Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8" id="application-body-view">
        
        {/* Error Notification Alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 text-sm text-red-800 animate-slide-up" id="error-notification-bar">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-bold">Extraction Failed</h4>
              <p className="text-xs text-red-700/90 mt-1 leading-normal">{error}</p>
            </div>
            <button 
              id="dismiss-error-btn"
              onClick={() => setError(null)} 
              className="text-red-400 hover:text-red-600 font-semibold text-xs px-2 py-1 rounded border border-red-200/50 hover:bg-white cursor-pointer select-none"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Processing/Loading Layout */}
        {isLoading ? (
          <div className="max-w-xl mx-auto py-20 text-center space-y-6 flex flex-col items-center justify-center animate-fade-in" id="loading-document-view">
            <div className="relative flex items-center justify-center w-24 h-24" id="circular-spinner-wrapper">
              {/* Outer pulsing ring */}
              <div className="absolute inset-0 border-4 border-emerald-100 rounded-full animate-ping opacity-30"></div>
              {/* Spinning primary loader */}
              <div className="absolute inset-0 border-4 border-transparent border-t-emerald-600 rounded-full animate-spin"></div>
              {/* Inner symbol */}
              <div className="bg-emerald-50 text-emerald-600 p-4 rounded-full shadow-inner">
                <Sparkles className="w-8 h-8 fill-emerald-100 animate-pulse" />
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-gray-900 leading-snug">Extracting Spreadsheet Data</h3>
                <p className="text-xs font-semibold text-emerald-600 tracking-wider h-5 flex items-center justify-center" id="active-step-loader">
                  {PROGRESS_STEPS[loadingStep]}
                </p>
                <p className="text-xs text-gray-500 max-w-xs mx-auto pt-1 leading-relaxed">
                  Gemini Vision is analyzing tabular grids, aligned columns, and values to design your Excel workbook. This normally takes 10-15 seconds.
                </p>
              </div>

              <div className="pt-2" id="stop-loading-container">
                <button
                  id="stop-extraction-btn"
                  onClick={handleStopExtraction}
                  className="px-6 py-2 border border-red-200 hover:border-red-300 text-red-600 bg-white hover:bg-red-50/50 rounded-xl text-xs font-bold shadow-xs hover:shadow-sm transition-all duration-200 select-none cursor-pointer flex items-center gap-1.5 mx-auto active:scale-[0.98]"
                >
                  <svg className="w-3.5 h-3.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                  </svg>
                  <span>Stop Extraction</span>
                </button>
              </div>
            </div>
          </div>
        ) : activeResult ? (
          
          /* VIEW 1: Spreadsheet Interactive Editor */
          <div className="w-full" id="spreadsheet-dashboard-active">
            <SpreadsheetEditor 
              initialResult={activeResult}
              onBack={handleBackToUploader}
              onUpdate={handleUpdateResult}
            />
          </div>

        ) : (
          
          /* VIEW 2: Doc Upload & Configuration (Alongside historical sidebar) */
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8" id="uploader-dashboard-default">
            
            {/* Left section: Central Uploader Zone (Takes up 3 columns) */}
            <div className="lg:col-span-3 space-y-6" id="upload-zone-wrapper-column">
              {/* Upload Zone */}
              <UploadZone 
                onExtract={handleExtract}
                isLoading={isLoading}
              />
            </div>

            {/* Right section: History Sidebar container (Takes up 1 column on wide screens) */}
            <div className="lg:col-span-1" id="history-sidebar-column">
              <HistorySidebar 
                items={history}
                onSelectItem={handleSelectHistoryItem}
                onDeleteItem={handleDeleteHistoryItem}
                onClearAll={handleClearHistory}
              />

              {/* Helpful Tips Block */}
              <div className="mt-6 p-4 border border-gray-150 rounded-2xl bg-white hover:bg-gray-50/50 space-y-3 shadow-xs select-none transition-all" id="useful-tips-card">
                <div className="flex items-center space-x-1.5 text-gray-800">
                  <Info className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <h4 className="text-xs font-bold font-sans">Corporate Tips</h4>
                </div>
                <ul className="text-[10px] text-gray-500 leading-relaxed list-disc list-inside space-y-1.5">
                  <li className="text-emerald-700 font-medium">To export multiple horizontal pages onto the **same row** in excel, ensure you select your corresponding **Buyer Format** option first!</li>
                  <li>In the editor, you can edit cell content, headers, insert columns, or remove redundant rows.</li>
                  <li>Click **Export to Excel** in the top right to download a highly optimized spreadsheet that preserves auto-fitted column widths instantly.</li>
                </ul>
              </div>
            </div>

          </div>
        )}

      </main>

      {/* Footer information bar */}
      <footer className="bg-white border-t border-gray-150 py-4 mt-auto text-center text-[10px] text-gray-400 font-semibold" id="app-footer-brand">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            © 2026 Metadata Extractor • Developed by <span className="text-emerald-600">Shahadat Hossain Khanduker</span>
          </div>
          <div className="hidden sm:block text-[10px]">
            Fully client-managed state persistent storage. Respects data privacy constraints.
          </div>
        </div>
      </footer>

    </div>
  );
}
