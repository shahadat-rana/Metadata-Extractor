import React, { useState, useRef } from "react";
import { 
  Upload, 
  FileText, 
  Image as ImageIcon, 
  FileSpreadsheet, 
  Calendar, 
  DollarSign, 
  Users, 
  Sparkles, 
  X,
  Plus
} from "lucide-react";

interface UploadZoneProps {
  onExtract: (fileData: string, mimeType: string, filename: string, sizeStr: string, preset: string, customPrompt: string, sampleNumber: string) => void;
  isLoading: boolean;
}

const PRESETS = [
  {
    id: "auto",
    label: "Auto-Stitch (Auto Detect)",
    icon: Sparkles,
    desc: "Auto-detect layout and stitch split pages/columns into same row",
  },
  {
    id: "hugo_boss",
    label: "Hugo Boss Format",
    icon: FileSpreadsheet,
    desc: "Stitches Sample, Retest, HB No, Style No, Color, Order No onto one row",
  },
  {
    id: "peek_cloppenburg",
    label: "Peek & Cloppenburg",
    icon: FileSpreadsheet,
    desc: "Format for P&C / OLYMP columns stitched over 5 horizontal sheets",
  },
  {
    id: "aldi",
    label: "ALDI Format",
    icon: FileSpreadsheet,
    desc: "Stitches ALDI Lot, End Use, Product Description, Test Stage",
  },
  {
    id: "otto",
    label: "OTTO Format",
    icon: FileSpreadsheet,
    desc: "Extracts LKZ No, BPH, Mill, Otto Program Name mapped on same row",
  },
  {
    id: "ca",
    label: "C&A Format",
    icon: FileSpreadsheet,
    desc: "Extensive C&A columns stitched over 5 sheets (PLM, USIM, Garment, Wash)",
  },
  {
    id: "puma",
    label: "Puma Format",
    icon: FileSpreadsheet,
    desc: "Integrates Puma Material Ref, Division, Business Unit on same row",
  },
  {
    id: "norma",
    label: "NORMA Format",
    icon: FileSpreadsheet,
    desc: "Combines NORMA article, KFB No, random sample checks on same row",
  },
  {
    id: "lidl",
    label: "Lidl Format",
    icon: FileSpreadsheet,
    desc: "Stitches Specialty dye, Finish, Vendor/Direct, Art No on one row",
  },
  {
    id: "soliver_buyer",
    label: "s.Oliver Buyer Format",
    icon: FileSpreadsheet,
    desc: "Stitches End Buyer/Customer, Product Number, SKU, and construction details",
  },
  {
    id: "bestseller",
    label: "Bestseller Format",
    icon: FileSpreadsheet,
    desc: "Integrates Oeko-Tex Cert Number, Model/Style No, Client Ref, Dept on same row",
  },
  {
    id: "tchibo",
    label: "Tchibo Format",
    icon: FileSpreadsheet,
    desc: "Stitches Project Name, Article No, FiTS Submitted, Harmful Substances Catalogue, and Contact Person",
  },
  {
    id: "nkd",
    label: "NKD Format",
    icon: FileSpreadsheet,
    desc: "Stitches Material Number, OrderNo, Model/Style No, Client Reference No, Age Grade, and Oeko-Tex Number",
  },
  {
    id: "ernsting_family",
    label: "Ernsting Family Format",
    icon: FileSpreadsheet,
    desc: "Stitches Fiber Content, Style No, Ref. No, End Use, Applied Package, ReTest, Supplier Level",
  },
  {
    id: "general",
    label: "General Format",
    icon: FileSpreadsheet,
    desc: "Stitches Fibre Content, End Buyer, Reference No, Patron No./Item No, Task ID, and LKZ No",
  },
  {
    id: "adler",
    label: "Adler Format",
    icon: FileSpreadsheet,
    desc: "Stitches Product Number, Product Label, Item Number, Brand, Style Name, and Age Group",
  },
  {
    id: "tom_tailor",
    label: "Tom Tailor Format",
    icon: FileSpreadsheet,
    desc: "Stitches Yarn Count, Gauge, Weight, Fabric and Garment treatment details",
  },
  {
    id: "general_cp",
    label: "General-CP Format",
    icon: FileSpreadsheet,
    desc: "Stitches Buyer NameStyle No, Sample Description, Order Number, End Use, Colour, and Colour Code",
  },
];

export function UploadZone({ onExtract, isLoading }: UploadZoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [activePreset, setActivePreset] = useState("auto");
  const [customPrompt, setCustomPrompt] = useState("");
  const [sampleNumber, setSampleNumber] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFile = (file: File) => {
    // Check supported types
    const validTypes = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
    ];
    if (!validTypes.includes(file.type)) {
      alert("Invalid file format. Please upload a PDF, PNG, JPEG, or WEBP file.");
      return;
    }

    setSelectedFile(file);

    // Create image preview if not PDF
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl("");
    }

    // Convert to Base64
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Strip metadata prefix if exists (we only send raw base64 data to Express middleware/REST)
      const commaIndex = base64String.indexOf(",");
      const rawBase64 = commaIndex > -1 ? base64String.substring(commaIndex + 1) : base64String;
      setFileBase64(rawBase64);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const clearSelection = () => {
    setSelectedFile(null);
    setFileBase64("");
    setPreviewUrl("");
    setCustomPrompt("");
    setSampleNumber("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = () => {
    if (!selectedFile || !fileBase64) return;
    onExtract(
      fileBase64,
      selectedFile.type,
      selectedFile.name,
      formatBytes(selectedFile.size),
      activePreset,
      customPrompt,
      sampleNumber
    );
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8 animate-fade-in" id="upload-zone-root">
      {/* Drag and Drop Container */}
      {!selectedFile ? (
        <div
          id="drop-target-area"
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={onButtonClick}
          className={`relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-300 group
            ${dragActive 
              ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/15" 
              : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-white"
            }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
            onChange={handleChange}
            id="file-upload-input"
          />
          
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className={`p-4 rounded-full transition-transform duration-300 group-hover:scale-110 ${dragActive ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600" : "bg-gray-50 text-gray-400 group-hover:text-emerald-500"}`} id="upload-icon-wrapper">
              <Upload className="w-8 h-8" />
            </div>
            
            <div className="space-y-1">
              <p className="text-base font-semibold text-gray-800">
                Drag & drop TRF here, or <span className="text-emerald-600 hover:text-emerald-700 underline underline-offset-2">browse files</span>
              </p>
              <p className="text-xs text-gray-500">
                Supports PDF, PNG, JPG/JPEG, WEBP (up to 15MB)
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="border border-gray-150 rounded-2xl p-6 bg-white shadow-sm space-y-6" id="selected-file-panel">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-4">
              {previewUrl ? (
                <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-gray-100 flex-shrink-0" id="file-preview-thumbnail">
                  <img src={previewUrl} alt="Thumbnail preview" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-xl bg-red-50 dark:bg-red-950/20 text-red-600 flex items-center justify-center flex-shrink-0" id="pdf-icon-wrapper">
                  <FileText className="w-8 h-8" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h4 className="text-base font-semibold text-gray-900 truncate">{selectedFile.name}</h4>
                <p className="text-xs text-gray-500 mt-0.5">
                  Type: <span className="font-medium text-gray-700 capitalize">{selectedFile.type.split("/")[1]}</span> • Size: <span className="font-medium text-gray-700">{formatBytes(selectedFile.size)}</span>
                </p>
              </div>
            </div>
            
            <button
              id="clear-file-button"
              onClick={clearSelection}
              disabled={isLoading}
              className="p-1 px-2 text-xs border border-gray-200 text-gray-500 hover:text-red-500 hover:border-red-200 rounded-lg flex items-center gap-1 transition-colors disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" /> Remove
            </button>
          </div>
        </div>
      )}

      {/* Preset Customizers & Additional Instructions */}
      <div className="space-y-6" id="preset-settings-section">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-4">Choose Extractor Preset</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="extractor-presets-grid">
            {PRESETS.map((preset) => {
              const Icon = preset.icon;
              const isSelected = activePreset === preset.id;
              return (
                <button
                  key={preset.id}
                  id={`preset-btn-${preset.id}`}
                  onClick={() => setActivePreset(preset.id)}
                  disabled={isLoading}
                  className={`flex items-start p-4 rounded-xl text-left border transition-all duration-200 cursor-pointer disabled:opacity-50
                    ${isSelected 
                      ? "border-emerald-500 bg-emerald-50/40 text-emerald-950 shadow-sm" 
                      : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                    }`}
                >
                  <div className={`p-2 rounded-lg mr-3 ${isSelected ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-500"}`} id={`preset-icon-${preset.id}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold">{preset.label}</h4>
                    <p className="text-xs text-gray-500 mt-1 leading-snug">{preset.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sample Number (Sample #) Input */}
        <div className="p-5 border border-emerald-100 bg-emerald-50/20 rounded-xl space-y-2.5" id="sample-number-wrapper">
          <div className="flex items-center space-x-2 text-emerald-950 font-semibold text-sm">
            <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold font-mono text-xs">#</span>
            <label htmlFor="sample-number-input" className="block text-sm font-bold text-gray-800">
              Sample Number (Sample #) Option
            </label>
            <span className="text-[10px] font-bold text-emerald-600 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-100">Optional</span>
          </div>
          <div className="relative">
            <input
              id="sample-number-input"
              type="text"
              disabled={isLoading}
              placeholder="e.g. 12345, SGS-0098, or leave blank to auto-detect"
              value={sampleNumber}
              onChange={(e) => setSampleNumber(e.target.value)}
              className="w-full px-4 py-3 pl-11 bg-white border border-gray-200 focus:border-emerald-500 rounded-xl text-sm focus:ring-1 focus:ring-emerald-500 transition-all outline-none"
            />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono font-bold text-gray-400 text-sm">#</span>
          </div>
          <p className="text-xs text-gray-500 leading-normal">
            If provided, this value will be stamp-injected into the <strong>Sample #</strong> column of your exported Excel sheet.
          </p>
        </div>

        {/* Custom refinement prompts */}
        <div className="space-y-2" id="custom-prompt-wrapper">
          <label htmlFor="custom-prompt-input" className="block text-sm font-semibold text-gray-700">
            Customize AI Instructions (Optional)
          </label>
          <div className="relative">
            <input
              id="custom-prompt-input"
              type="text"
              disabled={isLoading}
              placeholder="e.g. 'Format numbers as currency', 'Ignore the footer section', 'Only extract columns Name, Cost, and Date'"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              className="w-full px-4 py-3 pl-11 bg-white border border-gray-200 focus:border-emerald-500 rounded-xl text-sm focus:ring-1 focus:ring-emerald-500 transition-all outline-none"
            />
            <Sparkles className="w-4 h-4 text-emerald-500 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <p className="text-xs text-gray-500 leading-normal">
            You can inject dynamic layout guidelines or strict parsing constraints for the Gemini Vision extraction.
          </p>
        </div>

        {/* Core Submission action */}
        <div className="flex items-center justify-end" id="submit-action-panel">
          <button
            id="start-extraction-btn"
            onClick={handleSubmit}
            disabled={!selectedFile || isLoading}
            className={`px-8 py-3.5 rounded-xl font-medium text-white flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200 select-none cursor-pointer
              ${(!selectedFile || isLoading)
                ? "bg-gray-300 dark:bg-gray-800 text-gray-400 shadow-none hover:shadow-none cursor-not-allowed" 
                : "bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98]"
              }`}
          >
            {isLoading ? (
              <div className="flex items-center gap-2" id="extraction-button-loading">
                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Processing Document...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2" id="extraction-button-normal">
                <Sparkles className="w-5 h-5 fill-white/20" />
                <span>Extract and Convert to Excel</span>
              </div>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
