require("./config/env");

const app = require("./app");
const pool = require("./config/db");
const migrate = require("./migrate");

const port = Number(process.env.PORT || 5000);

async function start() {
  try {
    await migrate();
  } catch (error) {
    console.error(`Database migration failed: ${error.message}`);
    pool.end();
    process.exitCode = 1;
    return;
  }

  const server = app.listen(port, (error) => {
    if (error) {
      console.error(`Could not start the API on port ${port}: ${error.message}`);
      pool.end();
      process.exitCode = 1;
      return;
    }
    console.log(`ChitraVerse API running at http://localhost:${server.address().port}`);
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
}

start();
