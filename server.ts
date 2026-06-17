import express from "express";
import path from "path";
import dotenv from "dotenv";
import fs from "fs";
import os from "os";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;

// Increase payload size limit to handle base64 documents (images/high-res PDFs)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Initialize Gemini Client safely
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not defined. Please set it in the Secrets panel (Settings > Secrets).");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Safe serializer to inspect internal properties of complex JS error objects (which typically ignore JSON.stringify)
function safeErrorStringify(error: any): string {
  if (!error) return "";
  const parts: string[] = [];
  if (typeof error === "string") {
    parts.push(error);
  } else {
    if (error.message) parts.push(String(error.message));
    if (error.status) parts.push(String(error.status));
    if (error.code) parts.push(String(error.code));
    if (error.statusCode) parts.push(String(error.statusCode));
    if (error.statusText) parts.push(String(error.statusText));
    
    // Check nested error properties
    if (error.error) {
      if (typeof error.error === "string") {
        parts.push(error.error);
      } else {
        if (error.error.message) parts.push(String(error.error.message));
        if (error.error.status) parts.push(String(error.error.status));
        if (error.error.code) parts.push(String(error.error.code));
      }
    }
    
    try {
      parts.push(JSON.stringify(error));
    } catch (e) {}
  }
  return parts.join(" ").toUpperCase();
}

// Robust retry wrapper for transient third party platform spikes (503/429)
async function withRetry<T>(fn: () => Promise<T>, retries = 4, delayMs = 2500): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;
      const errStrUpper = safeErrorStringify(error);
      
      const isRetryable = 
        errStrUpper.includes("UNAVAILABLE") ||
        errStrUpper.includes("UNAVAILBLE") || // Catch Google's spelling typo in high demand status
        errStrUpper.includes("503") ||
        errStrUpper.includes("429") ||
        errStrUpper.includes("TEMPORARY") ||
        errStrUpper.includes("SPIKES") ||
        errStrUpper.includes("HIGH DEMAND") ||
        errStrUpper.includes("TRY AGAIN LATER") ||
        errStrUpper.includes("RESOURCE_EXHAUSTED") ||
        errStrUpper.includes("QUOTA") ||
        errStrUpper.includes("LIMIT");

      if (isRetryable && attempt <= retries) {
        const backoff = delayMs * Math.pow(2.2, attempt - 1);
        console.warn(`[Gemini Retry Warning] Transient error, retrying in ${Math.round(backoff)}ms (Attempt ${attempt}/${retries}). Info:`, error.message || error);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }
      throw error;
    }
  }
}

/**
 * Utility to execute Gemini generation over a sequence of fallback models.
 * If the primary model fails or experiences temporary high demand, we transition
 * immediately to alternative models in the Google Cloud server-side roster.
 * This guarantees near-100% extraction uptime even during temporary platform spikes.
 */
async function generateContentWithFallback(
  ai: any,
  generateParamsBuilder: (model: string) => any,
  modelsChain = ["gemini-3.5-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"]
): Promise<any> {
  let lastError: any = null;
  
  for (const model of modelsChain) {
    try {
      console.log(`[Spreadsheet Engine] Trying model: [${model}]...`);
      // Use quick retries per model to fall back faster if a model is completely overloaded
      const response = await withRetry(
        () => ai.models.generateContent(generateParamsBuilder(model)),
        2,
        1500
      );
      console.log(`[Spreadsheet Engine] Successfully extracted data with model: [${model}]`);
      return response;
    } catch (err: any) {
      lastError = err;
      const errorMsg = safeErrorStringify(err);
      console.warn(`[Spreadsheet Engine Warning] Model [${model}] failed (Error: ${err.message || errorMsg}). Proceeding to next fallback model...`);
    }
  }
  
  throw lastError || new Error("All models in the extraction engine chain failed to parse the document.");
}

/**
 * Apply custom C&A Rules to extracted headers and rows to ensure 100% accurate format accumulation.
 */
function applyCaRules(headers: string[], rows: any[][]) {
  if (!headers || !Array.isArray(headers) || !rows || !Array.isArray(rows)) return;
  
  const sampleDescIdx = headers.findIndex((h) => h && h.toLowerCase().trim() === "sample description");
  const colorIdx = headers.findIndex((h) => h && (h.toLowerCase().trim() === "colour" || h.toLowerCase().trim() === "color"));
  const usimIdx = headers.findIndex((h) => h && h.toLowerCase().trim() === "usim no.");
  const productIdIdx = headers.findIndex((h) => {
    if (!h) return false;
    const s = h.toLowerCase().trim();
    return s === "product id/c&a" || s === "product id/ca order no" || s === "product id/c&a order no" || s === "product id/c&a order no." || s.startsWith("product id/c&a");
  });
  const plmNamingIdx = headers.findIndex((h) => h && h.toLowerCase().trim() === "plm naming");
  const categoryIdx = headers.findIndex((h) => h && h.toLowerCase().trim() === "category");
  const sqmIdx = headers.findIndex((h) => h && (h.toLowerCase().trim() === "sqm version" || h.toLowerCase().trim() === "sqm"));
  const fiberIdx = headers.findIndex((h) => h && (h.toLowerCase().trim() === "fibre composition" || h.toLowerCase().trim() === "fiber composition"));
  const weightIdx = headers.findIndex((h) => h && h.toLowerCase().trim() === "fabric weight");
  const contactIdx = headers.findIndex((h) => h && (h.toLowerCase().trim() === "contact person" || h.toLowerCase().trim() === "contact"));

  const sgsDescIdx = headers.findIndex((h) => h && h.toLowerCase().trim() === "sgs description");
  const issuedByIdx = headers.findIndex((h) => h && h.toLowerCase().trim() === "issued by");
  const reportIssuedIdx = headers.findIndex((h) => {
    if (!h) return false;
    const s = h.toLowerCase().trim();
    return s === "report issued" || s === "report issued in";
  });
  const oekoTexIdx = headers.findIndex((h) => h && (h.toLowerCase().trim() === "oeko-tex number" || h.toLowerCase().trim() === "oeko tex number"));
  const specialFinishingIdx = headers.findIndex((h) => h && h.toLowerCase().trim() === "special finishing");

  rows.forEach((row) => {
    if (!Array.isArray(row)) return;

    // Pad row if it has fewer elements than headers
    while (row.length < headers.length) {
      row.push("");
    }

    // Helper to read safe strings
    const getVal = (idx: number) => {
      if (idx === -1 || row[idx] === undefined || row[idx] === null) return "";
      return row[idx].toString().trim();
    };

    // 1. Sample Description -> sample description in color
    if (sampleDescIdx !== -1) {
      const desc = getVal(sampleDescIdx);
      const col = getVal(colorIdx);
      if (desc && col) {
        const colLower = col.toLowerCase();
        const descLower = desc.toLowerCase();
        if (!descLower.includes(" in " + colLower) && !descLower.endsWith(" " + colLower)) {
          row[sampleDescIdx] = `${desc} in ${col}`;
        }
      }
    }

    // 2. USIM No last 7 digits helper
    let lastSevenUsim = "";
    if (usimIdx !== -1) {
      const usim = getVal(usimIdx);
      if (usim) {
        const digitsOnly = usim.replace(/\D/g, "");
        lastSevenUsim = digitsOnly.length >= 7 ? digitsOnly.slice(-7) : (digitsOnly || usim.slice(-7));
      }
    }

    // 3. Product ID/C&A -> last seven digit of usim no and Product ID/C&A Order No
    if (productIdIdx !== -1) {
      const prodId = getVal(productIdIdx);
      if (lastSevenUsim) {
        if (prodId) {
          // If prodId already has lastseven, do not duplicate
          if (!prodId.includes(lastSevenUsim)) {
            row[productIdIdx] = `${lastSevenUsim} and ${prodId}`;
          }
        } else {
          row[productIdIdx] = lastSevenUsim;
        }
      }
    }

    // 4. PLM Naming -> DK-SGS-last seven digit of usim no
    if (plmNamingIdx !== -1 && lastSevenUsim) {
      row[plmNamingIdx] = `DK-SGS-${lastSevenUsim}`;
    }

    // 5. Category -> FA i/o fabric approval or SA i/o sample approval
    if (categoryIdx !== -1) {
      const cat = getVal(categoryIdx).toLowerCase();
      if (cat.includes("fabric approval") || cat === "fabric" || cat === "fa" || cat.includes("fabricapproval")) {
        row[categoryIdx] = "FA";
      } else if (cat.includes("sample approval") || cat === "sample" || cat === "sa" || cat.includes("sampleapproval")) {
        row[categoryIdx] = "SA";
      }
    }

    // 6. SQM version -> SQM V09.1
    if (sqmIdx !== -1) {
      row[sqmIdx] = "SQM V09.1";
    }

    // 7. Fiber composition -> fiber composition, fabric weight
    if (fiberIdx !== -1) {
      const fiber = getVal(fiberIdx);
      const weight = getVal(weightIdx);
      if (fiber && weight) {
        if (!fiber.includes(weight)) {
          row[fiberIdx] = `${fiber}, ${weight}`;
        }
      }
    }

    // 8. Contact person -> starts with "Mr."
    if (contactIdx !== -1) {
      const contact = getVal(contactIdx);
      if (contact) {
        if (!/^mr\.?/i.test(contact) && !/^ms\.?/i.test(contact) && !/^mrs\.?/i.test(contact)) {
          row[contactIdx] = `Mr. ${contact}`;
        }
      }
    }

    // 9. Always force C&A mandated layout values
    if (sgsDescIdx !== -1) {
      row[sgsDescIdx] = "/";
    }
    if (issuedByIdx !== -1) {
      row[issuedByIdx] = "SGS";
    }
    if (reportIssuedIdx !== -1) {
      row[reportIssuedIdx] = "Dhaka";
    }
    if (oekoTexIdx !== -1) {
      row[oekoTexIdx] = "/";
    }
    if (specialFinishingIdx !== -1) {
      row[specialFinishingIdx] = "/";
    }
  });
}

const BUYER_COLUMNS: Record<string, string[]> = {
  hugo_boss: [
    "Sample #", "Material Number", "SGS Description", "Description", "Retest:", "HB No.:", "Previous Report No.", "Phase:", "Sample Description :", "Material Composition :", "Order No. :", "Vendor :", "Hugo Boss Division :", "Campaign Test", "Style No. :", "Form Name :", "Color :", "Quality No. :", "Season :", "Batch No. :", "Article No.", "Brand/ Gender/ Line:", "End Use :", "MPG :", "Category", "Order No. (Appear in Invoice)", "Sample Type"
  ],
  peek_cloppenburg: [
    "Sample #", "Material Number", "SGS Description", "Brand/Label Name", "Application No", "Supplier No", "Fibre Composition", "Quality No", "Article Description", "Classification of Sample Type", "Dispo P&C/OLYMP P.O.", "Cycle", "Projekt", "Previous Report No", "Peek Cloppenburg Location", "P & C Order No", "P & C Dispo No", "Colour", "Buying House", "Sample Details", "Supplier Order/Style No", "Reference Number"
  ],
  aldi: [
    "Sample #", "Material Number", "SGS Description", "Product Description", "Fiber Content", "Style No.", "SGS SAP Order No.", "ALDI ID No.", "ALDI Conutry Lot", "End Use", "Previous Report No.", "Sample Received Quantity", "Colour", "Applicant Product No.", "Test Stage", "Program Name", "Testing Scope"
  ],
  otto: [
    "Sample #", "Material Number", "SGS Description", "SampleDescription", "Purchase Dept./Contact person", "Application No", "Ref. No.", "LKZ No.", "Season", "Order No.", "Style No.", "Article No.", "OI Testing ID and task type", "Test package", "Test stage", "Previous Report No.", "Colour", "Brand Name", "BPH Standard Fabric Code", "Nominated Fabric Mill Name", "Sample received quantity", "SGS Job No", "Fiber Content", "Condition Of Sample", "The Location Of Performance Of The Laboratory Activities", "Otto Program Name"
  ],
  ca: [
    "Sample #", "Material Number", "SGS Description", "Sample Description", "AddSampleDescription", "Product ID/C&A Order No", "Season", "Colour", "Fibre Composition", "Category", "Country of", "Retest No.", "Supplier No.", "Material ID", "USIM No.", "Product Groups", "Local Hub", "Date of Receipt", "PLM Naming", "Final Product", "Issued By", "Report Issued In", "OEKO-TEX Number", "Fabric Weight", "Yarn Count", "Thread Count", "Age Group (Size)", "Expiry Date", "Special Finishing", "Garment Type", "Chemical Mandatory", "Physical Mandatory", "Contact Person", "Package (DDT)", "SQM version", "Order No. (Appear", "Manufacturer", "Industrial Garment", "Product Category", "Fabric Constructions", "Wash Type"
  ],
  puma: [
    "Sample #", "Material Number", "SGS Description", "Sample Description", "Fiber Composition", "Style No.", "Order No.", "Material Reference Code", "Country of Destination", "Previous Report No.", "Sample Received Quantity", "Season", "Colours", "Code/Prints", "Performance Standard", "Material No.", "Fabric Weight", "Division", "Product Type", "Product Stage", "Business Unit", "Puma Supplier No.", "Article No.", "Oeko Tex Certified Product", "Sample Type", "Application No"
  ],
  norma: [
    "Sample #", "Material Number", "SGS Description", "Sample Description", "Colour", "Fibre Content", "Ref No.", "Order No", "NORMA article no.", "NORMA KFB No.", "Product Type", "Country Destination", "Sample received quantity", "Previous Report No", "Random Production Sample", "Supplier Article No.", "addFibreContent"
  ],
  lidl: [
    "Sample #", "Material Number", "SGS Description", "Article No.", "End Use", "Size", "Dye Type", "Sample Description", "Previous Report", "Colour", "Style No.", "Product Class", "Sample Type", "Material Composition", "Reference No.", "Seal Number", "Amount Of", "Artwork", "Test Program", "Season", "Order No.", "Material Code", "Special Finish", "Test Package", "Company Code", "Company (Vendor / Direct", "Direct Vendor)"
  ],
  soliver_buyer: [
    "Sample #", "Material Number", "SGS Description", "Sample Description", "End Use", "Colour", "End Buyer/Customer", "Previous Report No.", "Sample Received Quantity", "Season", "Product Number", "Product Label", "Item Number", "Brand", "Style Name", "Age Group", "Sample Weight", "Test Package", "Lot No.", "Fibre Content", "Order Number", "Style No.", "Article No", "Reference No.", "Department Name", "Country of Destination", "Sku Number", "Product Category", "Sample Type", "Customer Contact", "Line No", "Stage", "Code No.", "Construction"
  ],
  bestseller: [
    "Sample #", "Material Number", "SGS Description", "OrderNo", "Model/Style No", "Client Reference No", "Dept.", "Age Grade", "Oeko-Tex Certificate Number", "Previous Report No"
  ],
  tchibo: [
    "Sample #", "Material Number", "SGS Description", "Sample Description", "Project Name", "Article No.", "Order No.", "FiTS Submitted", "Date of FiTS", "Harmful Substances Catalogue", "Sample storage period", "Previous Report No", "Contact Person", "Project No. (PJN)"
  ],
  ernsting_family: [
    "Sample #", "Material Number", "SGS Description", "Sample Description", "Fiber Content", "Style No.", "Order No.", "Ref. No.", "End Use", "Previous Report No.", "Color", "Age Grade", "Application No.", "Applied Package", "Supplier Level", "Exported To", "ReTest", "Self Reference?"
  ],
  general: [
    "Sample #", "Material Number", "SGS Description", "Sample Description", "Fibre Content", "End Buyer", "Style No.", "Order No.", "Reference No.", "Country of Destination", "Brand", "Department", "End Use", "Previous Report No.", "Colour", "Season", "Patron No./Item No.", "Sample Received Quantity", "Age Range", "Type of Dye", "Type of Print", "Size", "Task ID Number", "LKZ No.", "Oi Seal number", "Test Package"
  ],
  adler: [
    "Sample #", "Material Number", "SGS Description", "Sample Description", "End Use", "Colour", "End Buyer/Customer", "Previous Report No.", "Sample Received Quantity", "Season", "Product Number", "Product Label", "Item Number", "Brand", "Style Name", "Age Group", "Sample Weight", "Test Package", "Lot No.", "Fibre Content", "Order Number", "Style No.", "Article No", "Reference No.", "Department Name", "Country of Destination", "Sku Number", "Product Category", "Sample Type", "Customer Contact", "Line No", "Stage", "Code No.", "Construction"
  ],
  tom_tailor: [
    "Sample #", "Material Number", "SGS Description", "Sample Description", "Test Package", "Application No.", "Style No.", "Quality No.", "Type", "Fit / Pattern", "Composition", "Yarn Count", "Gauge", "Weight (g/m²) (oz)", "Construction", "Garment Treatment", "Fabric Treatment", "Color", "Order No.", "Art. No.", "Production Supplier and No.", "Brand", "Report Type", "Previous Report No.", "Fabric Code", "Season", "Sample Description (Appear in Invoice)", "Order No. (Appear in Invoice)"
  ],
  general_cp: [
    "Sample #", "Material Number", "SGS Description", "Buyer NameStyle No.", "Sample Description", "Order Number", "End Use", "Colour", "DepartmentFibre Content", "Sample Received", "Article No", "Brand", "Reference No.", "Buyer NameItem Number", "Season", "ApplicationPrevious Report", "Colour Code"
  ],
  nkd: [
    "Sample #", "Material Number", "SGS Description", "OrderNo", "Model/Style No", "Client Reference No", "Dept.", "Age Grade", "Oeko-Tex Certificate Number", "Previous Report No"
  ]
};

// Endpoint to extract tabular data from PDF/Image
app.post("/api/extract", async (req, res) => {
  try {
    const { fileData, mimeType, promptPreset, customPrompt, sampleNumber } = req.body;

    if (!fileData) {
      return res.status(400).json({ error: "Missing file data (base64 string)." });
    }
    if (!mimeType) {
      return res.status(400).json({ error: "Missing document mimeType." });
    }

    let ai;
    try {
      ai = getGeminiClient();
    } catch (err: any) {
      return res.status(401).json({
        error: err.message || "Gemini API key is missing. Please add it via the Settings > Secrets menu."
      });
    }

    // Structure the input parts for Gemini, defensive stripping of comma/data-uri prefix from base64 if present
    let cleanFileData = fileData;
    if (cleanFileData.includes(",")) {
      cleanFileData = cleanFileData.substring(cleanFileData.indexOf(",") + 1);
    }

    let filePart: any;
    let uploadedFile: any = null;

    if (mimeType === "application/pdf") {
      try {
        console.log(`[Spreadsheet Engine] PDF detected. Using Gemini Files API to upload... (size: ${cleanFileData.length} base64 chars)`);
        const tempFilePath = path.join(os.tmpdir(), `gemini_upload_${Date.now()}.pdf`);
        await fs.promises.writeFile(tempFilePath, Buffer.from(cleanFileData, "base64"));

        uploadedFile = await ai.files.upload({
          file: tempFilePath,
          mimeType: "application/pdf",
        });

        console.log(`[Spreadsheet Engine] PDF uploaded successfully. URI: ${uploadedFile.uri}`);

        // Cleanup local file immediately
        try {
          await fs.promises.unlink(tempFilePath);
        } catch (err) {
          console.warn("[Spreadsheet Engine Warning] Failed to delete local temp file:", err);
        }

        filePart = {
          fileData: {
            fileUri: uploadedFile.uri,
            mimeType: "application/pdf",
          },
        };

      } catch (uploadError: any) {
        console.error("[Spreadsheet Engine Error] Files API upload failed. Falling back to inlineData PDF:", uploadError);
        filePart = {
          inlineData: {
            data: cleanFileData,
            mimeType: mimeType,
          },
        };
      }
    } else {
      // For images, inlineData is incredibly fast, responsive, and standard
      filePart = {
        inlineData: {
          data: cleanFileData,
          mimeType: mimeType,
        },
      };
    }

    let instructions = "You are an expert corporate document parser for SGS test reports, specialized in extracting high-accuracy table records and exporting them in flat, unified excel single row formats. ";
    
    // Add strict guidance on multi-page column stitching
    instructions += `
CRITICAL INSTRUCTION FOR MULTI-PAGE SPLIT TABLES: 
SGS reports are split horizontally across pages. For example, Page 1 holds the first set of columns, and Page 2/Page 3 hold next sets of columns for the SAME SAMPLES.
You MUST stitch these columns horizontally on THE SAME ROW, aligning each row by the corresponding Sample # or its row index. 
EACH SAMPLE ID / SAMPLE # MUST OCCUPY EXACTLY ONE ROW. 
Never duplicate Sample # rows or leave columns blank on some rows. Merge them completely!

CRITICAL INSTRUCTION FOR MULTIPLE COLORS (FOR ALL FORMATS):
If the PDF or image contains multiple colors or colorways (e.g. "Pink, Blue, Mint" or multiple colors listed for the same sample), you MUST extract the data onto ONE SINGLE ROW.
- NEVER split or duplicate a sample into multiple rows for different colors.
- Combine all colors into the relevant Color / Colour column on that single row (e.g. separating them with a comma or slash: "Pink, Blue, Mint" or "Navy / White").
- All corresponding fields for that sample must also be fully merged onto that single row.

CRITICAL INSTRUCTION FOR MULTIPLE-CHOICE CHECKBOXES/MARKED FIELDS (FOR ALL FORMATS):
Documents may contain multiple-choice options with checkboxes. 
Some checkboxes are empty (e.g. "☐", "⬜", "[ ]"), while others are explicitly MARKED/CHECKED with an "X", cross, or checkmark inside (e.g. "☒", "☑", "[X]").
- You MUST identify which checkbox option(s) is marked/checked (i.e. having a cross/X inside it like "☒" or "[X]") as the active selection.
- Extract the text description printed directly next to the marked/checked checkbox (e.g. "Children (Size: ________ (128-170)" or "Children (128-170)") and use this extracted value for the relevant table columns like "Age Group", "Age Grade", "Age Range", "Product Groups", "Product Category", "Gender", etc.
- Always ignore descriptions located next to empty or unmarked checkboxes (e.g. "☐ Babies", "☐ Toddlers").
`;

    const knownHeaders = BUYER_COLUMNS[promptPreset];
    if (knownHeaders) {
      instructions += `\nTarget format: YOU MUST align your extraction to MATCH THESE EXACT HEADERS IN ORDER: ${JSON.stringify(knownHeaders)}.\nMap similar names or field values to fit this layout exactly. Fill missing values with empty strings.`;
      
      if (promptPreset === "ca") {
        instructions += `
CRITICAL FORMATTING RULES FOR C&A (ca) PRESET:
1. "Sample Description" column MUST be accumulated as "sample description in color", for example: "100% Cotton Polo in Navy Blue" (by looking up the 'Colour' or 'Color' value for that item).
2. "Product ID/C&A Order No" column MUST combine the last seven digits of the "USIM No." and the original "Product ID/C&A Order No" or "Order No.", separated by "and", for example: "0427389 and 987654".
3. "PLM Naming" column MUST always be formatted strictly as "DK-SGS-[last seven digits of USIM No.]", for example: "DK-SGS-0427389".
4. "Category" column MUST be mapped to "FA" instead of "fabric approval" or "SA" instead of "sample approval".
5. "SQM version" column MUST always be exactly "SQM V09.1".
6. "Fibre Composition" column MUST be accumulated as "[Fibre Composition], [Fabric Weight]", for example: "100% Cotton, 160g/m²".
7. "Contact Person" column MUST always start with the greeting "Mr.", for example: "Mr. John Doe" or "Mr. Unknown" if no custom name is found.
`;
      }
    } else {
      instructions += "\nLocate and extract all tabular structures. Automatically stitch columns horizontally on the SAME row across multiple pages using Sample # or sequence index as the primary key.";
    }

    let additionalPrompt = "";
    if (customPrompt) {
      additionalPrompt += `\nAdditional user requirement: ${customPrompt}`;
    }

    if (sampleNumber) {
      additionalPrompt += `\nFor the 'Sample #' or 'Sample Number' column, please assign this specific value to all extracted table rows: "${sampleNumber}".`;
    }

    // Rearrange prompt: Place text instructions FIRST in the parts array so the model digests goals before base64 payloads
    const textPart = {
      text: `Please analyze the attached document and extract all tabular spreadsheet records. Align your extraction to match the requested JSON schema. Fill empty or missing cells with empty strings.${additionalPrompt}\nReturn a valid JSON output matching the schema.`,
    };

    console.log(`Sending extraction request to Gemini fallback chain (Primary: gemini-flash-latest) for mimeType: ${mimeType}`);

    const extractionConfig = {
      systemInstruction: instructions,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          sheetName: {
            type: Type.STRING,
            description: "Suggested name for the primary Excel worksheet (keep short, e.g., 'Invoice_Details', 'Product_Inventory').",
          },
          headers: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "The header titles for the primary table columns.",
          },
          rows: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                cells: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Cell values for this row aligned exactly to headers.",
                }
              },
              required: ["cells"]
            },
            description: "Table row content.",
          },
          confidenceScore: {
            type: Type.NUMBER,
            description: "Estimated extraction accuracy confidence score between 0.0 and 1.0.",
          },
          summary: {
            type: Type.STRING,
            description: "A solid, professional human-readable summary of what data was extracted from the file.",
          },
          allTables: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: "Name of this table" },
                headers: { type: Type.ARRAY, items: { type: Type.STRING } },
                rows: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      cells: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: "Cell values for this row aligned to headers."
                      }
                    },
                    required: ["cells"]
                  }
                },
                summary: { type: Type.STRING, description: "Brief description of this table's content" }
              }
            },
            description: "Optional list of other sub-tables, sheets, or blocks of records discovered in the document.",
          }
        },
        required: ["sheetName", "headers", "rows", "confidenceScore", "summary"],
      }
    };

    let jsonResult: any;
    try {
      // Call generateContent with rearranged prompt parts (text preceding file) & fallback model chain
      const response = await generateContentWithFallback(ai, (model) => ({
        model,
        contents: { parts: [textPart, filePart] },
        config: extractionConfig
      }));

      const textResult = response.text;
      if (!textResult) {
        throw new Error("Empty response received from Gemini model.");
      }

      const rawResult = JSON.parse(textResult);

      // Map rows from object wrapper [{ cells: [...] }] to raw arrays [[...]] expected by the client interface
      jsonResult = {
        sheetName: rawResult.sheetName,
        headers: rawResult.headers,
        rows: [],
        confidenceScore: rawResult.confidenceScore,
        summary: rawResult.summary,
        allTables: []
      };

      if (Array.isArray(rawResult.rows)) {
        jsonResult.rows = rawResult.rows.map((row: any) => {
          if (Array.isArray(row)) return row;
          if (row && Array.isArray(row.cells)) return row.cells;
          if (row && Array.isArray(row.values)) return row.values;
          return [];
        });
      }

      if (Array.isArray(rawResult.allTables)) {
        jsonResult.allTables = rawResult.allTables.map((table: any) => {
          const tableRows = Array.isArray(table.rows)
            ? table.rows.map((row: any) => {
                if (Array.isArray(row)) return row;
                if (row && Array.isArray(row.cells)) return row.cells;
                if (row && Array.isArray(row.values)) return row.values;
                return [];
              })
            : [];
          return {
            name: table.name,
            headers: table.headers,
            rows: tableRows,
            summary: table.summary
          };
        });
      }

      if (sampleNumber) {
        console.log(`[Spreadsheet Engine] Injecting user specified sampleNumber: "${sampleNumber}"`);
        if (jsonResult.headers && Array.isArray(jsonResult.rows)) {
          const sampleColIndex = jsonResult.headers.findIndex((h: string) => 
            h && (h.toLowerCase().trim() === "sample #" || h.toLowerCase().trim() === "sample number")
          );
          if (sampleColIndex !== -1) {
            jsonResult.rows = jsonResult.rows.map((row: any[]) => {
              if (Array.isArray(row)) {
                while (row.length <= sampleColIndex) {
                  row.push("");
                }
                row[sampleColIndex] = sampleNumber;
              }
              return row;
            });
          } else {
            // If Sample # column is absent, insert it at the front!
            jsonResult.headers.unshift("Sample #");
            jsonResult.rows = jsonResult.rows.map((row: any[]) => {
              if (Array.isArray(row)) {
                return [sampleNumber, ...row];
              }
              return [sampleNumber];
            });
          }
        }

        // Also support sub-tables inside allTables
        if (Array.isArray(jsonResult.allTables)) {
          jsonResult.allTables.forEach((table: any) => {
            if (table.headers && Array.isArray(table.rows)) {
              const idx = table.headers.findIndex((h: string) => 
                h && (h.toLowerCase().trim() === "sample #" || h.toLowerCase().trim() === "sample number")
              );
              if (idx !== -1) {
                table.rows = table.rows.map((row: any[]) => {
                  if (Array.isArray(row)) {
                    while (row.length <= idx) {
                      row.push("");
                    }
                    row[idx] = sampleNumber;
                  }
                  return row;
                });
              } else {
                table.headers.unshift("Sample #");
                table.rows = table.rows.map((row: any[]) => {
                  if (Array.isArray(row)) {
                    return [sampleNumber, ...row];
                  }
                  return [sampleNumber];
                });
              }
            }
          });
        }
      }

      if (promptPreset === "ca") {
        console.log("[Spreadsheet Engine] Applying special C&A post-processing rules to primary table.");
        applyCaRules(jsonResult.headers, jsonResult.rows);
        
        if (Array.isArray(jsonResult.allTables)) {
          jsonResult.allTables.forEach((table: any, idx: number) => {
            console.log(`[Spreadsheet Engine] Applying special C&A post-processing rules to sub-table index ${idx}.`);
            applyCaRules(table.headers, table.rows);
          });
        }
      }
    } finally {
      if (uploadedFile) {
        try {
          console.log(`[Spreadsheet Engine] Cleanup: Deleting Gemini Files API resource: ${uploadedFile.name}`);
          await ai.files.delete({ name: uploadedFile.name });
        } catch (cleanupErr) {
          console.warn("[Spreadsheet Engine Warning] Failed to delete Files API resource after use:", cleanupErr);
        }
      }
    }

    return res.json(jsonResult);

  } catch (error: any) {
    console.error("Extraction error:", error);
    
    // Check if it's the 503 high demand error to output a beautiful user-friendly instruction
    const isHighDemand = JSON.stringify(error).toUpperCase().includes("HIGH DEMAND") || (error.message || "").toUpperCase().includes("HIGH DEMAND");
    const errorPrefix = isHighDemand 
      ? "The AI model is currently experiencing extremely high demand. This is a temporary temporary peak. Please click the button to try again." 
      : "An error occurred during data extraction. Please verify your document is clear and readable, and that your API key is correctly entered.";
    
    return res.status(500).json({
      error: error.message ? `${errorPrefix} (${error.message})` : errorPrefix
    });
  }
});

// Endpoint to refine current spreadsheet data using AI instruction
app.post("/api/refine", async (req, res) => {
  try {
    const { currentData, instruction } = req.body;

    if (!currentData || !currentData.headers || !currentData.rows) {
      return res.status(400).json({ error: "Missing or invalid current spreadsheet table data." });
    }
    if (!instruction) {
      return res.status(400).json({ error: "Missing refinement instruction." });
    }

    let ai;
    try {
      ai = getGeminiClient();
    } catch (err: any) {
      return res.status(401).json({
        error: err.message || "Gemini API key is missing. Please add it via the Settings > Secrets menu."
      });
    }

    const systemPrompt = `You are an AI spreadsheet assistant. You will be given a table in JSON form (including sheetName, headers, and rows) and a user command.
Your task is to modify, update, calculate, or format the table data following the user's instruction.
Return the updated table matching the same JSON structure.

USER COMMAND:
"${instruction}"

CURRENT TABLE DETAILS:
${JSON.stringify(currentData, null, 2)}

Strictly follow these rules:
1. Update headers or rows according to instructions. For example, if asked to add columns (like "Totals" or "Averages"), calculate them and append them.
2. If asked to format cells, modify the strings appropriately.
3. Keep the columns matched. If headers length decreases/increases, the row cells must also decrease/increase.
4. Output your response as a valid JSON matching the schema.`;

    console.log(`Refining spreadsheet data with instruction: "${instruction}"`);

    const refineConfig = {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          sheetName: { type: Type.STRING },
          headers: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          rows: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                cells: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Cell values for this row aligned exactly to headers."
                }
              },
              required: ["cells"]
            },
          },
          confidenceScore: { type: Type.NUMBER },
          summary: { type: Type.STRING },
          allTables: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                headers: { type: Type.ARRAY, items: { type: Type.STRING } },
                rows: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      cells: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: "Cell values for this row aligned to headers."
                      }
                    },
                    required: ["cells"]
                  }
                },
                summary: { type: Type.STRING }
              }
            }
          }
        },
        required: ["sheetName", "headers", "rows", "confidenceScore", "summary"],
      }
    };

    const response = await generateContentWithFallback(ai, (model) => ({
      model,
      contents: systemPrompt,
      config: refineConfig
    }));

    const textResult = response.text;
    if (!textResult) {
      throw new Error("Empty response received from refinement model.");
    }

    const rawResult = JSON.parse(textResult);

    // Map rows from object wrapper [{ cells: [...] }] to raw arrays [[...]] expected by the client interface
    const jsonResult: any = {
      sheetName: rawResult.sheetName,
      headers: rawResult.headers,
      rows: [],
      confidenceScore: rawResult.confidenceScore,
      summary: rawResult.summary,
      allTables: []
    };

    if (Array.isArray(rawResult.rows)) {
      jsonResult.rows = rawResult.rows.map((row: any) => {
        if (Array.isArray(row)) return row;
        if (row && Array.isArray(row.cells)) return row.cells;
        if (row && Array.isArray(row.values)) return row.values;
        return [];
      });
    }

    if (Array.isArray(rawResult.allTables)) {
      jsonResult.allTables = rawResult.allTables.map((table: any) => {
        const tableRows = Array.isArray(table.rows)
          ? table.rows.map((row: any) => {
              if (Array.isArray(row)) return row;
              if (row && Array.isArray(row.cells)) return row.cells;
              if (row && Array.isArray(row.values)) return row.values;
              return [];
            })
          : [];
        return {
          name: table.name,
          headers: table.headers,
          rows: tableRows,
          summary: table.summary
        };
      });
    }

    return res.json(jsonResult);

  } catch (error: any) {
    console.error("Refine error:", error);
    return res.status(500).json({
      error: error.message || "An error occurred during data refinement."
    });
  }
});

// Setup Vite Dev Server / Static Handling
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite development server mounted");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Serve HTML
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Serving production static files from dist");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
