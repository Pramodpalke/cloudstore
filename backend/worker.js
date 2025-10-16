const { Worker } = require("bullmq");
const pool = require("./db");
const { processFile } = require("./aiService"); // your AI processing function

const connection = { host: "127.0.0.1", port: 6379 };

const worker = new Worker(
  "ai-analysis",
  async (job) => {
    console.log("Starting AI job processing...");   
    const { filePath, userId } = job.data;
    console.log(`Processing AI job for file: ${filePath}`);

    // Call your AI service to get tags
    const tags = await processFile(filePath);

    // Update DB with tags and mark as processed
    await pool.query(
      "UPDATE files SET tags = $1, ai_processed = true WHERE filepath = $2 AND user_id = $3",
      [tags, filePath, userId]
    );

    console.log(`Tags saved for file: ${filePath}`);
    return true;
  },
  { connection }
);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed successfully.`);
});

worker.on("failed", (job, err) => {
  console.error(`Job ${job.id} failed: ${err.message}`);
});
