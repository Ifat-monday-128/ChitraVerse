require("./config/env");

const app = require("./app");
const pool = require("./config/db");

const port = Number(process.env.PORT || 5000);
const server = app.listen(port, () => {
  console.log(`ChitraVerse API running at http://localhost:${port}`);
});

async function shutdown(signal) {
  console.log(`${signal} received; shutting down`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
