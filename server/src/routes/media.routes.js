const express = require("express");
const mediaController = require("../controllers/media.controller");

const router = express.Router();

router.get("/", mediaController.browse);
router.get("/home", mediaController.getHome);
router.get("/search", mediaController.browse);
router.get('/filters', async (req, res, next) => {
  try {
    const pool = require('../config/db');
    const results = await Promise.all([
      pool.query('SELECT genre_id,name FROM genre ORDER BY name'),
      pool.query("SELECT DISTINCT language FROM media WHERE language ~ '^[a-z]{2,3}$' ORDER BY language"),
      pool.query("SELECT DISTINCT country FROM production_house WHERE country ~ '^[A-Z]{2}$' ORDER BY country"),
      pool.query('SELECT role_id,role_name FROM role ORDER BY role_name'),
    ]);
    res.json({ genres: results[0].rows, languages: results[1].rows.map(item=>item.language), countries: results[2].rows.map(item=>item.country), roles: results[3].rows });
  } catch (error) { next(error); }
});
router.get('/external/:type/:id', async (req, res, next) => {
  if (!['movie', 'series'].includes(req.params.type) || !/^[1-9]\d*$/.test(req.params.id) || Number(req.params.id) > 2147483647) return res.status(400).json({ error: 'Invalid title reference' });
  try {
    const title = await require('../services/external-title.service').details(req.params.type, Number(req.params.id));
    if (!title) return res.status(404).json({ error: 'This title is not in our local library.' });
    res.json(title);
  } catch (error) { next(error); }
});
function directoryQuery(req, res, next) {
  const { q = '', type = 'all' } = req.query;
  const limit = Number(req.query.limit ?? 36), offset = Number(req.query.offset ?? 0);
  if (typeof q !== 'string' || q.length > 120 || !['all', 'movie', 'series'].includes(type)
    || !Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 2147483647) {
    return res.status(400).json({ error: 'Invalid directory filters or pagination' });
  }
  let filters = {};
  try {
    if (!req.path.startsWith('/people')) filters = require('../utils/searchFilters').parseFilters(req.query);
    else {
      for (const key of ['role','photo','born_from','born_to','sort']) if (req.query[key] !== undefined && req.query[key] !== '') {
        if (typeof req.query[key] !== 'string') throw new Error('Invalid person filter');
        filters[key] = req.query[key];
      }
      if (filters.role && (!/^[1-9]\d*$/.test(filters.role) || Number(filters.role)>2147483647)) throw new Error('Invalid role');
      if (filters.photo && !['yes','no'].includes(filters.photo)) throw new Error('Invalid photo filter');
      if (filters.sort && !['name_asc','name_desc','birth_asc','birth_desc'].includes(filters.sort)) throw new Error('Invalid person sort');
      for (const key of ['born_from','born_to']) if (filters[key] && (!/^\d{4}$/.test(filters[key]) || Number(filters[key])<1800 || Number(filters[key])>2200)) throw new Error('Invalid birth year');
      if (filters.born_from && filters.born_to && filters.born_from>filters.born_to) throw new Error('Invalid birth year range');
    }
  } catch (error) { return res.status(400).json({ error: error.message }); }
  res.locals.directoryQuery = { q: q.trim(), type, limit, offset, ...filters }; next();
}
router.get('/people', directoryQuery, async (req, res, next) => {
  try { res.json(await require('../services/directory.service').people(res.locals.directoryQuery)); }
  catch (error) { next(error); }
});
router.get('/companies/:companyId', directoryQuery, async (req, res, next) => {
  try {
    if (!/^[1-9]\d*$/.test(req.params.companyId) || Number(req.params.companyId) > 2147483647) return res.status(400).json({ error: 'Invalid company ID' });
    const data = await require('../services/directory.service').company(Number(req.params.companyId), res.locals.directoryQuery);
    if (!data) return res.status(404).json({ error: 'Production company not found' });
    res.json(data);
  } catch (error) { next(error); }
});
router.get("/people/:personId", async (req, res, next) => {
  try {
    if (!/^[1-9]\d*$/.test(req.params.personId) || Number(req.params.personId) > 2147483647) {
      return res.status(400).json({ error: "Invalid person ID" });
    }
    const person = await require('../services/person.service').getPerson(Number(req.params.personId));
    if (!person) return res.status(404).json({ error: "Person not found" });
    res.json(person);
  } catch (error) { next(error); }
});
router.get("/:titleId", mediaController.getDetails);
router.get("/:titleId/seasons/:seasonNumber/episodes", mediaController.getEpisodes);

module.exports = router;
