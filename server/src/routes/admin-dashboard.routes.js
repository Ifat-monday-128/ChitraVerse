const queries = require('./admin-dashboard.queries');
const router = require('express').Router();
const pool = require('../config/db');

router.get('/admin/dashboard', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  const [totals, roles, users, activity, registrations] = await Promise.all([
    pool.query(queries.selectUsers),
    pool.query(queries.selectCOALESCEUsers),
    pool.query(queries.selectUserIdUsers),
    pool.query(queries.selectCommunityPost),
    pool.query(queries.selectToCharGenerateSeries),
  ]);
  res.set('Cache-Control', 'no-store').json({ totals: totals.rows[0], roles: roles.rows, users: users.rows, activity: activity.rows, registrations: registrations.rows, updated_at: new Date().toISOString() });
});
module.exports = router;
