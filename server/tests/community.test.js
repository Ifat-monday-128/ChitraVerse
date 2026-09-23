const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile, spawn } = require("node:child_process");
const { promisify } = require("node:util");
const { randomBytes, scryptSync, createHash } = require("node:crypto");
require("../src/config/env");
const { Pool } = require("pg");

// All fixture accounts live in a disposable schema, never in the real users table.
const schema = `chitraverse_community_${process.pid}_${Date.now()}`;
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
  await pool.query(await fs.readFile(path.resolve(__dirname, "../database/migrations/003_community_comments.sql"), "utf8"));
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

test('comments allow repeated posts on movies and series, preserve ratings and revoke writes on logout', async () => {
  const login = await request('/api/account/login', { body: { email: 'user@example.invalid', password } });
  const cookie = login.cookie;
  for (const type of ['movie','series']) {
    const id = (await pool.query('INSERT INTO media(title) VALUES($1) RETURNING title_id', [type])).rows[0].title_id;
    await pool.query(`INSERT INTO ${type}(title_id) VALUES($1)`, [id]);
    assert.equal((await request('/api/account/comments', {body:{title_id:id,content:'Guest'}})).status,401);
    for (const content of ['First thought','Another thought']) {
      const result = await request('/api/account/comments', {cookie,body:{title_id:id,content,user_id:2}});
      assert.equal(result.status,201); assert.equal(result.body.comment.user_id,login.body.user.user_id);
    }
    const comments = await request(`/api/media/${id}/comments`);
    assert.equal(comments.body.comments.length,2);
    assert.equal((await request(`/api/account/ratings/${id}`,{cookie,method:'PUT',body:{rating:8}})).status,200);
    assert.equal((await request(`/api/media/${id}/comments`)).body.comments.length,2);
    assert.equal((await pool.query('SELECT chitraverse_vote_count FROM media_rating_summary WHERE title_id=$1',[id])).rows[0].chitraverse_vote_count,1);
    for (const content of ['', '  ', 5, 'x'.repeat(2001)]) assert.equal((await request('/api/account/comments',{cookie,body:{title_id:id,content}})).status,400);
  }
  await request('/api/account/logout',{cookie,method:'POST'});
  assert.equal((await request('/api/account/comments',{cookie,body:{title_id:1,content:'Revoked'}})).status,401);
});

test('community persists real tags, validates references and identifies authors from the session', async () => {
  const cookie = (await request('/api/account/login',{body:{email:'user@example.invalid',password}})).cookie;
  const media_id = (await pool.query("INSERT INTO media(title) VALUES('Tagged movie') RETURNING title_id")).rows[0].title_id;
  const cast_crew_id = (await pool.query("INSERT INTO cast_crew(name) VALUES('Tagged person') RETURNING cast_crew_id")).rows[0].cast_crew_id;
  const genre_id = (await pool.query("INSERT INTO genre(name) VALUES('Drama') RETURNING genre_id")).rows[0].genre_id;
  const body={title:'A cinema story',content:'A longer blog with\nmultiple paragraphs.',media_id,cast_crew_id,genre_id,user_id:2};
  assert.equal((await request('/api/account/community',{body})).status,401);
  assert.equal((await request('/api/account/community',{cookie,body})).status,201);
  const result=await request('/api/account/community',{cookie});
  const publicFeed = await request('/api/media/community');
  assert.equal(publicFeed.status, 200);
  assert.equal(publicFeed.body.posts[0].title, body.title);
  assert.equal(publicFeed.body.posts[0].name, 'user');
  assert.equal(publicFeed.body.posts[0].email, undefined);
  assert.equal(publicFeed.body.posts[0].password_hash, undefined);
  assert.equal((await request('/api/media/community?offset=-1')).status, 400);
  assert.equal((await request('/api/media/community?offset=100')).body.posts.length, 0);
  assert.equal(result.body.posts[0].name,'user');assert.equal(result.body.posts[0].media_title,'Tagged movie');assert.equal(result.body.posts[0].cast_name,'Tagged person');assert.equal(result.body.posts[0].genre_name,'Drama');
  for (const changes of [{title:''},{content:' '},{media_id:'1'},{genre_id:-1},{cast_crew_id:2147483647}]) assert.equal((await request('/api/account/community',{cookie,body:{...body,...changes}})).status,400);
  assert.equal((await request('/api/account/community',{cookie,body:{title:'No tags',content:'Also supported'}})).status,201);
  await request('/api/account/logout',{cookie,method:'POST'});
  assert.equal((await request('/api/account/community',{cookie,body})).status,401);
});

test('server bootstraps missing database migrations before comment requests', async () => {
  const schema = `chitraverse_bootstrap_${process.pid}_${Date.now()}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  await pool.query(`SET search_path TO ${schema},public`);
  await pool.query(await fs.readFile(path.resolve(__dirname, '../database/schema.sql'), 'utf8'));
  const salt = randomBytes(16).toString('hex');
  const hash = `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
  await pool.query("INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4)", ['bootstrap-user', 'bootstrap@example.invalid', hash, 'user']);
  const mediaId = (await pool.query("INSERT INTO media(title) VALUES('Fresh title') RETURNING title_id")).rows[0].title_id;
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: '6111', PGOPTIONS: `-c search_path=${schema},public` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });

  const started = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 20000);
    child.once('exit', (code) => reject(new Error(`server exited early with code ${code}\n${output}`)));
    const check = setInterval(() => {
      if (output.includes('ChitraVerse API running at http://localhost:6111')) {
        clearInterval(check);
        clearTimeout(timer);
        resolve();
      }
    }, 100);
  });

  try {
    const login = await fetch('http://127.0.0.1:6111/api/account/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'bootstrap@example.invalid', password }),
    });
    const loginBody = await login.json();
    assert.equal(login.status, 200, `login failed: ${JSON.stringify(loginBody)}`);
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    const comment = await fetch(`http://127.0.0.1:6111/api/account/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify({ title_id: mediaId, content: 'Bootstrapped comment' }),
    });
    const commentBody = await comment.json();
    assert.equal(comment.status, 201, `comment failed: ${JSON.stringify(commentBody)}`);
    assert.equal(commentBody.comment.content, 'Bootstrapped comment');
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  }
});

