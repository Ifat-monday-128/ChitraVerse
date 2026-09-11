const pool = require('../config/db');

// Resolve old bookmarked TMDB references against the library only.
exports.details = async (type, id) => {
  const { rows: [item] } = await pool.query(`SELECT m.title_id FROM media m
    JOIN ${type === 'series' ? 'series' : 'movie'} t USING(title_id)
    WHERE m.tmdb_id = $1 OR m.tmdb_id = $2
    ORDER BY m.title_id LIMIT 1`, [id, type === 'series' ? -id : id]);
  return item ? require('./media.service').getDetails(item.title_id) : null;
};
