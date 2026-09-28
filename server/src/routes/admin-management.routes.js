const queries = require('./admin-management.queries');
const router = require('express').Router();
const pool = require('../config/db');
const structured = require('../services/catalog-metadata.service');
const { youtubeId } = require('../utils/trailer');

router.use('/admin', (req, res, next) => req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admin access required.' }));
const validId = value => /^[1-9]\d*$/.test(String(value)) && Number(value) <= 2147483647;
router.param('id', (req, res, next, id) => validId(id) ? next() : res.status(400).json({ error: 'Invalid record ID.' }));
function page(req, res) {
  const offset = Number(req.query.offset || 0), q = req.query.q || '';
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000 || typeof q !== 'string' || q.length > 120) {
    res.status(400).json({ error: 'Invalid search or pagination.' }); return null;
  }
  return [q, offset];
}
router.get('/admin/catalog', async (req, res) => {
  const args = page(req, res); if (!args) return;
  const { rows } = await pool.query(queries.selectTitleIdMedia, args);
  res.json({ items: rows.slice(0, 20), hasMore: rows.length > 20 });
});
function metadata(body) {
  let { title, description = '', language = '', poster = '', trailer_link = '', release_date = '', runtime = null } = body || {};
  if (typeof title !== 'string' || !title.trim() || title.length > 255 || typeof description !== 'string' || description.length > 10000 ||
      typeof language !== 'string' || language.length > 50 || typeof poster !== 'string' || poster.length > 2000 ||
      typeof trailer_link !== 'string' || typeof release_date !== 'string' ||
      (runtime !== null && (!Number.isInteger(runtime) || runtime < 1 || runtime > 10000))) return null;
  poster = poster.trim(); trailer_link = trailer_link.trim();
  if (poster && !/^\/[A-Za-z0-9_.-]+\.(jpg|jpeg|png|webp)$/i.test(poster)) {
    try { const url = new URL(poster); if (url.protocol !== 'https:' || url.username || url.password) return null; } catch { return null; }
  }
  if (trailer_link) { trailer_link = youtubeId(trailer_link); if (!trailer_link) return null; }
  if (release_date && (!/^\d{4}-\d{2}-\d{2}$/.test(release_date) || Number(release_date.slice(0,4)) < 1 || !Number.isFinite(Date.parse(release_date)) || new Date(release_date).toISOString().slice(0,10) !== release_date)) return null;
  return [title.trim(), description.trim() || null, language.trim() || null, poster || null, trailer_link || null, release_date || null, runtime];
}
async function saveTitle(req, res) {
  const values = metadata(req.body);
  if (!values || (!req.params.id && !['movie','series'].includes(req.body.media_type))) return res.status(400).json({ error: 'Check the title, date, runtime, optional HTTPS poster and valid YouTube trailer link or ID.' });
  try {
    const data = structured.validate(req.body);
    const result = await pool.withTransaction(async client => {
      const result = await client.query(queries.callSaveCatalogTitle, [req.params.id || null, req.body.media_type || null, ...values]);
      await structured.save(client, result.rows[0].p_title_id, data);
      return result;
    });
    res.status(req.params.id ? 200 : 201).json({ title_id: result.rows[0].p_title_id });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({error:error.message});
    if (error.code === 'P0002') return res.status(404).json({ error: 'Title not found.' });
    throw error;
  }
}
router.get('/admin/catalog/:id/metadata', async (req,res) => res.json(await structured.load(pool, req.params.id)));
router.post('/admin/catalog', saveTitle);
router.put('/admin/catalog/:id', saveTitle);
router.delete('/admin/catalog/:id', async (req, res) => {
  const result = await pool.write(queries.deleteMedia, [req.params.id, req.body?.confirmation]);
  if (!result.rowCount) return res.status(409).json({ error: 'Title changed or was removed. Refresh the catalog and try again.' });
  res.json({ deleted: true });
});
router.get('/admin/accounts', async (req, res) => {
  const args = page(req, res); if (!args) return;
  const { rows } = await pool.query(queries.selectUserIdUsers, args);
  res.json({ items: rows.slice(0,20), hasMore: rows.length > 20 });
});
router.patch('/admin/accounts/:id', async (req, res) => {
  const role = req.body?.role;
  if (!['user','moderator','admin'].includes(role)) return res.status(400).json({ error: 'Choose a valid role.' });
  if (Number(req.params.id) === req.user.user_id) return res.status(400).json({ error: 'You cannot change your own administrator role.' });
  const client = await pool.connect();
  try {
    await client.query(queries.begin);
    // Serialize changes and recheck the actor to prevent concurrent admin demotions.
    await client.query(queries.lockUsers);
    const actor = await client.query(queries.selectRoleUsers, [req.user.user_id]);
    if (actor.rows[0]?.role !== 'admin') { await client.query(queries.rollback); return res.status(403).json({ error: 'Admin access required.' }); }
    const target = await client.query('SELECT role FROM users WHERE user_id=$1', [req.params.id]);
    if (target.rows[0]?.role === 'admin' && role !== 'admin') {
      const active = await client.query("SELECT count(*)::int AS n FROM users WHERE role='admin' AND user_id<>$1 AND (suspension_reason IS NULL OR suspended_until<=now())", [req.params.id]);
      if (!active.rows[0].n) { await client.query(queries.rollback); return res.status(409).json({error:'The last active Admin must retain access.'}); }
    }
    const result = await client.query(queries.updateUsers, [role, req.params.id]);
    if (!result.rowCount) { await client.query(queries.rollback); return res.status(404).json({ error: 'Account not found.' }); }
    await require('./community.routes').audit(client,req.user,'user',Number(req.params.id),'role-change',`Role changed to ${role}`);
    await client.query(queries.deleteUserSession, [req.params.id]);
    await client.query(queries.commit); res.json({ updated: true });
  } catch (error) { await client.query(queries.rollback); throw error; } finally { client.release(); }
});
router.delete('/admin/accounts/:id/sessions', async (req, res) => {
  if (Number(req.params.id) === req.user.user_id) return res.status(400).json({ error: 'Use Sign out for your own account.' });
  if (!(await pool.query(queries.selectUsers, [req.params.id])).rowCount) return res.status(404).json({ error: 'Account not found.' });
  await pool.write(queries.deleteUserSession, [req.params.id]);
  res.json({ revoked: true });
});
router.get('/admin/moderation', async (req, res) => {
  const args = page(req, res); if (!args) return;
  const { rows } = await pool.query(queries.selectCommunityPost, args);
  res.json({ items: rows.slice(0,20), hasMore: rows.length > 20 });
});
module.exports = router;
