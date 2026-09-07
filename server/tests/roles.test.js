const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { randomBytes, scryptSync, createHash } = require("node:crypto");
require("../src/config/env");
const { Pool } = require("pg");

// All fixture accounts live in a disposable schema, never in the real users table.
const schema = `chitraverse_roles_${process.pid}_${Date.now()}`;
const admin = new Pool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, options: "" });
process.env.PGOPTIONS = `-c search_path=${schema},public`;
const pool = require("../src/config/db");
const app = require("../src/app");
const password = "Authentication test 123!";
const roles = ["user", "admin", "moderator"];
let server, base;

test.before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await pool.query(await fs.readFile(path.resolve(__dirname, "../database/schema.sql"), "utf8"));
  await pool.query(await fs.readFile(path.resolve(__dirname, "../database/migrations/001_search_and_sessions.sql"), "utf8"));
  assert.equal((await pool.query("SELECT current_schema() AS name")).rows[0].name, schema);
  // admin/moderator are test fixtures proving that login is not hardcoded to user.
  for (const role of roles) {
    const salt = randomBytes(16).toString("hex");
    const hash = `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
    await pool.query("INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4)", [role, `${role}@example.invalid`, hash, role]);
  }
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
});

async function request(url, { body, cookie, method = body ? "POST" : "GET" } = {}) {
  const response = await fetch(base + url, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const setCookie = response.headers.get("set-cookie");
  return { status: response.status, body: await response.json(), headers: response.headers, setCookie, cookie: setCookie?.split(";")[0] };
}

test("users rate movies once; admin can inspect activity but cannot rate or use watchlists", async () => {
  const movie = (await pool.query("INSERT INTO media(title) VALUES('Rating test movie') RETURNING title_id")).rows[0].title_id;
  await pool.query("INSERT INTO movie(title_id) VALUES($1)", [movie]);
  const series = (await pool.query("INSERT INTO media(title) VALUES('Series') RETURNING title_id")).rows[0].title_id;
  await pool.query("INSERT INTO series(title_id) VALUES($1)", [series]);
  const login = async role => (await request('/api/account/login', { body: { email: `${role}@example.invalid`, password } })).cookie;
  const user = await login('user'), adminCookie = await login('admin');
  const endpoint = `/api/account/ratings/${movie}`;
  assert.equal((await request(endpoint, {method:'PUT',body:{rating:8}})).status,401);
  assert.equal((await request('/api/account/admin/users')).status,401);
  assert.equal((await request('/api/account/admin/users',{cookie:user})).status,403);
  assert.equal((await request(endpoint,{method:'PUT',cookie:adminCookie,body:{rating:8}})).status,403);
  for (const method of ['GET','PUT','DELETE']) {
    assert.equal((await request('/api/account/watchlist'+(method==='GET'?'':`/${movie}`),{method,cookie:adminCookie})).status,403);
  }
  for (const rating of [0,11,1.5,'8',null]) assert.equal((await request(endpoint,{method:'PUT',cookie:user,body:{rating}})).status,400);
  assert.equal((await request(`/api/account/ratings/${series}`,{method:'PUT',cookie:user,body:{rating:8}})).status,404);
  const rate = rating => request(endpoint,{method:'PUT',cookie:user,body:{rating,user_id:2,role:'admin'}});
  assert.equal((await rate(8)).body.chitraverse_rating,'8.0');
  const update = await rate(6);
  assert.equal(update.body.chitraverse_vote_count,1);
  assert.equal(update.body.chitraverse_rating,'6.0');
  await Promise.all([rate(7),rate(9)]);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM review WHERE title_id=$1 AND rating IS NOT NULL',[movie])).rows[0].count,1);
  await rate(6);
  const second = await request('/api/account/register',{body:{name:'Second',email:'second@example.invalid',password}});
  const average = await request(endpoint,{method:'PUT',cookie:second.cookie,body:{rating:10}});
  assert.equal(average.body.chitraverse_rating,'8.0');
  assert.equal(average.body.chitraverse_vote_count,2);
  assert.equal((await request(endpoint,{cookie:user})).body.rating,'6.0');
  const details = await request(`/api/media/${movie}`);
  assert.equal(details.body.chitraverse_rating,'8.0');
  assert.equal((await request(`/api/account/watchlist/${movie}`,{method:'PUT',cookie:user})).status,200);
  const users = await request('/api/account/admin/users',{cookie:adminCookie});
  assert.equal(users.status,200);
  assert.ok(users.body.users.every(row=>!('password_hash' in row)));
  const activity = users.body.users.find(row=>row.email==='user@example.invalid').activities;
  assert.equal(activity.length,2);
  assert.ok(activity.some(row=>row.kind==='rating' && Number(row.rating)===6));
  assert.ok(activity.some(row=>row.kind==='watchlist'));
  await request('/api/account/logout',{method:'POST',cookie:adminCookie});
  assert.equal((await request('/api/account/admin/users',{cookie:adminCookie})).status,401);
  await request('/api/account/logout',{method:'POST',cookie:user});
  assert.equal((await rate(5)).status,401);
});

