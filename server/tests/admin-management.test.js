const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { scryptSync } = require('node:crypto');
require('../src/config/env');
const { Pool } = require('pg');
const schema = `chitraverse_management_${process.pid}_${Date.now()}`;
const admin = new Pool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, options: '' });
process.env.PGOPTIONS = `-c search_path=${schema},public`;
const pool = require('../src/config/db');
const app = require('../src/app');
const password = 'Profile test password 123';
let server, base;
test.before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  for (const file of ['schema.sql', 'migrations/001_search_and_sessions.sql', 'migrations/003_community_comments.sql']) await pool.query(await fs.readFile(path.resolve(__dirname, '../database', file), 'utf8'));
  for (const name of ['first', 'second', 'admin']) await pool.query('INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4)', [name, `${name}@example.invalid`, `scrypt:profile-salt:${scryptSync(password, 'profile-salt', 64).toString('hex')}`, name === 'admin' ? 'admin' : 'user']);
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end();
});
async function request(route, cookie, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(base + '/api/account' + route, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
const login = async (name, secret = password) => request('/login', null, { email: `${name}@example.invalid`, password: secret });

test('catalog administration validates metadata, preserves scores, and requires confirmed deletion', async () => {
  const adminCookie = (await login('admin')).cookie, viewer = (await login('second')).cookie;
  const film = { title: 'Admin catalog fixture', media_type: 'movie', description: 'Verified synopsis', release_date: '2026-09-23', runtime: 120 };
  assert.equal((await request('/admin/catalog')).status, 401);
  assert.equal((await request('/admin/catalog', viewer, film)).status, 403);
  for (const invalid of [{ title: '' }, { release_date: '2026-02-30' }, { poster: 'javascript:alert(1)' }, { runtime: -2 }, { trailer_link: 'invalid' }]) {
    assert.equal((await request('/admin/catalog', adminCookie, { ...film, ...invalid })).status, 400);
  }
  const created = await request('/admin/catalog', adminCookie, film);
  assert.equal(created.status, 201);
  const id = created.data.title_id;
  assert.equal((await request('/admin/catalog?q=Admin%20catalog', adminCookie)).data.items[0].title_id, id);
  await pool.query('UPDATE media SET tmdb_rating=8.5 WHERE title_id=$1', [id]);
  assert.equal((await request(`/admin/catalog/${id}`, adminCookie, { ...film, title: 'Updated catalog fixture', tmdb_rating: 1 }, 'PUT')).status, 200);
  assert.equal((await pool.query('SELECT tmdb_rating FROM media WHERE title_id=$1', [id])).rows[0].tmdb_rating, '8.5');
  assert.equal((await request(`/admin/catalog/${id}`, adminCookie, { confirmation: film.title }, 'DELETE')).status, 409);
  assert.equal((await request(`/admin/catalog/${id}`, adminCookie, { confirmation: 'Updated catalog fixture' }, 'DELETE')).status, 200);
  assert.equal((await pool.query('SELECT 1 FROM movie WHERE title_id=$1', [id])).rowCount, 0);
  const series = await request('/admin/catalog', adminCookie, { ...film, media_type: 'series' });
  assert.equal(series.status, 201);
  assert.equal((await pool.query('SELECT 1 FROM series WHERE title_id=$1', [series.data.title_id])).rowCount, 1);
  await request(`/admin/catalog/${series.data.title_id}`, adminCookie, { confirmation: film.title }, 'DELETE');
  assert.equal((await request('/admin/catalog?offset=-1', adminCookie)).status, 400);
  assert.equal((await request('/admin/catalog/invalid', adminCookie, film, 'PUT')).status, 400);
});

test('admin access changes revoke sessions and prevent self demotion', async () => {
  const adminCookie = (await login('admin')).cookie;
  const target = (await pool.query("SELECT user_id FROM users WHERE name='second'")).rows[0].user_id;
  const self = (await request('/me', adminCookie)).data.user.user_id;
  let viewer = (await login('second')).cookie;
  assert.equal((await request('/admin/accounts', viewer)).status, 403);
  assert.equal((await request('/admin/accounts', adminCookie)).data.items.some(row => 'password_hash' in row), false);
  assert.equal((await request(`/admin/accounts/${self}`, adminCookie, { role: 'user' }, 'PATCH')).status, 400);
  assert.equal((await request(`/admin/accounts/${target}`, adminCookie, { role: 'owner' }, 'PATCH')).status, 400);
  assert.equal((await request(`/admin/accounts/${target}`, adminCookie, { role: 'moderator' }, 'PATCH')).status, 200);
  assert.equal((await request('/me', viewer)).status, 401);
  const moderator = await login('second');
  assert.equal(moderator.data.user.role, 'moderator');
  assert.equal((await request('/admin/catalog', moderator.cookie)).status, 403);
  await request(`/admin/accounts/${target}`, adminCookie, { role: 'user' }, 'PATCH');
  viewer = (await login('second')).cookie;
  assert.equal((await request(`/admin/accounts/${target}/sessions`, adminCookie, null, 'DELETE')).status, 200);
  assert.equal((await request('/me', viewer)).status, 401);
});

test('moderation lists and removes community content only for administrators', async () => {
  const adminCookie = (await login('admin')).cookie, viewer = (await login('second')).cookie;
  const id = (await pool.query("INSERT INTO community_post(user_id,title,content) SELECT user_id,'Moderation fixture','A fixture comment' FROM users WHERE name='second' RETURNING post_id")).rows[0].post_id;
  assert.equal((await request('/admin/moderation', viewer)).status, 403);
  assert.equal((await request(`/admin/moderation/story/${id}`, viewer, null, 'DELETE')).status, 403);
  assert.equal((await request('/admin/moderation?q=Moderation%20fixture', adminCookie)).data.items[0].id, id);
  assert.equal((await request(`/admin/moderation/story/${id}`, adminCookie, null, 'DELETE')).status, 200);
  assert.equal((await request(`/admin/moderation/story/${id}`, adminCookie, null, 'DELETE')).status, 404);
});

