// aiInsights.js
const pool = require("./db");
const { processFile } = require("./aiService"); // your existing AI tagging logic

// Function to analyze existing files in DB that haven’t been processed yet
async function analyzeUnprocessedFiles() {
  try {
    const result = await pool.query(
      "SELECT * FROM files WHERE ai_processed = false LIMIT 5" // batch process few at a time
    );

    if (result.rows.length === 0) {
      console.log("✅ No unprocessed files found.");
      return;
    }

    console.log(`🔍 Found ${result.rows.length} unprocessed files`);

    for (const file of result.rows) {
      console.log(`⚙️ Processing ${file.filename}...`);

      // Run AI model for tagging/summarization
      const tagsOrSummary = await processFile(file.filepath, file.mimetype);

      await pool.query(
        "UPDATE files SET tags = $1, ai_processed = true WHERE id = $2",
        [tagsOrSummary, file.id]
      );

      console.log(`✅ Processed and updated ${file.filename}`);
    }

    console.log("🎉 AI processing complete for new files!");
  } catch (err) {
    console.error("❌ Error during AI insights generation:", err);
  }
}

module.exports = { analyzeUnprocessedFiles };
