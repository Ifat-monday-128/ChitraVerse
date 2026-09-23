const express = require('express');
const { randomBytes, scrypt: derive, timingSafeEqual, createHash } = require('node:crypto');
const { promisify } = require('node:util');
const pool = require('../config/db');
const scrypt = promisify(derive);
const router = express.Router();

router.get('/profile', async (req, res) => {
  const id = req.user.user_id;
  const [profile, counts, favorites, lists] = await Promise.all([
    pool.query('SELECT user_id,name,email,role,avatar,created_at FROM users WHERE user_id=$1', [id]),
    pool.query(`SELECT
      (SELECT COUNT(DISTINCT title_id)::int FROM favourite WHERE user_id=$1) AS favorites,
      (SELECT COUNT(*)::int FROM watchlist WHERE user_id=$1) AS playlists,
      (SELECT COUNT(DISTINCT title_id)::int FROM review WHERE user_id=$1 AND rating IS NOT NULL) AS ratings,
      (SELECT COUNT(*)::int FROM community_post WHERE user_id=$1) AS stories`, [id]),
    pool.query(`SELECT m.title_id,m.title,m.poster,m.tmdb_rating,
      CASE WHEN EXISTS(SELECT 1 FROM movie WHERE title_id=m.title_id) THEN 'movie' ELSE 'series' END AS media_type
      FROM media m JOIN (SELECT title_id,MAX(added_at) AS saved_at FROM favourite WHERE user_id=$1 GROUP BY title_id) f USING(title_id)
      ORDER BY f.saved_at DESC,m.title_id DESC LIMIT 8`, [id]),
    pool.query(`SELECT w.watchlist_id,w.name,COUNT(wi.title_id)::int AS title_count
      FROM watchlist w LEFT JOIN watchlist_item wi USING(watchlist_id) WHERE w.user_id=$1
      GROUP BY w.watchlist_id ORDER BY w.created_at DESC,w.watchlist_id DESC LIMIT 6`, [id]),
  ]);
  res.json({ user: profile.rows[0], counts: counts.rows[0], favorites: favorites.rows, playlists: lists.rows });
});

router.patch('/profile', async (req, res) => {
  const { name, avatar } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || name.length > 255) return res.status(400).json({ error: 'Enter a name of 1–255 characters.' });
  if (avatar !== undefined && avatar !== null) {
    if (typeof avatar !== 'string' || avatar.length > 61440 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar)) {
      return res.status(400).json({ error: 'Choose a JPEG profile photo smaller than 45 KB after resizing.' });
    }
    const bytes = Buffer.from(avatar.split(',')[1], 'base64');
    if (bytes.length > 46080 || bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255 || bytes[bytes.length - 2] !== 255 || bytes[bytes.length - 1] !== 217) {
      return res.status(400).json({ error: 'The profile photo is not a valid JPEG.' });
    }
  }
  const { rows } = await pool.query(`UPDATE users SET name=$1,avatar=CASE WHEN $2 THEN $3 ELSE avatar END
    WHERE user_id=$4 RETURNING user_id,name,email,role,avatar,created_at`, [name.trim(), avatar !== undefined, avatar ?? null, req.user.user_id]);
  res.json({ user: rows[0] });
});

router.put('/password', async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (typeof current_password !== 'string' || !current_password || current_password.length > 128 ||
      typeof new_password !== 'string' || !new_password.trim() || new_password.length < 8 || new_password.length > 128) {
    return res.status(400).json({ error: 'Enter your current password and a new password of 8–128 characters.' });
  }
  if (current_password === new_password) return res.status(400).json({ error: 'Choose a password different from your current password.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT password_hash FROM users WHERE user_id=$1 FOR UPDATE', [req.user.user_id]);
    const [format, salt, stored] = rows[0].password_hash.split(':');
    const key = await scrypt(current_password, salt, 64);
    const expected = Buffer.from(stored || '', 'hex');
    if (format !== 'scrypt' || expected.length !== key.length || !timingSafeEqual(expected, key)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Your current password is incorrect.' });
    }
    const nextSalt = randomBytes(16).toString('hex');
    const nextKey = await scrypt(new_password, nextSalt, 64);
    await client.query('UPDATE users SET password_hash=$1 WHERE user_id=$2', [`scrypt:${nextSalt}:${nextKey.toString('hex')}`, req.user.user_id]);
    const token = (req.headers.cookie || '').split(';').map(p => p.trim()).find(p => p.startsWith('chitraverse_session='))?.slice('chitraverse_session='.length) || '';
    await client.query('DELETE FROM user_session WHERE user_id=$1 AND token_hash<>$2', [req.user.user_id, createHash('sha256').update(token).digest('hex')]);
    await client.query('COMMIT');
    res.json({ updated: true });
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
});

router.get('/activity', async (req, res) => {
  const offset = Number(req.query.offset || 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) return res.status(400).json({ error: 'Invalid pagination.' });
  const { rows } = await pool.query(`SELECT * FROM (
    SELECT 'rating' AS kind,r.review_id::text AS id,m.title,r.title_id,r.rating::text AS detail,r.created_at AS occurred_at
      FROM review r JOIN media m USING(title_id) WHERE r.user_id=$1 AND r.rating IS NOT NULL
    UNION ALL SELECT 'favorite',f.favourite_id::text,m.title,f.title_id,NULL,f.added_at FROM favourite f JOIN media m USING(title_id) WHERE f.user_id=$1
    UNION ALL SELECT 'playlist',w.watchlist_id::text||':'||wi.title_id,m.title,wi.title_id,w.name,wi.added_at
      FROM watchlist w JOIN watchlist_item wi USING(watchlist_id) JOIN media m USING(title_id) WHERE w.user_id=$1
    UNION ALL SELECT 'comment',c.comment_id::text,m.title,c.title_id,LEFT(c.content,160),c.created_at
      FROM media_comment c JOIN media m USING(title_id) WHERE c.user_id=$1
    UNION ALL SELECT 'story',p.post_id::text,p.title,NULL,NULL,p.created_at FROM community_post p WHERE p.user_id=$1
  ) activity ORDER BY occurred_at DESC NULLS LAST,kind,id LIMIT 21 OFFSET $2`, [req.user.user_id, offset]);
  res.json({ items: rows.slice(0, 20), hasMore: rows.length > 20 });
});

module.exports = router;
