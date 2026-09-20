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
const schema = `chitraverse_library_${process.pid}_${Date.now()}`;
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

test('named watchlists preserve per-list membership, privacy, persistence and duplicate protection', async () => {
  const login = async role => (await request('/api/account/login', { body: { email: `${role}@example.invalid`, password } })).cookie;
  const user = await login('user'), other = await login('moderator'), adminCookie = await login('admin');
  const call = (url, method = 'GET', body, cookie = user) => request('/api/account' + url, { method, body, cookie });
  const ids = [];
  for (const type of ['movie', 'series', 'movie']) {
    const id = (await pool.query('INSERT INTO media(title) VALUES($1) RETURNING title_id', [`Library ${type} ${ids.length}`])).rows[0].title_id;
    await pool.query(`INSERT INTO ${type}(title_id) VALUES($1)`, [id]); ids.push(id);
  }
  assert.equal((await call('/watchlists', 'GET', undefined, null)).status, 401);
  assert.equal((await call('/watchlists', 'POST', { name: 'Admin' }, adminCookie)).status, 403);
  for (const name of [null, '', '  ', 123, 'a'.repeat(256)]) assert.equal((await call('/watchlists', 'POST', { name })).status, 400);
  const a = (await call('/watchlists', 'POST', { name: 'Weekend', user_id: 2 })).body.watchlist.watchlist_id;
  const b = (await call('/watchlists', 'POST', { name: 'Friends' })).body.watchlist.watchlist_id;
  assert.equal((await call('/watchlists')).body.watchlists.length, 2);
  const listA = `/watchlists/${a}`, listB = `/watchlists/${b}`;
  for (const id of ids) assert.equal((await call(`${listA}/items/${id}`, 'PUT')).status, 200);
  await Promise.all(Array.from({ length: 6 }, () => call(`${listA}/items/${ids[0]}`, 'PUT')));
  await call(`${listB}/items/${ids[0]}`, 'PUT');
  assert.equal((await call(listA)).body.items.length, 3);
  assert.equal((await call(listB)).body.items.length, 1);
  const choices = (await call(`/watchlists?title_id=${ids[0]}`)).body.watchlists;
  assert.deepEqual(choices.map(row => row.contains_title), [true, true]);
  assert.deepEqual(choices.map(row => row.title_count), [3, 1]);
  await call(`${listA}/items/${ids[0]}`, 'DELETE');
  assert.equal((await call(listA)).body.items.length, 2);
  assert.equal((await call(listB)).body.items.length, 1);
  assert.equal((await call(listA, 'PATCH', { name: '  Weekend classics  ' })).body.watchlist.name, 'Weekend classics');
  assert.equal((await call(listA, 'PATCH', { name: '' })).status, 400);
  assert.equal((await call(`${listA}/items/2147483647`, 'PUT')).status, 404);
  for (const path of ['/watchlists/0', '/watchlists/nope', '/watchlists/2147483648', '/watchlists?title_id=1&title_id=2', `${listA}/items/1.2`]) assert.equal((await call(path, path.includes('/items/') ? 'PUT' : 'GET')).status, 400);
  for (const [path, method, body] of [[listA, 'GET'], [listA, 'PATCH', { name: 'Stolen', user_id: 1 }], [listA, 'DELETE'], [`${listA}/items/${ids[0]}`, 'PUT'], [`${listA}/items/${ids[1]}`, 'DELETE']]) {
    assert.equal((await call(path, method, body, other)).status, 404);
  }
  assert.deepEqual((await call('/watchlists?user_id=1', 'GET', undefined, other)).body.watchlists, []);
  // Legacy write URLs cannot pick a default list or delete from every list.
  for (const method of ['PUT', 'DELETE']) assert.equal((await call(`/watchlist/${ids[0]}`, method)).status, 400);
  assert.equal((await call(listB)).body.items.length, 1);
  await call('/logout', 'POST');
  assert.equal((await call(listA)).status, 401);
  const again = await login('user');
  assert.equal((await call(listA, 'GET', undefined, again)).body.watchlist.name, 'Weekend classics');
  assert.equal((await call(listA, 'DELETE', undefined, again)).status, 200);
  assert.equal((await call(listA, 'GET', undefined, again)).status, 404);
  assert.equal((await call(listB, 'GET', undefined, again)).body.items.length, 1);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM watchlist_item WHERE watchlist_id=$1', [a])).rows[0].count, 0);
});

test('favorites support movies and series, concurrent duplicate prevention, persistence and user isolation', async () => {
  const login = async role => (await request('/api/account/login', { body: { email: `${role}@example.invalid`, password } })).cookie;
  const user = await login('user'), other = await login('moderator'), adminCookie = await login('admin');
  const call = (url, method = 'GET', cookie = user, body) => request('/api/account' + url, { method, cookie, body });
  const ids = (await pool.query('SELECT title_id FROM media ORDER BY title_id LIMIT 2')).rows.map(row => row.title_id);
  assert.equal((await call('/favorites', 'GET', null)).status, 401);
  assert.equal((await call('/favorites', 'GET', adminCookie)).status, 403);
  for (const id of ids) {
    assert.equal((await call(`/favorites/${id}`)).body.saved, false);
    assert.equal((await call(`/favorites/${id}`, 'PUT', user, { user_id: 2 })).status, 200);
  }
  await Promise.all(Array.from({ length: 8 }, () => call(`/favorites/${ids[0]}`, 'PUT')));
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM favourite')).rows[0].count, 2);
  assert.deepEqual((await call('/favorites')).body.items.map(item => item.media_type).sort(), ['movie', 'series']);
  assert.equal((await call(`/favorites/${ids[0]}`)).body.saved, true);
  assert.deepEqual((await call('/favorites?user_id=1', 'GET', other)).body.items, []);
  await call(`/favorites/${ids[0]}`, 'DELETE', other, { user_id: 1 });
  assert.equal((await call(`/favorites/${ids[0]}`)).body.saved, true);
  await call(`/favorites/${ids[0]}`, 'PUT', other);
  await call(`/favorites/${ids[0]}`, 'DELETE');
  assert.equal((await call(`/favorites/${ids[0]}`, 'GET', other)).body.saved, true);
  assert.equal((await call('/favorites')).body.items.length, 1);
  assert.equal((await call('/favorites/2147483647', 'PUT')).status, 404);
  for (const id of ['0', 'nope', '2147483648']) assert.equal((await call(`/favorites/${id}`, 'PUT')).status, 400);
  await call('/logout', 'POST');
  for (const method of ['GET', 'PUT', 'DELETE']) assert.equal((await call(`/favorites/${ids[1]}`, method)).status, 401);
  const again = await login('user');
  assert.equal((await call(`/favorites/${ids[1]}`, 'GET', again)).body.saved, true);
  assert.equal((await call('/favorites', 'GET', again)).body.items[0].title_id, ids[1]);
});

test('series ratings share the stored aggregate and homepage/details expose the same value', async () => {
  const cookie = (await request('/api/account/login', { body: { email: 'user@example.invalid', password } })).cookie;
  const id = (await pool.query('SELECT title_id FROM series LIMIT 1')).rows[0].title_id;
  const before = (await request(`/api/media/${id}`)).body;
  assert.equal(before.chitraverse_rating, null);
  assert.equal(before.chitraverse_vote_count, 0);
  const rate = rating => request(`/api/account/ratings/${id}`, { method: 'PUT', cookie, body: { rating } });
  assert.equal((await rate(9)).body.chitraverse_rating, '9.0');
  const update = (await rate(7)).body;
  assert.equal(update.chitraverse_rating, '7.0');
  assert.equal(update.chitraverse_vote_count, 1);
  assert.equal((await request(`/api/account/ratings/${id}`, { cookie })).body.rating, '7.0');
  await pool.query('INSERT INTO homepage_feature(title_id,position) VALUES($1,0)', [id]);
  const home = (await request('/api/media/home')).body.featured;
  const detail = (await request(`/api/media/${id}`)).body;
  assert.equal(home.chitraverse_rating, detail.chitraverse_rating);
  assert.equal(home.chitraverse_rating, '7.0');
  assert.equal(home.chitraverse_vote_count, 1);
});

