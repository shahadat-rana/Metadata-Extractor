import React, { useState } from "react";
import { 
  History, 
  Trash2, 
  ArrowRight, 
  Search,
  FileSpreadsheet,
  X
} from "lucide-react";
import { HistoryItem } from "../types";

interface HistorySidebarProps {
  items: HistoryItem[];
  onSelectItem: (item: HistoryItem) => void;
  onDeleteItem: (id: string) => void;
  onClearAll: () => void;
}

export function HistorySidebar({ items, onSelectItem, onDeleteItem, onClearAll }: HistorySidebarProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredItems = items.filter(
    (item) =>
      item.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.result.sheetName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="w-full bg-white border border-gray-150 rounded-2xl p-5 shadow-sm space-y-4" id="history-sidebar-root">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3" id="history-sidebar-header">
        <div className="flex items-center space-x-2">
          <History className="w-4 h-4 text-emerald-600" />
          <h3 className="text-sm font-bold text-gray-800">Extraction History</h3>
        </div>
        
        {items.length > 0 && (
          <button 
            id="clear-all-history-btn"
            onClick={() => {
              if (confirm("Are you sure you want to clear all history runs?")) {
                onClearAll();
              }
            }}
            className="text-[10px] text-gray-400 hover:text-red-500 font-semibold cursor-pointer select-none transition"
          >
            Clear All
          </button>
        )}
      </div>

      {items.length > 0 && (
        <div className="relative" id="history-search-container">
          <input
            id="history-search-input"
            type="text"
            placeholder="Search files..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 border border-gray-200 focus:border-emerald-500 rounded-lg text-xs outline-none focus:ring-1 focus:ring-emerald-500 transition"
          />
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          {searchTerm && (
            <button
              id="clear-search-btn"
              onClick={() => setSearchTerm("")}
              className="absolute right-2 px-1 text-gray-500 hover:text-gray-900 top-1/2 -translate-y-1/2 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* History Items list */}
      <div className="max-h-[380px] overflow-y-auto space-y-2.5 pr-1" id="history-items-list-container">
        {filteredItems.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-xs" id="history-empty-placeholder">
            {searchTerm ? "No files match your search." : "No previous data extractions. Upload a file to get started!"}
          </div>
        ) : (
          filteredItems.map((item) => {
            const rowCount = item.result.rows.length;
            const colCount = item.result.headers.length;
            const excelName = item.result.sheetName;

            return (
              <div 
                key={item.id}
                id={`history-item-${item.id}`}
                className="group p-3 border border-gray-100 hover:border-gray-200 hover:bg-gray-50 rounded-xl flex items-center justify-between transition-all"
              >
                {/* Clicking on metadata selection loads the spreadsheet */}
                <div 
                  onClick={() => onSelectItem(item)}
                  className="flex-1 cursor-pointer min-w-0 pr-2 select-none"
                  title="Load this sheet"
                >
                  <p className="text-xs font-semibold text-gray-800 truncate leading-snug">
                    {item.fileName}
                  </p>
                  
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mt-1">
                    <span className="truncate max-w-[80px]" title={`Sheet: ${excelName}`}>
                      {excelName}
                    </span>
                    <span>•</span>
                    <span className="whitespace-nowrap font-medium text-gray-500">
                      {rowCount} × {colCount}
                    </span>
                    <span>•</span>
                    <span className="whitespace-nowrap text-gray-400 font-light">
                      {new Date(item.timestamp).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>

                {/* Trash/Removal action */}
                <button
                  id={`delete-history-item-${item.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteItem(item.id);
                  }}
                  className="p-1 px-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer duration-200"
                  title="Delete from history"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="text-[10px] text-gray-400 text-center select-none" id="history-foot-legend">
        * Storage saved locally in your browser cache.
      </div>
    </div>
  );
}
