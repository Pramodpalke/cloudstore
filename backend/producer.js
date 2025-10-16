const { Queue } = require("bullmq");
const connection = { host: "127.0.0.1", port: 6379 };

const aiQueue = new Queue("ai-analysis", { connection });

async function enqueueAIJob(filePath, userId) {
  await aiQueue.add("process-image", { filePath, userId });
  console.log(`Job enqueued for file: ${filePath}`);
}

module.exports = enqueueAIJob;
