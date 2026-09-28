const transactions = require('../queries/transactions.queries');
// SQL for routes/admin-management.routes.js. Values are bound by the caller.

exports.selectTitleIdMedia = `SELECT m.title_id,m.title,m.description,m.language,m.poster,m.trailer_link,
    CASE WHEN mo.title_id IS NOT NULL THEN 'movie' ELSE 'series' END AS media_type,
    mo.runtime,to_char(COALESCE(mo.release_date,s.first_air_date),'YYYY-MM-DD') AS release_date
    FROM media m LEFT JOIN movie mo USING(title_id) LEFT JOIN series s USING(title_id)
    WHERE (mo.title_id IS NOT NULL OR s.title_id IS NOT NULL) AND strpos(lower(m.title),lower($1))>0
    ORDER BY m.title_id DESC LIMIT 21 OFFSET $2`;

exports.callSaveCatalogTitle = 'CALL save_catalog_title($1::int,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::date,$9::int)';

exports.deleteMedia = 'DELETE FROM media WHERE title_id=$1 AND title=$2 RETURNING title_id';

exports.selectUserIdUsers = `SELECT user_id,name,email,role,created_at FROM users WHERE strpos(lower(name||' '||email),lower($1))>0 ORDER BY user_id DESC LIMIT 21 OFFSET $2`;

exports.begin = transactions.begin;

exports.lockUsers = 'LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE';

exports.selectRoleUsers = 'SELECT role FROM users WHERE user_id=$1';

exports.rollback = transactions.rollback;

exports.updateUsers = 'UPDATE users SET role=$1 WHERE user_id=$2 RETURNING user_id';

exports.deleteUserSession = 'DELETE FROM user_session WHERE user_id=$1';

exports.commit = transactions.commit;

exports.selectUsers = 'SELECT 1 FROM users WHERE user_id=$1';

exports.selectCommunityPost = `SELECT * FROM (
    SELECT 'story' AS kind,p.post_id AS id,p.title,p.content,u.name,p.created_at FROM community_post p JOIN users u USING(user_id)
    UNION ALL SELECT 'comment',c.comment_id,m.title,c.content,u.name,c.created_at FROM media_comment c JOIN users u USING(user_id) JOIN media m USING(title_id)
    ) entries WHERE strpos(lower(title||' '||content||' '||name),lower($1))>0 ORDER BY created_at DESC,kind,id DESC LIMIT 21 OFFSET $2`;

exports.deleteCommunityPost = 'DELETE FROM community_post WHERE post_id=$1 RETURNING post_id';

exports.deleteMediaComment = 'DELETE FROM media_comment WHERE comment_id=$1 RETURNING comment_id';
