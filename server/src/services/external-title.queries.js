// SQL for services/external-title.service.js. Values are bound by the caller.

exports.selectTitleIdMedia = (table) => `SELECT m.title_id FROM media m
    JOIN ${table} t USING(title_id)
    WHERE m.tmdb_id = $1 OR m.tmdb_id = $2
    ORDER BY m.title_id LIMIT 1`;
