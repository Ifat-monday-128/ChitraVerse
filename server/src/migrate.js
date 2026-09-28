const queries = require('./queries/transactions.queries');
const fs = require("node:fs/promises");
const path = require("node:path");
const pool = require("./config/db");

async function migrate() {
  const directory = path.resolve(__dirname, "../database/migrations");
  for (const file of (await fs.readdir(directory)).filter((file) => file.endsWith(".sql")).sort()) {
    const client = await pool.connect();
    try {
      await client.query(queries.begin);
      await client.query(await fs.readFile(path.join(directory, file), "utf8"));
      await client.query(queries.commit);
      console.log(`Applied ${file}`);
    } catch (error) {
      await client.query(queries.rollback);
      throw error;
    } finally { client.release(); }
  }
}
if (require.main === module) migrate().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
module.exports = migrate;
