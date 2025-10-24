const fs = require("fs").promises;
const PDFParser = require("pdf2json");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Gemini with your API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Extract text from PDF using pdf2json
async function extractTextFromPDF(filePath) {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();

    pdfParser.on("pdfParser_dataError", (errData) => {
      console.error("❌ PDF Parse Error:", errData.parserError);
      resolve(null);
    });

    pdfParser.on("pdfParser_dataReady", (pdfData) => {
      try {
        let text = "";
        if (pdfData.Pages) {
          pdfData.Pages.forEach((page) => {
            if (page.Texts) {
              page.Texts.forEach((textItem) => {
                if (textItem.R) {
                  textItem.R.forEach((run) => {
                    if (run.T) {
                      try {
                        text += decodeURIComponent(run.T) + " ";
                      } catch (decodeError) {
                        text +=
                          run.T.replace(/%20/g, " ").replace(/%2C/g, ",") + " ";
                      }
                    }
                  });
                }
              });
            }
          });
        }

        text = text.replace(/\s+/g, " ").trim();
        console.log("📄 Extracted text length:", text.length, "characters");
        console.log(`📄 Estimated pages: ~${Math.round(text.length / 2500)}`);

        if (text.length > 0) {
          console.log("📄 First 200 chars:", text.substring(0, 200));
        }

        resolve(text.length > 0 ? text : null);
      } catch (error) {
        console.error("❌ Error processing PDF data:", error.message);
        resolve(null);
      }
    });

    pdfParser.loadPDF(filePath);
  });
}

// Extract text from TXT files
async function extractTextFromFile(filePath) {
  try {
    const text = await fs.readFile(filePath, "utf-8");
    console.log("📝 Extracted text length:", text.length, "characters");
    return text;
  } catch (error) {
    console.error("❌ Error reading text file:", error.message);
    return null;
  }
}

// Extract document metadata (title, authors)
function extractDocumentMetadata(text) {
  const preview = text.substring(0, 1000);

  // Try to detect title (usually uppercase at beginning)
  const titleMatch = preview.match(/^([A-Z][A-Z\s]{10,80})/);
  const title = titleMatch ? titleMatch[1].trim() : null;

  // Try to detect author names
  const authorPatterns = [
    /(?:by|author|written by)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/i,
    /([A-Z][a-z]+\s+[A-Z]\.\s+[A-Z][a-z]+)/g,
  ];

  let authors = [];
  for (const pattern of authorPatterns) {
    const matches = preview.match(pattern);
    if (matches) {
      authors = matches.slice(0, 3); // Max 3 authors
      break;
    }
  }

  return { title, authors: authors.join(", ") };
}

// Generate summary using Google Gemini
async function generateSummary(text) {
  try {
    const cleanText = text.replace(/\s+/g, " ").trim();

    if (cleanText.length < 50) {
      return "Document is too short to generate a meaningful summary.";
    }

    const pageCount = Math.round(text.length / 2500);
    const metadata = extractDocumentMetadata(text);

    console.log(`🤖 Sending to Google Gemini for summarization...`);

    // Gemini can handle large documents
    // For efficiency, send first 30,000 characters
    const textToSummarize = cleanText.substring(0, 30000);

    // ✅ UPDATED: Use the correct model name
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash"  // Updated model name
    });

    const prompt = `Please provide a comprehensive 2-3 sentence summary of this document. Focus on the main topics, key concepts, target audience, and overall purpose:\n\n${textToSummarize}`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const summary = response.text().trim();

    console.log("✅ Summary generated successfully with Google Gemini!");

    // Build rich summary with metadata
    let richSummary = "";

    if (metadata.title) {
      richSummary += `"${metadata.title}" - `;
    }

    if (metadata.authors) {
      richSummary += `by ${metadata.authors}. `;
    }

    richSummary += summary;

    // Add document info for large documents
    if (text.length > 10000) {
      richSummary += ` [Document: approximately ${pageCount} pages]`;
    }

    return richSummary;
  } catch (error) {
    console.error("❌ Gemini API Error:", error.message);

    // Intelligent fallback
    const metadata = extractDocumentMetadata(text);
    const pageCount = Math.round(text.length / 2500);

    if (error.message.includes("API_KEY_INVALID") || error.message.includes("API key")) {
      return `Please check your Gemini API key in .env file. Document contains approximately ${pageCount} pages.`;
    }

    if (error.message.includes("quota") || error.message.includes("limit")) {
      return `Daily API quota exceeded. Document contains approximately ${pageCount} pages. Try again tomorrow.`;
    }

    if (error.message.includes("not found") || error.message.includes("404")) {
      return `Model configuration error. Document contains approximately ${pageCount} pages. Please check your setup.`;
    }

    if (error.message.includes("fetch failed") || error.message.includes("ENOTFOUND")) {
      return `Network error: Cannot reach Google AI servers. Please check your internet connection. Document contains approximately ${pageCount} pages.`;
    }

    if (metadata.title) {
      return `"${metadata.title}" - A ${pageCount}-page document. AI summarization temporarily unavailable.`;
    }

    return `Document contains approximately ${pageCount} pages. AI summarization temporarily unavailable.`;
  }
}

// Main function
async function processFileForSummary(filePath, mimetype) {
  console.log("🔄 Processing file:", filePath);
  console.log("📋 Mimetype:", mimetype);

  let text = null;

  if (mimetype === "application/pdf") {
    text = await extractTextFromPDF(filePath);
  } else if (mimetype === "text/plain" || mimetype.includes("text")) {
    text = await extractTextFromFile(filePath);
  } else {
    return "File type not supported for summarization";
  }

  if (!text || text.length === 0) {
    return "Failed to extract text from document. The PDF might be image-based, scanned, or encrypted.";
  }

  if (text.length < 50) {
    return `Document too short (${text.length} characters).`;
  }

  const summary = await generateSummary(text);
  return summary;
}

module.exports = {
  processFileForSummary,
  extractTextFromPDF,
  extractTextFromFile,
};
