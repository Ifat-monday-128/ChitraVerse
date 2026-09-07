const express = require("express");
const cors = require("cors");
const mediaRoutes = require("./routes/media.routes");
const accountRoutes = require("./routes/account.routes");

const app = express();

const origins = (process.env.FRONTEND_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000").split(",").map((value) => value.trim());
app.use(cors({ origin: origins, credentials: true }));
app.use(express.json({ limit: "16kb" }));
app.use((req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.headers.origin && !origins.includes(req.headers.origin)) {
    return res.status(403).json({ error: "Origin is not allowed" });
  }
  next();
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});
app.use("/api/media", mediaRoutes);
app.use("/api/account", accountRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  if (error.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON" });
  return res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
