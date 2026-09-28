// SQL for routes/media.routes.js. Values are bound by the caller.

exports.selectPostIdCommunityPost = `SELECT p.user_id,(SELECT count(*)::int FROM community_comment cc WHERE cc.post_id=p.post_id AND NOT cc.hidden) AS comment_count,p.post_id,p.title,p.content,p.created_at,p.media_id,p.cast_crew_id,p.genre_id,u.name,
    m.title AS media_title,c.name AS cast_name,g.name AS genre_name
    FROM community_post p JOIN users u USING(user_id) LEFT JOIN media m ON m.title_id=p.media_id
    LEFT JOIN cast_crew c USING(cast_crew_id) LEFT JOIN genre g USING(genre_id)
    WHERE NOT p.hidden AND p.deleted_at IS NULL
    ORDER BY p.created_at DESC,p.post_id DESC LIMIT 21 OFFSET $1`;

exports.selectMedia = 'SELECT 1 FROM media WHERE title_id=$1';

exports.selectCommentIdMediaComment = `SELECT c.comment_id,c.content,c.created_at,u.user_id,u.name
      FROM media_comment c JOIN users u USING(user_id) WHERE c.title_id=$1 ORDER BY c.created_at DESC,c.comment_id DESC`;

exports.selectGenreIdGenre = 'SELECT genre_id,name FROM genre ORDER BY name';

exports.selectLanguageMedia = "SELECT DISTINCT language FROM media WHERE language ~ '^[a-z]{2,3}$' ORDER BY language";

exports.selectCountryProductionHouse = "SELECT DISTINCT country FROM production_house WHERE country ~ '^[A-Z]{2}$' ORDER BY country";

exports.selectRoleIdRole = 'SELECT role_id,role_name FROM role ORDER BY role_name';
