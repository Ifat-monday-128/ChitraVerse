const queries = require('../queries/profile.queries');
const express = require('express');
const { randomBytes, scrypt: derive, timingSafeEqual, createHash } = require('node:crypto');
const { promisify } = require('node:util');
const pool = require('../config/db');
const scrypt = promisify(derive);
const router = express.Router();

router.get('/profile', async (req, res) => {
  const id = req.user.user_id;
  const [profile, counts, favorites, lists] = await Promise.all([
    pool.query(queries.getProfile, [id]),
    pool.query(queries.overviewCounts, [id]),
    pool.query(queries.recentRatings, [id]),
    pool.query(queries.watchlistSummary, [id]),
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
  const { rows } = await pool.write(queries.updateProfile, [name.trim(), avatar !== undefined, avatar ?? null, req.user.user_id]);
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
    await client.query(queries.begin);
    const { rows } = await client.query(queries.lockPassword, [req.user.user_id]);
    const [format, salt, stored] = rows[0].password_hash.split(':');
    const key = await scrypt(current_password, salt, 64);
    const expected = Buffer.from(stored || '', 'hex');
    if (format !== 'scrypt' || expected.length !== key.length || !timingSafeEqual(expected, key)) {
      await client.query(queries.rollback);
      return res.status(400).json({ error: 'Your current password is incorrect.' });
    }
    const nextSalt = randomBytes(16).toString('hex');
    const nextKey = await scrypt(new_password, nextSalt, 64);
    await client.query(queries.changePassword, [`scrypt:${nextSalt}:${nextKey.toString('hex')}`, req.user.user_id]);
    const token = (req.headers.cookie || '').split(';').map(p => p.trim()).find(p => p.startsWith('chitraverse_session='))?.slice('chitraverse_session='.length) || '';
    await client.query(queries.revokeOtherSessions, [req.user.user_id, createHash('sha256').update(token).digest('hex')]);
    await client.query(queries.deletePasswordReset, [req.user.user_id]);
    await client.query(queries.commit);
    res.json({ updated: true });
  } catch (error) { await client.query(queries.rollback); throw error; }
  finally { client.release(); }
});

router.get('/activity', async (req, res) => {
  const offset = Number(req.query.offset || 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) return res.status(400).json({ error: 'Invalid pagination.' });
  const { rows } = await pool.query(queries.activityHistory, [req.user.user_id, offset]);
  res.json({ items: rows.slice(0, 20), hasMore: rows.length > 20 });
});

module.exports = router;
