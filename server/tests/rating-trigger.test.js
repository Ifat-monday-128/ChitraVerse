const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
require('../src/config/env');
const { Pool } = require('pg');
const pool = new Pool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });

test('rating trigger records real changes atomically and tolerates reinstallation and parent deletion', async () => {
  const client = await pool.connect();
  const schema = `rating_trigger_${process.pid}_${Date.now()}`;
  try {
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET LOCAL search_path TO ${schema},public`);
    await client.query(await fs.readFile(path.resolve(__dirname, '../database/schema.sql'), 'utf8'));
    const migration = await fs.readFile(path.resolve(__dirname, '../database/migrations/004_rating_activity.sql'), 'utf8');
    await client.query(migration);
    await client.query("INSERT INTO users(name,email,password_hash) VALUES('Test','trigger@example.invalid','unused-test-hash')");
    await client.query("INSERT INTO media(title) VALUES('Trigger film')");
    const events = async () => (await client.query('SELECT * FROM activity_log ORDER BY activity_id')).rows;
    await client.query('INSERT INTO review(user_id,title_id,rating) VALUES(1,1,NULL)');
    assert.equal((await events()).length, 0);
    await client.query('UPDATE review SET rating=8');
    await client.query('UPDATE review SET rating=8,content=\'Changed text\'');
    assert.equal((await events()).length, 1);
    await client.query('UPDATE review SET rating=9');
    await client.query('UPDATE review SET rating=NULL');
    await client.query('DELETE FROM review');
    assert.deepEqual((await events()).map(e => [e.action,e.old_rating,e.new_rating]), [
      ['rating_added',null,'8.0'], ['rating_changed','8.0','9.0'], ['rating_removed','9.0',null],
    ]);
    await client.query(migration);
    assert.equal((await events()).length, 3);
    await client.query('SAVEPOINT aborted_rating');
    await client.query('INSERT INTO review(user_id,title_id,rating) VALUES(1,1,5)');
    await client.query('ROLLBACK TO SAVEPOINT aborted_rating');
    assert.equal((await events()).length, 3);
    await client.query('INSERT INTO review(user_id,title_id,rating) VALUES(1,1,6)');
    await client.query('DELETE FROM review');
    assert.equal((await events()).at(-1).action, 'rating_removed');
    await client.query('INSERT INTO review(user_id,title_id,rating) VALUES(1,1,7)');
    const count = (await events()).length;
    await client.query('DELETE FROM media WHERE title_id=1');
    const retained = await events();
    assert.equal(retained.length, count);
    assert.ok(retained.every(e => e.title_id === null && e.title === 'Trigger film'));
    await client.query("INSERT INTO media(title) VALUES('Another film')");
    await client.query('INSERT INTO review(user_id,title_id,rating) VALUES(1,2,8)');
    await client.query('DELETE FROM users WHERE user_id=1');
    assert.equal((await events()).length, 0);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
