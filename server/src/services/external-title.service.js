const queries = require('./external-title.queries');
const pool = require('../config/db');

// Resolve old bookmarked TMDB references against the library only.
exports.details = async (type, id) => {
  const { rows: [item] } = await pool.query(queries.selectTitleIdMedia(type === 'series' ? 'series' : 'movie'), [id, type === 'series' ? -id : id]);
  return item ? require('./media.service').getDetails(item.title_id) : null;
};
