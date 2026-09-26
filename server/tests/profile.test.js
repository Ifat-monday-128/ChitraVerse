const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { scryptSync } = require('node:crypto');
require('../src/config/env');
const { Pool } = require('pg');
const schema = `chitraverse_profile_${process.pid}_${Date.now()}`;
const admin = new Pool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, options: '' });
process.env.PGOPTIONS = `-c search_path=${schema},public`;
const pool = require('../src/config/db');
const app = require('../src/app');
const password = 'Profile test password 123';
let server, base, historyUserCookie, historyAdminCookie;
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

test('profile photo and name persist, validation rejects unsafe input, and access stays private', async () => {
  const { cookie } = await login('first');
  assert.equal((await request('/profile')).status, 401);
  assert.equal((await request('/activity')).status, 401);
  assert.equal((await request('/profile', cookie)).data.user.name, 'first');
  const avatar = 'data:image/jpeg;base64,/9j/2Q==';
  const result = await request('/profile', cookie, { name: 'New name', avatar, user_id: 2, role: 'admin' }, 'PATCH');
  assert.equal(result.status, 200); assert.equal(result.data.user.role, 'user');
  const saved = (await request('/profile', cookie)).data.user;
  assert.equal(saved.name, 'New name'); assert.equal(saved.avatar, avatar); assert.equal(saved.password_hash, undefined);
  assert.equal((await request('/me', cookie)).data.user.avatar, avatar);
  assert.equal((await request('/profile', (await login('second')).cookie)).data.user.name, 'second');
  for (const avatar of ['data:image/svg+xml;base64,PHN2Zz4=', 'https://example.com/a.jpg', 'data:image/jpeg;base64,aGVsbG8=', 'x'.repeat(62000)]) {
    assert.equal((await request('/profile', cookie, { name: 'Valid', avatar }, 'PATCH')).status, 400);
  }
  assert.equal((await request('/profile', cookie, { name: ' ' }, 'PATCH')).status, 400);
  assert.equal((await request('/profile', cookie, { name: 'New name', avatar: null }, 'PATCH')).data.user.avatar, null);
  const adminCookie = (await login('admin')).cookie;
  assert.equal((await request('/profile', adminCookie)).status, 200);
});

test('overview and paginated activity include only the authenticated account data', async () => {
  const { cookie } = await login('first');
  const otherCookie = (await login('second')).cookie;
  historyUserCookie = otherCookie;
  const id = (await pool.query("INSERT INTO media(title) VALUES('A favorite film') RETURNING title_id")).rows[0].title_id;
  await pool.query('INSERT INTO movie(title_id) VALUES($1)', [id]);
  await request(`/favorites/${id}`, cookie, null, 'PUT');
  const list = await request('/watchlists', cookie, { name: 'Friday night' });
  await request(`/watchlists/${list.data.watchlist.watchlist_id}/items/${id}`, cookie, null, 'PUT');
  await request(`/ratings/${id}`, cookie, { rating: 9 }, 'PUT');
  await request('/community', cookie, { title: 'A story', content: 'Cinema thoughts' });
  for (let i = 0; i < 21; i++) await request('/comments', cookie, { title_id: id, content: `Comment ${i}` });
  const overview = await request('/profile', cookie);
  assert.deepEqual(overview.data.counts, { favorites: 1, playlists: 1, ratings: 1, stories: 1 });
  assert.equal(overview.data.favorites[0].title, 'A favorite film');
  assert.equal(overview.data.playlists[0].name, 'Friday night');
  const first = await request('/activity', cookie);
  assert.equal(first.status, 200); assert.equal(first.data.items.length, 20); assert.equal(first.data.hasMore, true);
  const next = await request('/activity?offset=20', cookie);
  assert.equal(next.data.items.length, 5); assert.equal(next.data.hasMore, false);
  assert.equal(new Set([...first.data.items, ...next.data.items].map(i => `${i.kind}-${i.id}`)).size, 25);
  assert.equal((await request('/activity?offset=-1', cookie)).status, 400);
  assert.equal((await request('/activity?user_id=1', otherCookie)).data.items.length, 0);
  assert.equal((await request('/profile?user_id=1', otherCookie)).data.favorites.length, 0);
});

test('admin dashboard reports database totals and recent activity only to administrators', async () => {
  assert.equal((await request('/admin/dashboard')).status, 401);
  assert.equal((await request('/admin/dashboard', (await login('second')).cookie)).status, 403);
  historyAdminCookie = (await login('admin')).cookie;
  const result = await request('/admin/dashboard', historyAdminCookie);
  assert.equal(result.status, 200);
  assert.equal(result.data.totals.users, 3);
  assert.equal(result.data.totals.movies, 1);
  assert.equal(result.data.totals.stories, 1);
  assert.equal(result.data.totals.comments, 21);
  assert.equal(result.data.totals.favorites, 1);
  assert.equal(result.data.totals.playlists, 1);
  assert.equal(result.data.registrations.length, 7);
  assert.equal(result.data.registrations.reduce((sum, row) => sum + row.count, 0), 3);
  assert.equal(result.data.roles.reduce((sum, row) => sum + row.count, 0), 3);
  assert.equal(result.data.activity.length, 8);
  assert.equal(result.data.activity[0].kind, 'comment');
  assert.equal(result.data.users.length, 3);
  assert.ok(result.data.users.every(user => !('password_hash' in user)));
});

test('older saved ratings remain visible alongside other activity without duplicate trigger events', async () => {
  const cookie = historyUserCookie;
  const adminCookie = historyAdminCookie;
  const id = (await pool.query("INSERT INTO media(title) VALUES('Before tracking') RETURNING title_id")).rows[0].title_id;
  await pool.query('INSERT INTO movie(title_id) VALUES($1)', [id]);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE review DISABLE TRIGGER review_rating_activity');
    await client.query('INSERT INTO review(user_id,title_id,rating) VALUES(2,$1,7)', [id]);
    await client.query('ALTER TABLE review ENABLE TRIGGER review_rating_activity');
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
  const activities = async () => (await request('/admin/users', adminCookie)).data.users;
  const prior = (await activities()).find(u => u.user_id === 2).activities;
  assert.equal(prior.length, 1);
  assert.match(prior[0].detail, /Previously saved rating/);
  assert.match((await request('/activity', cookie)).data.items[0].detail, /Previously saved rating/);
  const firstUser = (await activities()).find(u => u.user_id === 1);
  for (const kind of ['favorite','comment','story','watchlist','rating']) assert.ok(firstUser.activities.some(a => a.kind === kind));
  await request(`/ratings/${id}`, cookie, { rating: 9 }, 'PUT');
  const after = (await activities()).find(u => u.user_id === 2).activities;
  assert.equal(after.length, 1);
  assert.match(after[0].detail, /Changed rating from 7.0 to 9.0/);
  assert.equal((await request('/activity', cookie)).data.items.length, 1);
});

test('changing password verifies the old secret, hashes the new one and revokes other sessions', async () => {
  const { cookie } = await login('first');
  const secondSession = (await login('first')).cookie;
  const newPassword = 'My updated password 456';
  assert.equal((await request('/password', cookie, { current_password: 'wrong', new_password: newPassword }, 'PUT')).status, 400);
  assert.equal((await request('/password', cookie, { current_password: password, new_password: 'short' }, 'PUT')).status, 400);
  assert.equal((await request('/password', cookie, { current_password: password, new_password: newPassword }, 'PUT')).status, 200);
  assert.equal((await request('/me', cookie)).status, 200);
  assert.equal((await request('/me', secondSession)).status, 401);
  assert.equal((await login('first')).status, 401);
  const next = await login('first', newPassword); assert.equal(next.status, 200);
  const hash = (await pool.query('SELECT password_hash FROM users WHERE user_id=1')).rows[0].password_hash;
  assert.match(hash, /^scrypt:/); assert.notEqual(hash, newPassword);
  await request('/logout', next.cookie, null, 'POST');
  assert.equal((await request('/profile', next.cookie)).status, 401);
});
