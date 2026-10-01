const queries = require('../queries/account.queries');
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

function suspended(user) { return user?.suspension_reason && (!user.suspended_until || new Date(user.suspended_until) > new Date()); }
function suspensionError(user, res) { return res.status(403).json({ error: `Account suspended: ${user.suspension_reason}${user.suspended_until ? ` (until ${new Date(user.suspended_until).toISOString()})` : ''}. You can sign out.`, suspended: true }); }
function publicUser(user) {
  return { user_id: user.user_id, name: user.name, email: user.email, role: user.role, avatar: user.avatar || null };
}

async function currentUser(req) {
  const token = sessionToken(req);
  if (!token) return null;
  const claims = verifyJwt(token);
  if (!claims) return null;
  const userId = Number(claims.sub);
  if (!Number.isSafeInteger(userId) || userId < 1 || userId > 2147483647) return null;
  const { rows } = await pool.query(queries.findSessionUser, [hashToken(token), userId]);
  return rows[0] || null;
}

async function createSession(req, res, user, registerUser) {
  let token;
  const previousToken = sessionToken(req);
  const client = await pool.connect();
  try {
    await client.query(queries.begin);
    if (registerUser) user = await registerUser(client);
    else {
      // Serialize login with authenticated password changes.
      const locked = await client.query(queries.lockPassword, [user.user_id]);
      if (locked.rows[0]?.password_hash !== user.password_hash) {
        await client.query(queries.rollback);
        return res.status(401).json({ error: 'Your password changed. Sign in again.' });
      }
    }
    const issued = createJwt(user.user_id); token = issued.token;
    const expiresAt = issued.expiresAt;
    // Replace this browser's old session when signing in to another account.
    await client.query(queries.deleteExpiredOrPreviousSession, [previousToken ? hashToken(previousToken) : null]);
    await client.query(queries.createSession, [hashToken(token), user.user_id, expiresAt]);
    await client.query(queries.commit);
  } catch (error) {
    await client.query(queries.rollback);
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
  const { rows } = await pool.query(queries.getAvatar, [user.user_id]);
  return res.json({ user: { ...user, suspended: Boolean(suspended(user)), avatar: rows[0]?.avatar || null } });
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
    return await createSession(req, res, null, async client => {
      const { rows } = await client.query(queries.registerUser,
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
  const { rows } = await pool.query(queries.findByEmail, [email.trim().toLowerCase()]);
  const user = rows[0];
  const [format, salt, stored] = (user?.password_hash || "").split(":");
  // Perform a password derivation even for an unknown account.
  const key = await scrypt(password, salt || "missing-account", 64);
  const expected = Buffer.from(stored || "", "hex");
  if (!user || format !== "scrypt" || expected.length !== key.length || !timingSafeEqual(key, expected)) {
    return res.status(401).json({ error: "Email or password is incorrect." });
  }
  if (suspended(user)) return suspensionError(user, res);
  // The role comes from this database row; any role in req.body is ignored.
  return createSession(req, res, user);
});
router.post("/logout", async (req, res) => {
  const token = sessionToken(req);
  if (token) await pool.write(queries.revokeSession, [hashToken(token)]);
  res.clearCookie(cookieName, cookieOptions());
  res.json({ user: null });
});

router.use(async (req, res, next) => {
  req.user = await currentUser(req);
  if (!req.user) return res.status(401).json({ error: "Sign in to continue." });
  if (suspended(req.user)) return suspensionError(req.user, res);
  next();
});
router.use(require('./community.routes').account);
router.put('/password', throttle);
router.use(require('./profile.routes'));
router.use(require('./admin-dashboard.routes'));
router.use(require('./tmdb-import.routes'));
router.use(require('./admin-management.routes'));
router.get("/admin/users", async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin access required." });
  const { rows } = await pool.query(queries.listUsersWithActivity);
  res.json({ users: rows });
});
router.get("/admin/online", async (req, res) => {
  if (req.user.role !== "admin" && req.user.role !== "moderator") return res.status(403).json({ error: "Elevated access required." });
  const { rows } = await pool.query(queries.listOnlineUsers);
  res.json({ users: rows });
});
router.get('/admin/homepage', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  const { rows } = await pool.query(queries.listFeaturedTitles);
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
    await client.query(queries.begin);
    await client.query(queries.lockHomepageFeature);
    const valid = await client.query(queries.validateFeaturedTitles, [ids]);
    if (valid.rowCount !== ids.length) { await client.query(queries.rollback); return res.status(400).json({ error: 'One or more selected titles no longer exist.' }); }
    await client.query(queries.deleteHomepageFeature);
    await client.query(queries.insertHomepageFeature, [ids]);
    await client.query(queries.commit); res.json({ saved: true });
  } catch (error) { await client.query(queries.rollback); throw error; }
  finally { client.release(); }
});
router.get("/ratings/:titleId", async (req, res) => {
  if (req.user.role !== "user") return res.status(403).json({ error: "Only users can rate titles." });
  const titleId = Number(req.params.titleId);
  if (!Number.isSafeInteger(titleId) || titleId < 1) return res.status(400).json({ error: "Invalid title ID" });
  const { rows } = await pool.query(queries.getUserRating, [req.user.user_id,titleId]);
  res.json({ rating: rows[0]?.rating ?? null });
});
router.post('/comments', async (req, res, next) => {
  try {
    const titleId = Number(req.body?.title_id), content = req.body?.content;
    if (!Number.isInteger(titleId) || titleId < 1 || titleId > 2147483647 || typeof content !== 'string' || !content.trim() || content.length > 2000) return res.status(400).json({ error: 'Enter a comment up to 2,000 characters.' });
    const exists = await pool.query(queries.titleExists, [titleId]);
    if (!exists.rowCount) return res.status(404).json({ error: 'Media not found.' });
    const { rows } = await pool.write(queries.insertMediaComment, [req.user.user_id,titleId,content.trim()]);
    res.status(201).json({ comment: { ...rows[0], user_id: req.user.user_id, name: req.user.name } });
  } catch (e) { next(e); }
});
router.get('/community', async (req, res, next) => {
  const offset = Number(req.query.offset || 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) return res.status(400).json({ error: 'Invalid pagination.' });
  try { const { rows } = await pool.query(queries.listCommunityPosts, [offset]); res.json({ posts: rows.slice(0,20), hasMore: rows.length > 20 }); } catch (e) { next(e); }
});
router.post('/community', async (req, res, next) => {
  try {
    const { title, content, media_id, cast_crew_id, genre_id } = req.body || {};
    if (typeof title !== 'string' || !title.trim() || title.length > 200 || typeof content !== 'string' || !content.trim() || content.length > 10000) return res.status(400).json({ error: 'Add a title and post content.' });
    for (const id of [media_id, cast_crew_id, genre_id]) if (id != null && (!Number.isInteger(id) || id < 1 || id > 2147483647)) return res.status(400).json({ error: 'Choose valid tags from the search results.' });
    const { rows } = await pool.write(queries.insertCommunityPost, [req.user.user_id,title.trim(),content.trim(),media_id||null,cast_crew_id||null,genre_id||null]);
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
    await client.query(queries.begin);
    // Serialize this user's rating writes without altering the existing review schema.
    await client.query(queries.lockUserRatings, [req.user.user_id]);
    if (!(await client.query(queries.lockRateableTitle, [titleId])).rowCount) {
      await client.query(queries.rollback); return res.status(404).json({ error: "Title not found." });
    }
    const existing = await client.query(queries.findExistingReviews, [req.user.user_id,titleId]);
    if (existing.rowCount) {
      // Preserve any existing review text; only the latest review contributes a vote.
      await client.query(queries.clearDuplicateRatings, [req.user.user_id,titleId,existing.rows[0].review_id]);
      await client.query(queries.updateRating, [rating,existing.rows[0].review_id]);
    } else await client.query(queries.insertRating, [req.user.user_id,titleId,rating]);
    const summary = await client.query(queries.getRatingSummary, [titleId]);
    await client.query(queries.commit);
    res.json({ rating, ...summary.rows[0] });
  } catch (error) { await client.query(queries.rollback); throw error; }
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
  const { rows } = await pool.query(queries.listLegacyWatchlist, [req.user.user_id]);
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
  if (suspended(req.user)) return suspensionError(req.user, res);
  res.set('Cache-Control','no-store');
  next();
};
