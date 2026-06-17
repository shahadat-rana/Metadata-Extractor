export interface ExtractedTable {
  name: string;
  headers: string[];
  rows: string[][];
  summary?: string;
}

export interface ExtractionResult {
  sheetName: string;
  headers: string[];
  rows: string[][];
  confidenceScore: number;
  summary: string;
  allTables?: ExtractedTable[];
}

export interface HistoryItem {
  id: string;
  fileName: string;
  fileSize: string;
  fileType: string;
  timestamp: string;
  result: ExtractionResult;
}
