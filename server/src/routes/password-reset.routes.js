const router = require('express').Router();
const { randomInt, randomBytes, scrypt: derive, timingSafeEqual } = require('node:crypto');
const scrypt = require('node:util').promisify(derive);
const pool = require('../config/db');
const mail = require('../services/mail.service');
const validEmail = value => typeof value === 'string' && value.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const generic = { message: 'If an account exists for this email, a reset code has been sent. Check your inbox and spam folder.' };

router.post('/forgot-password', async (req, res) => {
  if (!validEmail(req.body?.email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!mail.configured()) return res.status(503).json({ error: 'Password-reset email is not configured yet. Please contact the administrator.' });
  const email = req.body.email.trim().toLowerCase();
  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  const salt = randomBytes(16).toString('hex');
  const hash = `${salt}:${(await scrypt(code, salt, 64)).toString('hex')}`;
  try {
    await pool.withTransaction(async client => {
      const { rows: [user] } = await client.query('SELECT user_id FROM users WHERE email=$1 FOR UPDATE', [email]);
      if (!user) return;
      const recent = await client.query("SELECT 1 FROM password_reset WHERE user_id=$1 AND sent_at>now()-interval '60 seconds'", [user.user_id]);
      if (recent.rowCount) return;
      await client.query(`INSERT INTO password_reset(user_id,code_hash,expires_at) VALUES($1,$2,now()+interval '10 minutes')
        ON CONFLICT(user_id) DO UPDATE SET code_hash=EXCLUDED.code_hash,expires_at=EXCLUDED.expires_at,attempts=0,sent_at=now()`, [user.user_id, hash]);
      // Delivery failure rolls back the new challenge rather than leaving an unusable code.
      await mail.sendResetCode(email, code);
    });
    res.json(generic);
  } catch {
    res.status(503).json({ error: 'Could not send the reset email. Please try again later.' });
  }
});

router.post('/reset-password', async (req, res) => {
  const { email, code, password } = req.body || {};
  if (!validEmail(email) || typeof code !== 'string' || !/^\d{6}$/.test(code) ||
      typeof password !== 'string' || !password.trim() || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'Enter your email, six-digit code, and a password of 8–128 characters.' });
  }
  const changed = await pool.withTransaction(async client => {
    const { rows: [user] } = await client.query('SELECT user_id FROM users WHERE email=$1 FOR UPDATE', [email.trim().toLowerCase()]);
    if (!user) return false;
    const { rows: [reset] } = await client.query('SELECT *,expires_at>now() AS valid FROM password_reset WHERE user_id=$1 FOR UPDATE', [user.user_id]);
    if (!reset || !reset.valid || reset.attempts >= 5) return false;
    const [salt, stored] = reset.code_hash.split(':');
    const actual = await scrypt(code, salt, 64);
    const expected = Buffer.from(stored, 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      // Commit failed-attempt counters so retries cannot undo the limit.
      await client.query('UPDATE password_reset SET attempts=attempts+1 WHERE user_id=$1', [user.user_id]);
      return false;
    }
    const nextSalt = randomBytes(16).toString('hex');
    const key = await scrypt(password, nextSalt, 64);
    await client.query('UPDATE users SET password_hash=$1 WHERE user_id=$2', [`scrypt:${nextSalt}:${key.toString('hex')}`, user.user_id]);
    await client.query('DELETE FROM user_session WHERE user_id=$1', [user.user_id]);
    await client.query('DELETE FROM password_reset WHERE user_id=$1', [user.user_id]);
    return true;
  });
  if (!changed) return res.status(400).json({ error: 'The code is invalid, expired, or has too many failed attempts. Request a new code.' });
  res.json({ message: 'Password updated. Sign in with your new password.' });
});
module.exports = router;
