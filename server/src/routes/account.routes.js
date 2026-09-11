const express = require("express");
const { randomBytes, scrypt: scryptCallback, timingSafeEqual, createHash } = require("node:crypto");
const { promisify } = require("node:util");
const pool = require("../config/db");
const { createJwt, verifyJwt, lifetimeSeconds } = require("../utils/jwt");
const scrypt = promisify(scryptCallback);
const router = express.Router();
const cookieName = "chitraverse_session";
const cookieOptions = { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" };
const hashToken = (token) => createHash("sha256").update(token).digest("hex");

// Keep cookie parsing in one place for both authentication and logout.
function sessionToken(req) {
  const token = (req.headers.cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  return token && token.length <= 4096 ? token : null;
}

function publicUser(user) {
  return { user_id: user.user_id, name: user.name, email: user.email, role: user.role };
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

async function createSession(req, res, user) {
  const { token, expiresAt } = createJwt(user.user_id);
  const previousToken = sessionToken(req);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
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
  res.cookie(cookieName, token, { ...cookieOptions, maxAge: lifetimeSeconds * 1000 });
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
  return res.json({ user });
});
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
    const { rows } = await pool.query(`INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'user') RETURNING user_id,name,email,role`,
      [name.trim(), email.trim().toLowerCase(), `scrypt:${salt}:${key.toString("hex")}`]);
    return createSession(req, res, rows[0]);
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
  const { rows } = await pool.query("SELECT user_id,name,email,password_hash,role FROM users WHERE email=$1", [email.trim().toLowerCase()]);
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
  if (token) await pool.query("DELETE FROM user_session WHERE token_hash=$1", [hashToken(token)]);
  res.clearCookie(cookieName, cookieOptions);
  res.json({ user: null });
});

router.use(async (req, res, next) => {
  req.user = await currentUser(req);
  if (!req.user) return res.status(401).json({ error: "Sign in to continue." });
  next();
});
router.get("/admin/users", async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin access required." });
  const { rows } = await pool.query(`SELECT u.user_id,u.name,u.email,u.role,u.created_at,
    COALESCE((SELECT json_agg(activity ORDER BY activity.occurred_at DESC) FROM (
      SELECT 'rating' AS kind,m.title,r.rating,r.created_at AS occurred_at
      FROM review r JOIN media m USING(title_id) WHERE r.user_id=u.user_id AND r.rating IS NOT NULL
      UNION ALL
      SELECT 'watchlist' AS kind,m.title,NULL AS rating,wi.added_at AS occurred_at
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
  if (req.user.role !== "user") return res.status(403).json({ error: "Only users can rate movies." });
  const titleId = Number(req.params.titleId);
  if (!Number.isSafeInteger(titleId) || titleId < 1) return res.status(400).json({ error: "Invalid title ID" });
  const { rows } = await pool.query("SELECT rating FROM review WHERE user_id=$1 AND title_id=$2 ORDER BY created_at DESC,review_id DESC LIMIT 1", [req.user.user_id,titleId]);
  res.json({ rating: rows[0]?.rating ?? null });
});
router.put("/ratings/:titleId", async (req, res) => {
  if (req.user.role !== "user") return res.status(403).json({ error: "Only users can rate movies." });
  const titleId = Number(req.params.titleId), rating = req.body?.rating;
  if (!Number.isSafeInteger(titleId) || titleId < 1 || !Number.isInteger(rating) || rating < 1 || rating > 10) {
    return res.status(400).json({ error: "Choose a whole-number rating from 1 to 10." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize this user's rating writes without altering the existing review schema.
    await client.query("SELECT pg_advisory_xact_lock($1)", [req.user.user_id]);
    if (!(await client.query("SELECT 1 FROM movie WHERE title_id=$1", [titleId])).rowCount) {
      await client.query("ROLLBACK"); return res.status(404).json({ error: "Movie not found." });
    }
    const existing = await client.query("SELECT review_id FROM review WHERE user_id=$1 AND title_id=$2 ORDER BY created_at DESC,review_id DESC", [req.user.user_id,titleId]);
    if (existing.rowCount) {
      // Preserve any existing review text; only the latest review contributes a vote.
      await client.query("UPDATE review SET rating=NULL WHERE user_id=$1 AND title_id=$2", [req.user.user_id,titleId]);
      await client.query("UPDATE review SET rating=$1,created_at=now() WHERE review_id=$2", [rating,existing.rows[0].review_id]);
    } else await client.query("INSERT INTO review(user_id,title_id,rating) VALUES($1,$2,$3)", [req.user.user_id,titleId,rating]);
    const summary = await client.query("SELECT chitraverse_rating,chitraverse_vote_count FROM media_rating_summary WHERE title_id=$1", [titleId]);
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
router.put("/watchlist/:titleId", async (req, res) => {
  const titleId = Number(req.params.titleId);
  if (!Number.isInteger(titleId) || titleId < 1) return res.status(400).json({ error: "Invalid title ID" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize default-list creation without changing the existing watchlist schema.
    await client.query("SELECT pg_advisory_xact_lock($1)", [req.user.user_id]);
    const media = await client.query("SELECT 1 FROM media WHERE title_id=$1", [titleId]);
    if (!media.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Media not found" }); }
    let { rows } = await client.query("SELECT watchlist_id FROM watchlist WHERE user_id=$1 ORDER BY watchlist_id LIMIT 1", [req.user.user_id]);
    if (!rows.length) ({ rows } = await client.query("INSERT INTO watchlist(user_id,name) VALUES($1,'My watchlist') RETURNING watchlist_id", [req.user.user_id]));
    await client.query("INSERT INTO watchlist_item(watchlist_id,title_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [rows[0].watchlist_id, titleId]);
    await client.query("COMMIT");
    res.json({ saved: true });
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
});
router.delete("/watchlist/:titleId", async (req, res) => {
  const titleId = Number(req.params.titleId);
  if (!Number.isInteger(titleId) || titleId < 1) return res.status(400).json({ error: "Invalid title ID" });
  await pool.query(`DELETE FROM watchlist_item wi USING watchlist w
    WHERE wi.watchlist_id=w.watchlist_id AND w.user_id=$1 AND wi.title_id=$2`, [req.user.user_id, titleId]);
  res.json({ saved: false });
});
module.exports = router;
