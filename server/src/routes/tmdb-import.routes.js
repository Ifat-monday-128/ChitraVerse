const router = require('express').Router();
const { randomUUID } = require('node:crypto');
const importer = require('../services/tmdb-import.service');
const jobs = new Map();

router.post('/admin/catalog/import-tmdb', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  try { importer.parseLink(req.body?.url); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  if (!process.env.TMDB_TOKEN) return res.status(503).json({ error: 'TMDB import is not configured.' });
  for (const [id, job] of jobs) if (job.status !== 'running' && job.created < Date.now()-1800000) jobs.delete(id);
  const own = [...jobs.values()].find(job => job.userId === req.user.user_id && job.status === 'running');
  if (own) return res.status(409).json({ error: 'An import is already running. Wait for it to finish.' });
  if ([...jobs.values()].filter(job => job.status === 'running').length >= 2) return res.status(429).json({ error: 'The importer is busy. Please try again shortly.' });
  const id = randomUUID();
  const job = { id, userId: req.user.user_id, created: Date.now(), status: 'running', message: 'Starting import…' };
  jobs.set(id, job);
  res.status(202).json({ job_id: id });
  importer.importTitle(req.body.url, message => { job.message = message; }).then(result => {
    job.status = 'complete'; job.result = result; job.message = 'Import complete.';
  }).catch(error => {
    job.status = 'failed';
    job.message = error.response?.status === 404 ? 'This title or a related TMDB record was not found. Nothing was saved.'
      : 'Import failed. Check the TMDB token and connection, then try again. Nothing was saved.';
  });
});
router.get('/admin/catalog/import-tmdb/:jobId', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  const job = jobs.get(req.params.jobId);
  if (!job || job.userId !== req.user.user_id) return res.status(404).json({ error: 'Import status expired or the server restarted. Check the catalog before retrying.' });
  res.json({ status: job.status, message: job.message, result: job.result });
});
module.exports = router;
