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

test('only authenticated admins can persist and reorder homepage movies and series', async () => {
  const movie = (await pool.query("INSERT INTO media(title) VALUES('Featured movie') RETURNING title_id")).rows[0].title_id;
  const series = (await pool.query("INSERT INTO media(title) VALUES('Featured series') RETURNING title_id")).rows[0].title_id;
  await pool.query('INSERT INTO movie(title_id) VALUES($1)', [movie]);
  await pool.query('INSERT INTO series(title_id) VALUES($1)', [series]);
  const login = async role => (await request('/api/account/login', { body: { email: `${role}@example.invalid`, password } })).cookie;
  const adminCookie = await login('admin'), userCookie = await login('user'), moderatorCookie = await login('moderator');
  const endpoint = '/api/account/admin/homepage';
  const save = (ids, cookie = adminCookie) => request(endpoint, { method: 'PUT', cookie, body: { title_ids: ids, role: 'admin' } });
  assert.equal((await request(endpoint)).status, 401);
  assert.equal((await save([movie], null)).status, 401);
  for (const cookie of [userCookie, moderatorCookie]) {
    assert.equal((await request(endpoint, { cookie })).status, 403);
    assert.equal((await save([movie], cookie)).status, 403);
  }
  assert.equal((await save([movie])).status, 200);
  assert.deepEqual((await request('/api/media/home')).body.featuredItems.map(item => item.title_id), [movie]);
  assert.equal((await save([series, movie])).status, 200);
  assert.deepEqual((await request('/api/media/home')).body.featuredItems.map(item => item.media_type), ['series', 'movie']);
  assert.deepEqual((await request(endpoint, { cookie: adminCookie })).body.items.map(item => item.title_id), [series, movie]);
  for (const ids of [null, 'bad', [movie, movie], ['1'], [-1], [2147483647], Array.from({length:21}, (_,index)=>index+1)]) {
    assert.equal((await save(ids)).status, 400);
  }
  assert.deepEqual((await request('/api/media/home')).body.featuredItems.map(item => item.title_id), [series, movie]);
  // Applying the one-time addition again must preserve an existing lineup.
  const migration = await fs.readFile(path.resolve(__dirname, '../database/migrations/002_homepage_features.sql'), 'utf8');
  await pool.query(migration); await pool.query(migration);
  assert.equal((await request('/api/media/home')).body.featured.title_id, series);
  assert.equal((await save([movie, series])).status, 200);
  assert.equal((await request('/api/media/home')).body.featured.title_id, movie);
  assert.equal((await save([])).status, 200);
  await request('/api/account/logout', { method: 'POST', cookie: adminCookie });
  assert.equal((await save([movie])).status, 401);
});

test('watchlist search filters only the authenticated user’s saved titles', async () => {
  const login=async role=>(await request('/api/account/login',{body:{email:`${role}@example.invalid`,password}})).cookie;
  const userCookie=await login('user'), otherCookie=await login('moderator');
  const ids=[];
  for(const title of ['Private filter Alpha','Private filter Beta']) {
    const id=(await pool.query('INSERT INTO media(title,tmdb_rating) VALUES($1,9) RETURNING title_id',[title])).rows[0].title_id;
    await pool.query("INSERT INTO movie(title_id,release_date,runtime) VALUES($1,'2015-01-01',100)",[id]);ids.push(id);
  }
  await request(`/api/account/watchlist/${ids[0]}`,{method:'PUT',cookie:userCookie});
  await request(`/api/account/watchlist/${ids[1]}`,{method:'PUT',cookie:otherCookie});
  const url='/api/account/watchlist/search?q=Private%20filter&rating_min=8&year_from=2010&runtime_max=120&sort=title_asc';
  assert.equal((await request(url)).status,401);
  const result=await request(url+'&user_id=999',{cookie:userCookie});
  assert.equal(result.status,200);assert.equal(result.body.total,1);assert.equal(result.body.items[0].title_id,ids[0]);
  assert.equal((await request(url,{cookie:otherCookie})).body.items[0].title_id,ids[1]);
  assert.equal((await request('/api/account/watchlist/search?rating_min=11',{cookie:userCookie})).status,400);
  await request('/api/account/logout',{method:'POST',cookie:userCookie});
  assert.equal((await request(url,{cookie:userCookie})).status,401);
});

