const router = require('express').Router();
const pool = require('../config/db');

router.get('/admin/dashboard', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  const [totals, roles, users, activity, registrations] = await Promise.all([
    pool.query(`SELECT
      (SELECT COUNT(*)::int FROM users) AS users,
      (SELECT COUNT(*)::int FROM movie) AS movies,
      (SELECT COUNT(*)::int FROM series) AS series,
      (SELECT COUNT(*)::int FROM cast_crew) AS people,
      (SELECT COUNT(*)::int FROM genre) AS genres,
      (SELECT COUNT(*)::int FROM production_house) AS studios,
      (SELECT COUNT(*)::int FROM community_post) AS stories,
      (SELECT COUNT(*)::int FROM media_comment) AS comments,
      (SELECT COUNT(*)::int FROM review WHERE rating IS NOT NULL) AS ratings,
      (SELECT COUNT(*)::int FROM favourite) AS favorites,
      (SELECT COUNT(*)::int FROM watchlist) AS playlists,
      (SELECT COUNT(*)::int FROM homepage_feature) AS featured,
      (SELECT COUNT(DISTINCT user_id)::int FROM user_session WHERE expires_at>now()) AS signed_in_accounts,
      (SELECT COUNT(*)::int FROM users WHERE created_at>=now()-interval '7 days') AS new_users`),
    pool.query(`SELECT COALESCE(role,'Unassigned') AS role,COUNT(*)::int AS count FROM users GROUP BY role ORDER BY count DESC,role`),
    pool.query('SELECT user_id,name,email,role,created_at FROM users ORDER BY created_at DESC,user_id DESC LIMIT 6'),
    pool.query(`SELECT * FROM (
      (SELECT 'story' AS kind,p.post_id AS id,u.name,p.title,p.created_at AS occurred_at FROM community_post p JOIN users u USING(user_id) ORDER BY p.created_at DESC,p.post_id DESC LIMIT 8)
      UNION ALL
      (SELECT 'comment',c.comment_id,u.name,m.title,c.created_at FROM media_comment c JOIN users u USING(user_id) JOIN media m USING(title_id) ORDER BY c.created_at DESC,c.comment_id DESC LIMIT 8)
      UNION ALL
      (SELECT 'rating',r.review_id,u.name,m.title,r.created_at FROM review r JOIN users u USING(user_id) JOIN media m USING(title_id) WHERE r.rating IS NOT NULL ORDER BY r.created_at DESC,r.review_id DESC LIMIT 8)
    ) recent ORDER BY occurred_at DESC,kind,id DESC LIMIT 8`),
    pool.query(`SELECT to_char(day,'YYYY-MM-DD') AS day,COUNT(u.user_id)::int AS count
      FROM generate_series(CURRENT_DATE-6,CURRENT_DATE,interval '1 day') AS day
      LEFT JOIN users u ON u.created_at>=day AND u.created_at<day+interval '1 day'
      GROUP BY day ORDER BY day`),
  ]);
  res.set('Cache-Control', 'no-store').json({ totals: totals.rows[0], roles: roles.rows, users: users.rows, activity: activity.rows, registrations: registrations.rows, updated_at: new Date().toISOString() });
});
module.exports = router;
