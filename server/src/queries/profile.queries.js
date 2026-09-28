const transactions = require('./transactions.queries');
// SQL for routes/profile.routes.js. Values are bound by the caller.

exports.getProfile = 'SELECT user_id,name,email,role,avatar,created_at FROM users WHERE user_id=$1';

exports.overviewCounts = `SELECT
      (SELECT COUNT(DISTINCT title_id)::int FROM favourite WHERE user_id=$1) AS favorites,
      (SELECT COUNT(*)::int FROM watchlist WHERE user_id=$1) AS playlists,
      (SELECT COUNT(DISTINCT title_id)::int FROM review WHERE user_id=$1 AND rating IS NOT NULL) AS ratings,
      (SELECT COUNT(*)::int FROM community_post WHERE user_id=$1) AS stories`;

exports.recentRatings = `SELECT m.title_id,m.title,m.poster,m.tmdb_rating,
      CASE WHEN EXISTS(SELECT 1 FROM movie WHERE title_id=m.title_id) THEN 'movie' ELSE 'series' END AS media_type
      FROM media m JOIN (SELECT title_id,MAX(added_at) AS saved_at FROM favourite WHERE user_id=$1 GROUP BY title_id) f USING(title_id)
      ORDER BY f.saved_at DESC,m.title_id DESC LIMIT 8`;

exports.watchlistSummary = `SELECT w.watchlist_id,w.name,COUNT(wi.title_id)::int AS title_count
      FROM watchlist w LEFT JOIN watchlist_item wi USING(watchlist_id) WHERE w.user_id=$1
      GROUP BY w.watchlist_id ORDER BY w.created_at DESC,w.watchlist_id DESC LIMIT 6`;

exports.updateProfile = `UPDATE users SET name=$1,avatar=CASE WHEN $2 THEN $3 ELSE avatar END
    WHERE user_id=$4 RETURNING user_id,name,email,role,avatar,created_at`;

exports.begin = transactions.begin;

exports.lockPassword = 'SELECT password_hash FROM users WHERE user_id=$1 FOR UPDATE';

exports.rollback = transactions.rollback;

exports.changePassword = 'UPDATE users SET password_hash=$1 WHERE user_id=$2';

exports.revokeOtherSessions = 'DELETE FROM user_session WHERE user_id=$1 AND token_hash<>$2';

exports.deletePasswordReset = 'DELETE FROM password_reset WHERE user_id=$1';

exports.commit = transactions.commit;

exports.activityHistory = `SELECT * FROM (
    SELECT 'rating' AS kind,a.activity_id::text AS id,a.title,a.title_id,a.detail,a.occurred_at
      FROM activity_log a WHERE a.user_id=$1
    UNION ALL SELECT 'rating','legacy:'||r.review_id,m.title,r.title_id,
      'Previously saved rating: ' || r.rating || '/10 (before history tracking)',r.created_at
      FROM review r JOIN media m USING(title_id) WHERE r.user_id=$1 AND r.rating IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM activity_log a WHERE a.user_id=r.user_id AND a.title_id=r.title_id)
    UNION ALL SELECT 'favorite',f.favourite_id::text,m.title,f.title_id,NULL,f.added_at FROM favourite f JOIN media m USING(title_id) WHERE f.user_id=$1
    UNION ALL SELECT 'playlist',w.watchlist_id::text||':'||wi.title_id,m.title,wi.title_id,w.name,wi.added_at
      FROM watchlist w JOIN watchlist_item wi USING(watchlist_id) JOIN media m USING(title_id) WHERE w.user_id=$1
    UNION ALL SELECT 'comment',c.comment_id::text,m.title,c.title_id,LEFT(c.content,160),c.created_at
      FROM media_comment c JOIN media m USING(title_id) WHERE c.user_id=$1
    UNION ALL SELECT 'story',p.post_id::text,p.title,NULL,NULL,p.created_at FROM community_post p WHERE p.user_id=$1
  ) activity ORDER BY occurred_at DESC NULLS LAST,kind,id LIMIT 21 OFFSET $2`;
