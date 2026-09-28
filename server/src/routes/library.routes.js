const queries = require('../queries/library.queries');
const express = require('express');
const pool = require('../config/db');
const router = express.Router();
const validId = value => /^[1-9]\d*$/.test(String(value)) && Number(value) <= 2147483647;
const validName = name => typeof name === 'string' && name.trim().length > 0 && name.length <= 255;


router.use(['/watchlists', '/favorites'], (req, res, next) => {
  if (req.user.role === 'admin') return res.status(403).json({ error: 'Admins cannot use personal libraries.' });
  next();
});
router.param('listId', (req, res, next, id) => {
  if (!validId(id)) return res.status(400).json({ error: 'Invalid watchlist ID.' });
  next();
});
router.param('titleId', (req, res, next, id) => {
  if (!validId(id)) return res.status(400).json({ error: 'Invalid title ID.' });
  next();
});
router.get('/watchlists', async (req, res) => {
  const titleId = req.query.title_id;
  if (titleId !== undefined && (typeof titleId !== 'string' || !validId(titleId))) return res.status(400).json({ error: 'Invalid title ID.' });
  const { rows } = await pool.query(queries.listWatchlists, [req.user.user_id, titleId ?? null]);
  res.json({ watchlists: rows });
});
router.post('/watchlists', async (req, res) => {
  if (!validName(req.body?.name)) return res.status(400).json({ error: 'Enter a watchlist name of 1–255 characters.' });
  const { rows } = await pool.write(queries.insertWatchlist, [req.user.user_id, req.body.name.trim()]);
  res.status(201).json({ watchlist: { ...rows[0], title_count: 0, contains_title: false } });
});
router.get('/watchlists/:listId', async (req, res) => {
  const { rows } = await pool.query(queries.findOwnedWatchlist, [req.params.listId, req.user.user_id]);
  if (!rows.length) return res.status(404).json({ error: 'Watchlist not found.' });
  const items = await pool.query(queries.watchlistTitles, [req.params.listId, req.user.user_id]);
  res.json({ watchlist: rows[0], items: items.rows });
});
router.patch('/watchlists/:listId', async (req, res) => {
  if (!validName(req.body?.name)) return res.status(400).json({ error: 'Enter a watchlist name of 1–255 characters.' });
  const { rows } = await pool.write(queries.updateWatchlist, [req.body.name.trim(), req.params.listId, req.user.user_id]);
  if (!rows.length) return res.status(404).json({ error: 'Watchlist not found.' });
  res.json({ watchlist: rows[0] });
});
router.delete('/watchlists/:listId', async (req, res) => {
  const result = await pool.write(queries.deleteWatchlist, [req.params.listId, req.user.user_id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Watchlist not found.' });
  res.json({ deleted: true });
});
router.route('/watchlists/:listId/items/:titleId').put(changeItem).delete(changeItem);
async function changeItem(req, res) {
  const client = await pool.connect();
  try {
    await client.query(queries.begin);
    // Hold the owned list through this write, including concurrent list deletion.
    const owned = await client.query(queries.lockOwnedWatchlist, [req.params.listId, req.user.user_id]);
    if (!owned.rowCount) { await client.query(queries.rollback); return res.status(404).json({ error: 'Watchlist not found.' }); }
    if (req.method === 'PUT') {
      const result = await client.query(queries.insertWatchlistItem, [req.params.listId, req.params.titleId]);
      if (!result.rowCount && !(await client.query(queries.selectWatchlistItem, [req.params.listId, req.params.titleId])).rowCount) {
        await client.query(queries.rollback); return res.status(404).json({ error: 'Title not found.' });
      }
    } else await client.query(queries.deleteWatchlistItem, [req.params.listId, req.params.titleId]);
    await client.query(queries.commit);
    res.json({ saved: req.method === 'PUT' });
  } catch (error) { await client.query(queries.rollback); throw error; }
  finally { client.release(); }
}

router.get('/favorites', async (req, res) => {
  const { rows } = await pool.query(queries.favoriteTitles, [req.user.user_id]);
  res.json({ items: rows });
});
router.get('/favorites/:titleId', async (req, res) => {
  const { rowCount } = await pool.query(queries.isFavorite, [req.user.user_id, req.params.titleId]);
  res.json({ saved: rowCount > 0 });
});
router.route('/favorites/:titleId').put(changeFavorite).delete(changeFavorite);
async function changeFavorite(req, res) {
  const client = await pool.connect();
  try {
    await client.query(queries.begin);
    // The existing favourite table has no unique key. Serialize all favorite
    // writes for this user to prevent duplicate inserts without a schema change.
    await client.query(queries.lockUserFavorites, [req.user.user_id]);
    if (req.method === 'PUT') {
      const title = await client.query(queries.lockEligibleTitle, [req.params.titleId]);
      if (!title.rowCount) { await client.query(queries.rollback); return res.status(404).json({ error: 'Title not found.' }); }
      await client.query(queries.insertFavourite, [req.user.user_id, req.params.titleId]);
    } else await client.query(queries.deleteFavourite, [req.user.user_id, req.params.titleId]);
    await client.query(queries.commit);
    res.json({ saved: req.method === 'PUT' });
  } catch (error) { await client.query(queries.rollback); throw error; }
  finally { client.release(); }
}
module.exports = router;
