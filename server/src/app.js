const express = require("express");
const cors = require("cors");
const mediaRoutes = require("./routes/media.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});
app.get("/", (req, res) => {
  res.json({
    name: "ChitraVerse API",
    status: "ok",
    endpoints: ["/health", "/api/media"],
  });
});
app.use("/api/media", mediaRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  return res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
