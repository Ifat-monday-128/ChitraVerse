// SQL for sync/searchTrailers.js. Values are bound by the caller.

exports.titlesNeedingTrailers = `SELECT m.title_id, m.title, m.trailer_link,
      EXTRACT(YEAR FROM COALESCE(mo.release_date, s.first_air_date))::int AS year,
      CASE WHEN mo.title_id IS NOT NULL THEN 'movie' ELSE 'TV series' END AS type
    FROM media m LEFT JOIN movie mo USING(title_id) LEFT JOIN series s USING(title_id)
    WHERE ($1 OR m.trailer_link IS NOT NULL) ORDER BY m.title_id`;

exports.updateTrailerIfUnchanged = "UPDATE media SET trailer_link=$1 WHERE title_id=$2 AND trailer_link IS NOT DISTINCT FROM $3";
