const express = require('express');
const pool = require('../config/db');
const router = express.Router();
const validId = value => /^[1-9]\d*$/.test(String(value)) && Number(value) <= 2147483647;
const validName = name => typeof name === 'string' && name.trim().length > 0 && name.length <= 255;
const mediaColumns = `m.title_id,m.title,m.poster,m.tmdb_rating,
  to_char(mo.release_date,'YYYY-MM-DD') AS release_date,
  to_char(s.first_air_date,'YYYY-MM-DD') AS first_air_date,
  CASE WHEN mo.title_id IS NOT NULL THEN 'movie' ELSE 'series' END AS media_type`;
const mediaJoins = `JOIN media m USING(title_id) LEFT JOIN movie mo USING(title_id) LEFT JOIN series s USING(title_id)`;

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
  const { rows } = await pool.query(`SELECT w.watchlist_id,w.name,COUNT(wi.title_id)::int AS title_count,
    COALESCE(bool_or(wi.title_id=$2),false) AS contains_title
    FROM watchlist w LEFT JOIN watchlist_item wi USING(watchlist_id)
    WHERE w.user_id=$1 GROUP BY w.watchlist_id ORDER BY w.created_at,w.watchlist_id`, [req.user.user_id, titleId ?? null]);
  res.json({ watchlists: rows });
});
router.post('/watchlists', async (req, res) => {
  if (!validName(req.body?.name)) return res.status(400).json({ error: 'Enter a watchlist name of 1–255 characters.' });
  const { rows } = await pool.write('INSERT INTO watchlist(user_id,name) VALUES($1,$2) RETURNING watchlist_id,name', [req.user.user_id, req.body.name.trim()]);
  res.status(201).json({ watchlist: { ...rows[0], title_count: 0, contains_title: false } });
});
router.get('/watchlists/:listId', async (req, res) => {
  const { rows } = await pool.query('SELECT watchlist_id,name FROM watchlist WHERE watchlist_id=$1 AND user_id=$2', [req.params.listId, req.user.user_id]);
  if (!rows.length) return res.status(404).json({ error: 'Watchlist not found.' });
  const items = await pool.query(`SELECT ${mediaColumns} FROM watchlist_item wi ${mediaJoins}
    JOIN watchlist w USING(watchlist_id) WHERE w.watchlist_id=$1 AND w.user_id=$2 ORDER BY wi.added_at DESC,m.title_id`, [req.params.listId, req.user.user_id]);
  res.json({ watchlist: rows[0], items: items.rows });
});
router.patch('/watchlists/:listId', async (req, res) => {
  if (!validName(req.body?.name)) return res.status(400).json({ error: 'Enter a watchlist name of 1–255 characters.' });
  const { rows } = await pool.write('UPDATE watchlist SET name=$1 WHERE watchlist_id=$2 AND user_id=$3 RETURNING watchlist_id,name', [req.body.name.trim(), req.params.listId, req.user.user_id]);
  if (!rows.length) return res.status(404).json({ error: 'Watchlist not found.' });
  res.json({ watchlist: rows[0] });
});
router.delete('/watchlists/:listId', async (req, res) => {
  const result = await pool.write('DELETE FROM watchlist WHERE watchlist_id=$1 AND user_id=$2', [req.params.listId, req.user.user_id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Watchlist not found.' });
  res.json({ deleted: true });
});
router.route('/watchlists/:listId/items/:titleId').put(changeItem).delete(changeItem);
async function changeItem(req, res) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Hold the owned list through this write, including concurrent list deletion.
    const owned = await client.query('SELECT 1 FROM watchlist WHERE watchlist_id=$1 AND user_id=$2 FOR UPDATE', [req.params.listId, req.user.user_id]);
    if (!owned.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Watchlist not found.' }); }
    if (req.method === 'PUT') {
      const result = await client.query(`INSERT INTO watchlist_item(watchlist_id,title_id)
        SELECT $1,m.title_id FROM media m WHERE m.title_id=$2
        AND (EXISTS(SELECT 1 FROM movie WHERE title_id=m.title_id) OR EXISTS(SELECT 1 FROM series WHERE title_id=m.title_id))
        ON CONFLICT DO NOTHING`, [req.params.listId, req.params.titleId]);
      if (!result.rowCount && !(await client.query('SELECT 1 FROM watchlist_item WHERE watchlist_id=$1 AND title_id=$2', [req.params.listId, req.params.titleId])).rowCount) {
        await client.query('ROLLBACK'); return res.status(404).json({ error: 'Title not found.' });
      }
    } else await client.query('DELETE FROM watchlist_item WHERE watchlist_id=$1 AND title_id=$2', [req.params.listId, req.params.titleId]);
    await client.query('COMMIT');
    res.json({ saved: req.method === 'PUT' });
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

router.get('/favorites', async (req, res) => {
  const { rows } = await pool.query(`SELECT DISTINCT ${mediaColumns} FROM favourite f ${mediaJoins}
    WHERE f.user_id=$1 ORDER BY m.title,m.title_id`, [req.user.user_id]);
  res.json({ items: rows });
});
router.get('/favorites/:titleId', async (req, res) => {
  const { rowCount } = await pool.query('SELECT 1 FROM favourite WHERE user_id=$1 AND title_id=$2 LIMIT 1', [req.user.user_id, req.params.titleId]);
  res.json({ saved: rowCount > 0 });
});
router.route('/favorites/:titleId').put(changeFavorite).delete(changeFavorite);
async function changeFavorite(req, res) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // The existing favourite table has no unique key. Serialize all favorite
    // writes for this user to prevent duplicate inserts without a schema change.
    await client.query('SELECT pg_advisory_xact_lock($1)', [req.user.user_id]);
    if (req.method === 'PUT') {
      const title = await client.query(`SELECT 1 FROM media m WHERE title_id=$1 AND
        (EXISTS(SELECT 1 FROM movie WHERE title_id=m.title_id) OR EXISTS(SELECT 1 FROM series WHERE title_id=m.title_id)) FOR KEY SHARE`, [req.params.titleId]);
      if (!title.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Title not found.' }); }
      await client.query(`INSERT INTO favourite(user_id,title_id) SELECT $1,$2
        WHERE NOT EXISTS(SELECT 1 FROM favourite WHERE user_id=$1 AND title_id=$2)`, [req.user.user_id, req.params.titleId]);
    } else await client.query('DELETE FROM favourite WHERE user_id=$1 AND title_id=$2', [req.user.user_id, req.params.titleId]);
    await client.query('COMMIT');
    res.json({ saved: req.method === 'PUT' });
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
module.exports = router;
