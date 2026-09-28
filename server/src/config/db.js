const queries = require('../queries/transactions.queries');
require("./env");

const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionTimeoutMillis: 5000,
});

// A transaction always uses one checked-out connection, including rollback.
pool.withTransaction = async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query(queries.begin);
    const result = await work(client);
    await client.query(queries.commit);
    return result;
  } catch (error) {
    await client.query(queries.rollback);
    throw error;
  } finally { client.release(); }
};
// Standalone writes also use explicit transaction control for the course requirements.
pool.write = (sql, values) => pool.withTransaction(client => client.query(sql, values));
module.exports = pool;
