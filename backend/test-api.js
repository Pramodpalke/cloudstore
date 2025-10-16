const axios = require("axios");
const fs = require("fs");

const HF_API_KEY = process.env.HF_API_KEY;
const IMAGE_CLASSIFICATION_URL =
  "https://api-inference.huggingface.co/models/google/vit-base-patch16-224";

async function analyzeImage(filepath) {
  try {
    console.log("🔑 Using API Key:", HF_API_KEY ? "Found" : "MISSING");

    const imageBuffer = fs.readFileSync(filepath);

    const response = await axios.post(IMAGE_CLASSIFICATION_URL, imageBuffer, {
      headers: {
        Authorization: `Bearer ${HF_API_KEY}`,
        "Content-Type": "application/octet-stream",
      },
      timeout: 30000, // 30 second timeout
    });

    console.log("🤖 AI Response:", response.data);

    // Extract top 3 tags from AI response
    const tags = response.data
      .slice(0, 3)
      .map((item) => item.label.split(",")[0].trim())
      .filter((tag) => tag.length > 0);

    return tags;
  } catch (error) {
    console.error("❌ AI analysis error:", error.response?.status);
    console.error("❌ Error message:", error.response?.data);
    console.error("❌ Full error:", error.message);
    return [];
  }
}

function getFileCategory(mimetype) {
  if (mimetype.startsWith("image/")) return "image";
  if (mimetype.startsWith("video/")) return "video";
  if (mimetype.startsWith("audio/")) return "audio";
  if (mimetype.includes("pdf")) return "document";
  if (mimetype.includes("word") || mimetype.includes("document"))
    return "document";
  if (mimetype.includes("excel") || mimetype.includes("spreadsheet"))
    return "spreadsheet";
  if (mimetype.includes("zip") || mimetype.includes("rar")) return "archive";
  return "other";
}

async function processFile(filepath, mimetype) {
  const category = getFileCategory(mimetype);
  let tags = [category];

  // Only analyze images with AI
  if (category === "image") {
    const aiTags = await analyzeImage(filepath);
    tags = [...tags, ...aiTags];
  }

  return tags;
}

module.exports = { processFile, analyzeImage };
