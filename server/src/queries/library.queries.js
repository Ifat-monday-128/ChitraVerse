const transactions = require('./transactions.queries');
const mediaColumns = `m.title_id,m.title,m.poster,m.tmdb_rating,
  to_char(mo.release_date,'YYYY-MM-DD') AS release_date,
  to_char(s.first_air_date,'YYYY-MM-DD') AS first_air_date,
  CASE WHEN mo.title_id IS NOT NULL THEN 'movie' ELSE 'series' END AS media_type`;
const mediaJoins = `JOIN media m USING(title_id) LEFT JOIN movie mo USING(title_id) LEFT JOIN series s USING(title_id)`;

// SQL for routes/library.routes.js. Values are bound by the caller.

exports.listWatchlists = `SELECT w.watchlist_id,w.name,COUNT(wi.title_id)::int AS title_count,
    COALESCE(bool_or(wi.title_id=$2),false) AS contains_title
    FROM watchlist w LEFT JOIN watchlist_item wi USING(watchlist_id)
    WHERE w.user_id=$1 GROUP BY w.watchlist_id ORDER BY w.created_at,w.watchlist_id`;

exports.insertWatchlist = 'INSERT INTO watchlist(user_id,name) VALUES($1,$2) RETURNING watchlist_id,name';

exports.findOwnedWatchlist = 'SELECT watchlist_id,name FROM watchlist WHERE watchlist_id=$1 AND user_id=$2';

exports.watchlistTitles = `SELECT ${mediaColumns} FROM watchlist_item wi ${mediaJoins}
    JOIN watchlist w USING(watchlist_id) WHERE w.watchlist_id=$1 AND w.user_id=$2 ORDER BY wi.added_at DESC,m.title_id`;

exports.updateWatchlist = 'UPDATE watchlist SET name=$1 WHERE watchlist_id=$2 AND user_id=$3 RETURNING watchlist_id,name';

exports.deleteWatchlist = 'DELETE FROM watchlist WHERE watchlist_id=$1 AND user_id=$2';

exports.begin = transactions.begin;

exports.lockOwnedWatchlist = 'SELECT 1 FROM watchlist WHERE watchlist_id=$1 AND user_id=$2 FOR UPDATE';

exports.rollback = transactions.rollback;

exports.insertWatchlistItem = `INSERT INTO watchlist_item(watchlist_id,title_id)
        SELECT $1,m.title_id FROM media m WHERE m.title_id=$2
        AND (EXISTS(SELECT 1 FROM movie WHERE title_id=m.title_id) OR EXISTS(SELECT 1 FROM series WHERE title_id=m.title_id))
        ON CONFLICT DO NOTHING`;

exports.selectWatchlistItem = 'SELECT 1 FROM watchlist_item WHERE watchlist_id=$1 AND title_id=$2';

exports.deleteWatchlistItem = 'DELETE FROM watchlist_item WHERE watchlist_id=$1 AND title_id=$2';

exports.commit = transactions.commit;

exports.favoriteTitles = `SELECT DISTINCT ${mediaColumns} FROM favourite f ${mediaJoins}
    WHERE f.user_id=$1 ORDER BY m.title,m.title_id`;

exports.isFavorite = 'SELECT 1 FROM favourite WHERE user_id=$1 AND title_id=$2 LIMIT 1';

exports.lockUserFavorites = 'SELECT pg_advisory_xact_lock($1)';

exports.lockEligibleTitle = `SELECT 1 FROM media m WHERE title_id=$1 AND
        (EXISTS(SELECT 1 FROM movie WHERE title_id=m.title_id) OR EXISTS(SELECT 1 FROM series WHERE title_id=m.title_id)) FOR KEY SHARE`;

exports.insertFavourite = `INSERT INTO favourite(user_id,title_id) SELECT $1,$2
        WHERE NOT EXISTS(SELECT 1 FROM favourite WHERE user_id=$1 AND title_id=$2)`;

exports.deleteFavourite = 'DELETE FROM favourite WHERE user_id=$1 AND title_id=$2';
