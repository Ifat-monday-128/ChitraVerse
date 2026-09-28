// SQL for sync/syncAll.js. Values are bound by the caller.

exports.insertGenre = `INSERT INTO genre (tmdb_id, name)
       VALUES ($1, $2)
       ON CONFLICT (tmdb_id)
       DO UPDATE SET name = EXCLUDED.name`;

exports.insertMedia = `INSERT INTO media (tmdb_id, title, description, language, poster, tmdb_rating, tmdb_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (tmdb_id,tmdb_type)
     DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       language = EXCLUDED.language,
       poster = EXCLUDED.poster,
       tmdb_rating = EXCLUDED.tmdb_rating
     RETURNING title_id`;

exports.insertMediaGenre = `INSERT INTO media_genre (title_id, genre_id)
       SELECT $1, genre_id FROM genre WHERE tmdb_id = $2
       ON CONFLICT DO NOTHING`;

exports.insertMovie = `INSERT INTO movie (title_id, release_date)
         VALUES ($1, $2)
         ON CONFLICT (title_id)
         DO UPDATE SET release_date = EXCLUDED.release_date`;

exports.insertSeries = `INSERT INTO series (title_id, first_air_date)
         VALUES ($1, $2)
         ON CONFLICT (title_id)
         DO UPDATE SET first_air_date = EXCLUDED.first_air_date`;
