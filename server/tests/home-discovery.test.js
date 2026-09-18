const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/config/env');
const { Pool } = require('pg');
const schema = `discovery_test_${process.pid}_${Date.now()}`;
const admin = new Pool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, options: '' });
process.env.PGOPTIONS = `-c search_path=${schema},public`;
const pool = require('../src/config/db');
let server, base;

test.before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  const fs = require('node:fs/promises');
  await pool.query(await fs.readFile(require('node:path').resolve(__dirname, '../database/schema.sql'), 'utf8'));
  assert.equal((await pool.query('SELECT current_schema() AS name')).rows[0].name, schema);
  server = require('../src/app').listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
});

test('empty discovery sections return usable arrays', async () => {
  for (const path of ['/interests', '/box-office', '/birthdays?date=2026-09-12']) {
    const response = await fetch(`${base}/api/media/home${path}`);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).items, []);
  }
});

test('box office ranks lifetime gross numerically, excludes unknowns and limits to ten', async () => {
  for (let i = 0; i < 13; i++) {
    const id = (await pool.query('INSERT INTO media(title) VALUES($1) RETURNING title_id', [`Revenue ${i}`])).rows[0].title_id;
    await pool.query('INSERT INTO movie(title_id,box_office_gross) VALUES($1,$2)', [id, i === 0 ? null : i * 1000000000]);
  }
  const response = await fetch(`${base}/api/media/home/box-office`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.territory, 'worldwide');
  assert.equal(data.period, 'lifetime');
  assert.equal(data.currency, 'USD');
  assert.equal(data.items.length, 10);
  assert.equal(data.items[0].box_office_gross, '12000000000');
  assert.equal(data.items.at(-1).box_office_gross, '3000000000');
});

test('birthdays match month/day, exclude future births, deduplicate roles and preserve leap days', async () => {
  for (const [name, birthday] of [['Today', '1980-09-12'], ['Tomorrow', '1980-09-13'], ['Future', '2030-09-12'], ['Leap', '2000-02-29'], ['Unknown', null]]) {
    await pool.query('INSERT INTO cast_crew(name,date_of_birth) VALUES($1,$2)', [name, birthday]);
  }
  const actor = (await pool.query("INSERT INTO role(role_name) VALUES('Actor') RETURNING role_id")).rows[0].role_id;
  const person = (await pool.query("SELECT cast_crew_id FROM cast_crew WHERE name='Today'")).rows[0].cast_crew_id;
  const movies = (await pool.query('SELECT title_id FROM movie LIMIT 2')).rows;
  for (const movie of movies) await pool.query('INSERT INTO media_cast_crew VALUES($1,$2,$3)', [movie.title_id, person, actor]);
  const response = await fetch(`${base}/api/media/home/birthdays?date=2026-09-12`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.date, '2026-09-12');
  assert.deepEqual(data.items.map(p => p.name), ['Today']);
  assert.deepEqual(data.items[0].roles, ['Actor']);
  assert.equal(data.items[0].date_of_birth, '1980-09-12');
  assert.equal(data.items[0].age, undefined);
  const leap = await (await fetch(`${base}/api/media/home/birthdays?date=2024-02-29`)).json();
  assert.deepEqual(leap.items.map(p => p.name), ['Leap']);
});

test('malformed and impossible birthday dates return 400', async () => {
  for (const date of ['2026-02-29', '2026-02-30', '2026-13-01', 'bad', '', '2026-09-12&date=2026-09-13']) {
    assert.equal((await fetch(`${base}/api/media/home/birthdays?date=${date}`)).status, 400);
  }
});

test('interests use populated genres, count movies and series, and choose matching artwork', async () => {
  const genres = {};
  for (const name of ['Discovery Drama', 'Discovery Mystery', 'Discovery Empty']) {
    genres[name] = (await pool.query('INSERT INTO genre(name) VALUES($1) RETURNING genre_id', [name])).rows[0].genre_id;
  }
  for (const [title, type, poster, genre] of [
    ['Genre Movie', 'movie', '/genre-movie.jpg', 'Discovery Drama'],
    ['Genre Series', 'series', '/genre-series.jpg', 'Discovery Drama'],
    ['No artwork', 'movie', null, 'Discovery Mystery'],
    ['Unclassified title', null, '/unclassified.jpg', 'Discovery Drama'],
  ]) {
    const id = (await pool.query('INSERT INTO media(title,poster,tmdb_rating) VALUES($1,$2,8) RETURNING title_id', [title, poster])).rows[0].title_id;
    if (type) await pool.query(`INSERT INTO ${type}(title_id) VALUES($1)`, [id]);
    await pool.query('INSERT INTO media_genre VALUES($1,$2)', [id, genres[genre]]);
  }
  const response = await fetch(`${base}/api/media/home/interests`);
  assert.equal(response.status, 200);
  const { items } = await response.json();
  assert.deepEqual(items.map(item => [item.name, item.title_count]), [['Discovery Drama', 2], ['Discovery Mystery', 1]]);
  assert.equal(items[0].genre_id, genres['Discovery Drama']);
  assert.deepEqual(items[0].artwork.map(art => art.poster), ['/genre-movie.jpg', '/genre-series.jpg']);
  assert.deepEqual(items[1].artwork, []);
});

test('seeded random browsing covers movies and series without pagination duplicates', async () => {
  for (const type of ['movie', 'series']) {
    for (let index = 0; index < 12; index++) {
      const id = (await pool.query("INSERT INTO media(title,language,tmdb_rating) VALUES($1,'zz',$2) RETURNING title_id", [`Shuffle ${type} ${index}`, index % 10])).rows[0].title_id;
      await pool.query(`INSERT INTO ${type}(title_id) VALUES($1)`, [id]);
    }
  }
  const seed = '0123456789abcdef0123456789abcdef';
  const read = async query => {
    const response = await fetch(`${base}/api/media/?language=zz&${query}`);
    assert.equal(response.status, 200);
    return response.json();
  };
  for (const type of ['movie', 'series']) {
    const query = `type=${type}&sort=random&seed=${seed}`;
    const full = await read(`${query}&limit=100`);
    const pages = [];
    for (const offset of [0, 5, 10]) pages.push(...(await read(`${query}&limit=5&offset=${offset}`)).items);
    const ids = items => items.map(item => item.title_id);
    assert.equal(full.total, 12);
    assert.equal(new Set(ids(pages)).size, 12);
    assert.deepEqual(ids(pages), ids(full.items));
    assert.deepEqual(ids((await read(`${query}&limit=100`)).items), ids(full.items));
    assert.notDeepEqual(ids((await read(`type=${type}&sort=random&seed=${'f'.repeat(32)}&limit=100`)).items), ids(full.items));
    const rated = await read(`type=${type}&sort=rating_desc&seed=${seed}&limit=100`);
    assert.ok(rated.items.every((item, i) => !i || Number(item.tmdb_rating) <= Number(rated.items[i - 1].tmdb_rating)));
    assert.notDeepEqual(ids(full.items), ids(rated.items));
    const filtered = await read(`${query}&rating_min=5&limit=100`);
    assert.ok(filtered.items.every(item => Number(item.tmdb_rating) >= 5));
    assert.deepEqual(ids(filtered.items), ids(full.items.filter(item => Number(item.tmdb_rating) >= 5)));
  }
  const generated = await read('type=movie&sort=random&limit=100');
  assert.match(generated.seed, /^[a-f0-9]{32}$/);
  assert.deepEqual((await read(`type=movie&sort=random&seed=${generated.seed}&limit=100`)).items, generated.items);
});

test('shuffle seeds are validated before reaching the database', async () => {
  for (const seed of ['', 'bad', 'a'.repeat(33), "'; DROP TABLE media; --"]) {
    const response = await fetch(`${base}/api/media/?sort=random&seed=${encodeURIComponent(seed)}`);
    assert.equal(response.status, 400);
  }
});
