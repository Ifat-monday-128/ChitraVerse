const express = require("express");
const { randomBytes, scrypt: scryptCallback, timingSafeEqual, createHash } = require("node:crypto");
const { promisify } = require("node:util");
const pool = require("../config/db");
const { createJwt, verifyJwt, lifetimeSeconds } = require("../utils/jwt");
const scrypt = promisify(scryptCallback);
const router = express.Router();
const cookieName = "chitraverse_session";
function cookieOptions() {
  const production = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    sameSite: production ? "none" : "lax",
    secure: production,
    ...(production ? { partitioned: true } : {}),
    path: "/",
  };
}
const hashToken = (token) => createHash("sha256").update(token).digest("hex");

// Keep cookie parsing in one place for both authentication and logout.
function sessionToken(req) {
  const token = (req.headers.cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  return token && token.length <= 4096 ? token : null;
}

function publicUser(user) {
  return { user_id: user.user_id, name: user.name, email: user.email, role: user.role, avatar: user.avatar || null };
}

async function currentUser(req) {
  const token = sessionToken(req);
  if (!token) return null;
  const claims = verifyJwt(token);
  if (!claims) return null;
  const { rows } = await pool.query(`SELECT u.user_id, u.name, u.email, u.role FROM users u
    JOIN user_session s USING(user_id)
    WHERE s.token_hash=$1 AND s.expires_at > now() AND u.user_id=$2`, [hashToken(token), Number(claims.sub)]);
  return rows[0] || null;
}

async function createSession(req, res, user, registerUser) {
  let token;
  const previousToken = sessionToken(req);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (registerUser) user = await registerUser(client);
    else {
      // Serialize login with password resets; an old password cannot create a
      // new session after a concurrent reset has already revoked existing ones.
      const locked = await client.query('SELECT password_hash FROM users WHERE user_id=$1 FOR UPDATE', [user.user_id]);
      if (locked.rows[0]?.password_hash !== user.password_hash) {
        await client.query('ROLLBACK');
        return res.status(401).json({ error: 'Your password changed. Sign in again.' });
      }
    }
    const issued = createJwt(user.user_id); token = issued.token;
    const expiresAt = issued.expiresAt;
    // Replace this browser's old session when signing in to another account.
    await client.query("DELETE FROM user_session WHERE expires_at <= now() OR token_hash=$1", [previousToken ? hashToken(previousToken) : null]);
    await client.query("INSERT INTO user_session(token_hash,user_id,expires_at) VALUES($1,$2,$3)", [hashToken(token), user.user_id, expiresAt]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  res.cookie(cookieName, token, { ...cookieOptions(), maxAge: lifetimeSeconds * 1000 });
  return res.json({ user: publicUser(user) });
}

const attempts = new Map();
function throttle(req, res, next) {
  const now = Date.now();
  for (const [key, entry] of attempts) if (entry.until < now) attempts.delete(key);
  const entry = attempts.get(req.ip) || { count: 0, until: now + 60000 };
  entry.count++;
  attempts.set(req.ip, entry);
  if (entry.count > 15) return res.status(429).json({ error: "Too many attempts. Try again in a minute." });
  next();
}

// Account and session responses must not be reused from a browser/proxy cache.
router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
router.get("/me", async (req, res) => {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: "Sign in to view your account." });
  const { rows } = await pool.query('SELECT avatar FROM users WHERE user_id=$1', [user.user_id]);
  return res.json({ user: { ...user, avatar: rows[0]?.avatar || null } });
});
router.use(['/forgot-password','/reset-password'], throttle);
router.use(require('./password-reset.routes'));
router.post("/register", throttle, async (req, res) => {
  const { name, email, password } = req.body || {};
  if (typeof name !== "string" || !name.trim() || name.length > 255 || typeof email !== "string"
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 255
    || typeof password !== "string" || !password.trim() || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: "Enter a name, a valid email and a password of 8–128 characters." });
  }
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64);
  try {
    return await createSession(req, res, null, async client => {
      const { rows } = await client.query(`INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'user') RETURNING user_id,name,email,role`,
        [name.trim(), email.trim().toLowerCase(), `scrypt:${salt}:${key.toString("hex")}`]);
      return rows[0];
    });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "An account with that email already exists. Sign in instead." });
    throw error;
  }
});
router.post("/login", throttle, async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== "string" || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    || typeof password !== "string" || !password.trim() || password.length > 128) {
    return res.status(400).json({ error: "Enter your email and password." });
  }
  const { rows } = await pool.query("SELECT user_id,name,email,password_hash,role,avatar FROM users WHERE email=$1", [email.trim().toLowerCase()]);
  const user = rows[0];
  const [format, salt, stored] = (user?.password_hash || "").split(":");
  // Perform a password derivation even for an unknown account.
  const key = await scrypt(password, salt || "missing-account", 64);
  const expected = Buffer.from(stored || "", "hex");
  if (!user || format !== "scrypt" || expected.length !== key.length || !timingSafeEqual(key, expected)) {
    return res.status(401).json({ error: "Email or password is incorrect." });
  }
  // The role comes from this database row; any role in req.body is ignored.
  return createSession(req, res, user);
});
router.post("/logout", async (req, res) => {
  const token = sessionToken(req);
  if (token) await pool.write("DELETE FROM user_session WHERE token_hash=$1", [hashToken(token)]);
  res.clearCookie(cookieName, cookieOptions());
  res.json({ user: null });
});

router.use(async (req, res, next) => {
  req.user = await currentUser(req);
  if (!req.user) return res.status(401).json({ error: "Sign in to continue." });
  next();
});
router.put('/password', throttle);
router.use(require('./profile.routes'));
router.use(require('./admin-dashboard.routes'));
router.use(require('./tmdb-import.routes'));
router.use(require('./admin-management.routes'));
router.get("/admin/users", async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin access required." });
  const { rows } = await pool.query(`SELECT u.user_id,u.name,u.email,u.role,u.created_at,
    COALESCE((SELECT json_agg(activity ORDER BY activity.occurred_at DESC) FROM (
      SELECT 'rating' AS kind,a.title,a.new_rating AS rating,a.occurred_at,a.detail
      FROM activity_log a WHERE a.user_id=u.user_id
      UNION ALL
      SELECT 'rating',m.title,r.rating,r.created_at,'Previously saved rating: ' || r.rating || '/10 (before history tracking)'
      FROM review r JOIN media m USING(title_id) WHERE r.user_id=u.user_id AND r.rating IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM activity_log a WHERE a.user_id=r.user_id AND a.title_id=r.title_id)
      UNION ALL
      SELECT 'favorite',m.title,NULL,f.added_at,'Added to favorites'
      FROM favourite f JOIN media m USING(title_id) WHERE f.user_id=u.user_id
      UNION ALL
      SELECT 'comment',m.title,NULL,c.created_at,'Commented: ' || LEFT(c.content,160)
      FROM media_comment c JOIN media m USING(title_id) WHERE c.user_id=u.user_id
      UNION ALL
      SELECT 'story',p.title,NULL,p.created_at,'Published a story'
      FROM community_post p WHERE p.user_id=u.user_id
      UNION ALL
      SELECT 'watchlist' AS kind,m.title,NULL AS rating,wi.added_at AS occurred_at,NULL AS detail
      FROM watchlist w JOIN watchlist_item wi USING(watchlist_id) JOIN media m USING(title_id)
      WHERE w.user_id=u.user_id
    ) activity), '[]'::json) AS activities
    FROM users u ORDER BY u.created_at DESC,u.user_id DESC`);
  res.json({ users: rows });
});
router.get('/admin/homepage', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  const { rows } = await pool.query(`SELECT m.title_id,m.title,m.poster,
    CASE WHEN mo.title_id IS NOT NULL THEN 'movie' ELSE 'series' END AS media_type
    FROM homepage_feature f JOIN media m USING(title_id) LEFT JOIN movie mo USING(title_id) ORDER BY f.position`);
  res.json({ items: rows });
});
router.put('/admin/homepage', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  const ids = req.body?.title_ids;
  if (!Array.isArray(ids) || ids.length > 20 || ids.some(id => !Number.isInteger(id) || id < 1 || id > 2147483647) || new Set(ids).size !== ids.length) {
    return res.status(400).json({ error: 'Choose up to 20 distinct movie or series titles.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE homepage_feature IN EXCLUSIVE MODE');
    const valid = await client.query(`SELECT m.title_id FROM media m WHERE m.title_id=ANY($1::int[])
      AND (EXISTS(SELECT 1 FROM movie WHERE title_id=m.title_id) OR EXISTS(SELECT 1 FROM series WHERE title_id=m.title_id)) FOR KEY SHARE`, [ids]);
    if (valid.rowCount !== ids.length) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'One or more selected titles no longer exist.' }); }
    await client.query('DELETE FROM homepage_feature');
    await client.query('INSERT INTO homepage_feature(title_id,position) SELECT id,ordinality-1 FROM unnest($1::int[]) WITH ORDINALITY AS entries(id,ordinality)', [ids]);
    await client.query('COMMIT'); res.json({ saved: true });
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
});
router.get("/ratings/:titleId", async (req, res) => {
  if (req.user.role !== "user") return res.status(403).json({ error: "Only users can rate titles." });
  const titleId = Number(req.params.titleId);
  if (!Number.isSafeInteger(titleId) || titleId < 1) return res.status(400).json({ error: "Invalid title ID" });
  const { rows } = await pool.query("SELECT rating FROM review WHERE user_id=$1 AND title_id=$2 ORDER BY created_at DESC,review_id DESC LIMIT 1", [req.user.user_id,titleId]);
  res.json({ rating: rows[0]?.rating ?? null });
});
router.post('/comments', async (req, res, next) => {
  try {
    const titleId = Number(req.body?.title_id), content = req.body?.content;
    if (!Number.isInteger(titleId) || titleId < 1 || titleId > 2147483647 || typeof content !== 'string' || !content.trim() || content.length > 2000) return res.status(400).json({ error: 'Enter a comment up to 2,000 characters.' });
    const exists = await pool.query('SELECT 1 FROM media WHERE title_id=$1', [titleId]);
    if (!exists.rowCount) return res.status(404).json({ error: 'Media not found.' });
    const { rows } = await pool.write(`INSERT INTO media_comment(user_id,title_id,content) VALUES($1,$2,$3)
      RETURNING comment_id,content,created_at`, [req.user.user_id,titleId,content.trim()]);
    res.status(201).json({ comment: { ...rows[0], user_id: req.user.user_id, name: req.user.name } });
  } catch (e) { next(e); }
});
router.get('/community', async (req, res, next) => {
  const offset = Number(req.query.offset || 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) return res.status(400).json({ error: 'Invalid pagination.' });
  try { const { rows } = await pool.query(`SELECT p.*,u.name, m.title AS media_title, c.name AS cast_name, g.name AS genre_name FROM community_post p JOIN users u USING(user_id) LEFT JOIN media m ON m.title_id=p.media_id LEFT JOIN cast_crew c USING(cast_crew_id) LEFT JOIN genre g USING(genre_id) ORDER BY p.created_at DESC,p.post_id DESC LIMIT 21 OFFSET $1`, [offset]); res.json({ posts: rows.slice(0,20), hasMore: rows.length > 20 }); } catch (e) { next(e); }
});
router.post('/community', async (req, res, next) => {
  try {
    const { title, content, media_id, cast_crew_id, genre_id } = req.body || {};
    if (typeof title !== 'string' || !title.trim() || title.length > 200 || typeof content !== 'string' || !content.trim() || content.length > 10000) return res.status(400).json({ error: 'Add a title and post content.' });
    for (const id of [media_id, cast_crew_id, genre_id]) if (id != null && (!Number.isInteger(id) || id < 1 || id > 2147483647)) return res.status(400).json({ error: 'Choose valid tags from the search results.' });
    const { rows } = await pool.write(`INSERT INTO community_post(user_id,title,content,media_id,cast_crew_id,genre_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [req.user.user_id,title.trim(),content.trim(),media_id||null,cast_crew_id||null,genre_id||null]);
    res.status(201).json({ post: { ...rows[0], name: req.user.name } });
  } catch (e) { if (e.code === '23503') return res.status(400).json({ error: 'A selected tag no longer exists. Choose another tag.' }); next(e); }
});
router.put("/ratings/:titleId", async (req, res) => {
  if (req.user.role !== "user") return res.status(403).json({ error: "Only users can rate titles." });
  const titleId = Number(req.params.titleId), rating = req.body?.rating;
  if (!Number.isSafeInteger(titleId) || titleId < 1 || !Number.isInteger(rating) || rating < 1 || rating > 10) {
    return res.status(400).json({ error: "Choose a whole-number rating from 1 to 10." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize this user's rating writes without altering the existing review schema.
    await client.query("SELECT pg_advisory_xact_lock($1)", [req.user.user_id]);
    if (!(await client.query("SELECT 1 FROM media m WHERE title_id=$1 AND (EXISTS(SELECT 1 FROM movie WHERE title_id=m.title_id) OR EXISTS(SELECT 1 FROM series WHERE title_id=m.title_id)) FOR KEY SHARE", [titleId])).rowCount) {
      await client.query("ROLLBACK"); return res.status(404).json({ error: "Title not found." });
    }
    const existing = await client.query("SELECT review_id FROM review WHERE user_id=$1 AND title_id=$2 ORDER BY created_at DESC,review_id DESC", [req.user.user_id,titleId]);
    if (existing.rowCount) {
      // Preserve any existing review text; only the latest review contributes a vote.
      await client.query("UPDATE review SET rating=NULL WHERE user_id=$1 AND title_id=$2 AND review_id<>$3 AND rating IS NOT NULL", [req.user.user_id,titleId,existing.rows[0].review_id]);
      await client.query("UPDATE review SET rating=$1,created_at=now() WHERE review_id=$2", [rating,existing.rows[0].review_id]);
    } else await client.query("INSERT INTO review(user_id,title_id,rating) VALUES($1,$2,$3)", [req.user.user_id,titleId,rating]);
    const summary = await client.query("SELECT * FROM get_title_rating($1)", [titleId]);
    await client.query("COMMIT");
    res.json({ rating, ...summary.rows[0] });
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
});
router.use("/watchlist", (req, res, next) => {
  if (req.user.role === "admin") return res.status(403).json({ error: "Admins cannot use watchlists." });
  next();
});
router.get('/watchlist/search', (req, res, next) => {
  req.watchlistUser = req.user.user_id;
  return require('../controllers/media.controller').browse(req, res, next);
});
router.get("/watchlist", async (req, res) => {
  const { rows } = await pool.query(`SELECT DISTINCT m.title_id, m.title, m.poster, m.tmdb_rating,
    CASE WHEN mo.title_id IS NOT NULL THEN 'movie' ELSE 'series' END AS media_type
    FROM watchlist w JOIN watchlist_item wi USING(watchlist_id) JOIN media m USING(title_id)
    LEFT JOIN movie mo USING(title_id) WHERE w.user_id=$1 ORDER BY m.title`, [req.user.user_id]);
  res.json({ items: rows });
});
// Legacy writes must never silently pick a list or remove from every list.
router.route('/watchlist/:titleId').put((req, res) => res.status(400).json({ error: 'Choose a watchlist first.' }))
  .delete((req, res) => res.status(400).json({ error: 'Choose a watchlist first.' }));
router.use(require('./library.routes'));
module.exports = router;
module.exports.requireUser = async (req, res, next) => {
  req.user = await currentUser(req);
  if (!req.user) return res.status(401).json({ error: 'Sign in to continue.' });
  res.set('Cache-Control','no-store');
  next();
};
