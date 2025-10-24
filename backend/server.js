require("dotenv").config();
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("./db");
const fs = require("fs");
const authenticateToken = require("./middleware/auth");
const { processFile } = require("./aiService");
const enqueueAIJob = require("./producer");
const { analyzeUnprocessedFiles } = require("./aiInsights");
const { processFileForSummary } = require("./summarizer");
const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });
const path = require("path");

// Register endpoint
app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  try {
    // Check if user exists
    const userExists = await pool.query(
      "SELECT * FROM users WHERE email = $1 OR username = $2",
      [email, username]
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const newUser = await pool.query(
      "INSERT INTO users(username, email, password) VALUES($1, $2, $3) RETURNING id, username, email",
      [username, email, hashedPassword]
    );

    // Create JWT token
    const token = jwt.sign(
      { id: newUser.rows[0].id, username: newUser.rows[0].username },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "User registered successfully",
      token,
      user: newUser.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Login endpoint
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Upload file WITH AI PROCESSING (ONLY ONE UPLOAD ENDPOINT)
app.post(
  "/upload",
  authenticateToken,
  upload.single("file"),
  async (req, res) => {
    const { originalname, path, mimetype, size } = req.file;

    console.log("📤 Uploading file:", originalname);
    console.log("🔍 Processing with AI...");

    try {
      // Process file with AI to get tags
      const tags = await processFile(path, mimetype);

      console.log("✅ AI Tags generated:", tags);

      // Save to database with tags
      await pool.query(
        "INSERT INTO files(filename, filepath, mimetype, size, user_id, tags, ai_processed) VALUES($1, $2, $3, $4, $5, $6, $7)",
        [originalname, path, mimetype, size, req.user.id, tags, true]
      );

      console.log("💾 Saved to database with tags");

      res.json({
        message: "File uploaded and analyzed successfully!",
        tags: tags,
      });
    } catch (err) {
      console.error("❌ Upload error:", err);
      res.status(500).json({ error: "Upload or AI processing error" });
    }
  }
);

// Get user's files with tags
app.get("/files", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, filename, filepath, mimetype, size, upload_date, tags, ai_processed FROM files WHERE user_id = $1 ORDER BY upload_date DESC",
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// Download file
app.get("/download/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "SELECT * FROM files WHERE id = $1 AND user_id = $2",
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "File not found" });
    }

    const file = result.rows[0];
    res.download(file.filepath, file.filename);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Download error" });
  }
});

// Delete file
app.delete("/files/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "SELECT * FROM files WHERE id = $1 AND user_id = $2",
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "File not found" });
    }

    const file = result.rows[0];

    if (fs.existsSync(file.filepath)) {
      fs.unlinkSync(file.filepath);
    }

    await pool.query("DELETE FROM files WHERE id = $1", [id]);
    res.json({ message: "File deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Delete error" });
  }
});

// Search files by tags
app.get("/files/search", authenticateToken, async (req, res) => {
  try {
    const { query } = req.query;
    const result = await pool.query(
      `SELECT * FROM files 
       WHERE user_id = $1 
       AND (filename ILIKE $2 OR $2 = ANY(tags))
       ORDER BY upload_date DESC`,
      [req.user.id, `%${query}%`]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Search error" });
  }
});

app.listen(3001, () => {
  console.log("Backend running on http://localhost:3001");
});

app.post(
  "/upload",
  authenticateToken,
  upload.single("file"),
  async (req, res) => {
    const { originalname, path, mimetype, size } = req.file;
    try {
      // Save initial info to DB without tags yet
      await pool.query(
        "INSERT INTO files(filename, filepath, mimetype, size, user_id, ai_processed) VALUES($1, $2, $3, $4, $5, $6)",
        [originalname, path, mimetype, size, req.user.id, false]
      );

      // Enqueue job for async AI processing
      await enqueueAIJob(path, req.user.id);

      // Respond immediately
      res.json({
        message: "File uploaded successfully; AI processing queued.",
      });
    } catch (err) {
      console.error("❌ Upload error:", err);
      res.status(500).json({ error: "Upload error" });
    }
  }
);
app.get("/ai/refresh", async (req, res) => {
  try {
    await analyzeUnprocessedFiles();
    res.json({ message: "AI Insights refreshed successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AI refresh failed" });
  }
});

// Add this endpoint after your /upload route
app.post("/generate-summary/:id", authenticateToken, async (req, res) => {
  try {
    const fileId = req.params.id;

    // Get file from PostgreSQL database
    const result = await pool.query(
      "SELECT * FROM files WHERE id = $1 AND user_id = $2",
      [fileId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "File not found" });
    }

    const file = result.rows[0];

    console.log("Processing file:", file.filename, "Type:", file.mimetype);

    // Check if file type is supported
    const supportedTypes = ["application/pdf", "text/plain"];
    if (
      !supportedTypes.includes(file.mimetype) &&
      !file.mimetype.includes("text")
    ) {
      console.log("Unsupported file type:", file.mimetype);
      return res.status(400).json({
        error:
          "File type not supported for summarization. Only PDF and text files are supported.",
      });
    }

    // Generate summary
    const filePath = file.filepath; // Use filepath from database
    console.log("File path:", filePath);

    const summary = await processFileForSummary(filePath, file.mimetype);

    if (!summary) {
      console.error("Failed to generate summary");
      return res.status(500).json({ error: "Failed to generate summary" });
    }

    console.log("Summary generated:", summary);

    // Update PostgreSQL database with summary
    await pool.query(
      "UPDATE files SET summary = $1, ai_processed = $2 WHERE id = $3",
      [summary, true, fileId]
    );

    res.json({ summary });
  } catch (error) {
    console.error("Summary generation error:", error);
    res.status(500).json({ error: "Server error: " + error.message });
  }
});
