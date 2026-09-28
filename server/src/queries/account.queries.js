const transactions = require('./transactions.queries');
// SQL for routes/account.routes.js. Values are bound by the caller.

exports.findSessionUser = `SELECT u.user_id, u.name, u.email, u.role, u.suspension_reason, u.suspended_until FROM users u
    JOIN user_session s USING(user_id)
    WHERE s.token_hash=$1 AND s.expires_at > now() AND u.user_id=$2`;

exports.begin = transactions.begin;

exports.lockPassword = 'SELECT password_hash FROM users WHERE user_id=$1 FOR UPDATE';

exports.rollback = transactions.rollback;

exports.deleteExpiredOrPreviousSession = "DELETE FROM user_session WHERE expires_at <= now() OR token_hash=$1";

exports.createSession = "INSERT INTO user_session(token_hash,user_id,expires_at) VALUES($1,$2,$3)";

exports.commit = transactions.commit;


exports.getAvatar = 'SELECT avatar FROM users WHERE user_id=$1';

exports.registerUser = `INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'user') RETURNING user_id,name,email,role`;

exports.findByEmail = "SELECT user_id,name,email,password_hash,role,avatar,suspension_reason,suspended_until FROM users WHERE email=$1";

exports.revokeSession = "DELETE FROM user_session WHERE token_hash=$1";

exports.listUsersWithActivity = `SELECT u.user_id,u.name,u.email,u.role,u.created_at,
    COALESCE((SELECT json_agg(activity ORDER BY activity.occurred_at DESC) FROM (
      SELECT 'rating' AS kind,a.title,a.new_rating AS rating,a.occurred_at,a.detail
      FROM activity_log a WHERE a.user_id=u.user_id
      UNION ALL
      SELECT 'rating',m.title,r.rating,r.created_at,'Previously saved rating: ' || r.rating || '/10 (before history tracking)'
      FROM review r JOIN media m USING(title_id) WHERE r.user_id=u.user_id AND r.rating IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM activity_log a WHERE a.user_id=r.user_id AND a.title_id=r.title_id)
      UNION ALL
      SELECT 'favorite',m.title,NULL,f.added_at,'Added to favorites'
      FROM favourite f JOIN media m USING(title_id) WHERE f.user_id=u.user_id
      UNION ALL
      SELECT 'comment',m.title,NULL,c.created_at,'Commented: ' || LEFT(c.content,160)
      FROM media_comment c JOIN media m USING(title_id) WHERE c.user_id=u.user_id
      UNION ALL
      SELECT 'story',p.title,NULL,p.created_at,'Published a story'
      FROM community_post p WHERE p.user_id=u.user_id
      UNION ALL
      SELECT 'watchlist' AS kind,m.title,NULL AS rating,wi.added_at AS occurred_at,NULL AS detail
      FROM watchlist w JOIN watchlist_item wi USING(watchlist_id) JOIN media m USING(title_id)
      WHERE w.user_id=u.user_id
    ) activity), '[]'::json) AS activities
    FROM users u ORDER BY u.created_at DESC,u.user_id DESC`;

exports.listFeaturedTitles = `SELECT m.title_id,m.title,m.poster,
    CASE WHEN mo.title_id IS NOT NULL THEN 'movie' ELSE 'series' END AS media_type
    FROM homepage_feature f JOIN media m USING(title_id) LEFT JOIN movie mo USING(title_id) ORDER BY f.position`;


exports.lockHomepageFeature = 'LOCK TABLE homepage_feature IN EXCLUSIVE MODE';

exports.validateFeaturedTitles = `SELECT m.title_id FROM media m WHERE m.title_id=ANY($1::int[])
      AND (EXISTS(SELECT 1 FROM movie WHERE title_id=m.title_id) OR EXISTS(SELECT 1 FROM series WHERE title_id=m.title_id)) FOR KEY SHARE`;

exports.deleteHomepageFeature = 'DELETE FROM homepage_feature';

exports.insertHomepageFeature = 'INSERT INTO homepage_feature(title_id,position) SELECT id,ordinality-1 FROM unnest($1::int[]) WITH ORDINALITY AS entries(id,ordinality)';


exports.getUserRating = "SELECT rating FROM review WHERE user_id=$1 AND title_id=$2 ORDER BY created_at DESC,review_id DESC LIMIT 1";

exports.titleExists = 'SELECT 1 FROM media WHERE title_id=$1';

exports.insertMediaComment = `INSERT INTO media_comment(user_id,title_id,content) VALUES($1,$2,$3)
      RETURNING comment_id,content,created_at`;

exports.listCommunityPosts = `SELECT p.*,(SELECT count(*)::int FROM community_comment cc WHERE cc.post_id=p.post_id AND NOT cc.hidden) AS comment_count,u.name, m.title AS media_title, c.name AS cast_name, g.name AS genre_name FROM community_post p JOIN users u USING(user_id) LEFT JOIN media m ON m.title_id=p.media_id LEFT JOIN cast_crew c USING(cast_crew_id) LEFT JOIN genre g USING(genre_id) WHERE NOT p.hidden AND p.deleted_at IS NULL ORDER BY p.created_at DESC,p.post_id DESC LIMIT 21 OFFSET $1`;

exports.insertCommunityPost = `INSERT INTO community_post(user_id,title,content,media_id,cast_crew_id,genre_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`;

exports.lockUserRatings = "SELECT pg_advisory_xact_lock($1)";

exports.lockRateableTitle = "SELECT 1 FROM media m WHERE title_id=$1 AND (EXISTS(SELECT 1 FROM movie WHERE title_id=m.title_id) OR EXISTS(SELECT 1 FROM series WHERE title_id=m.title_id)) FOR KEY SHARE";

exports.findExistingReviews = "SELECT review_id FROM review WHERE user_id=$1 AND title_id=$2 ORDER BY created_at DESC,review_id DESC";

exports.clearDuplicateRatings = "UPDATE review SET rating=NULL WHERE user_id=$1 AND title_id=$2 AND review_id<>$3 AND rating IS NOT NULL";

exports.updateRating = "UPDATE review SET rating=$1,created_at=now() WHERE review_id=$2";

exports.insertRating = "INSERT INTO review(user_id,title_id,rating) VALUES($1,$2,$3)";

exports.getRatingSummary = "SELECT * FROM get_title_rating($1)";

exports.listLegacyWatchlist = `SELECT DISTINCT m.title_id, m.title, m.poster, m.tmdb_rating,
    CASE WHEN mo.title_id IS NOT NULL THEN 'movie' ELSE 'series' END AS media_type
    FROM watchlist w JOIN watchlist_item wi USING(watchlist_id) JOIN media m USING(title_id)
    LEFT JOIN movie mo USING(title_id) WHERE w.user_id=$1 ORDER BY m.title`;
