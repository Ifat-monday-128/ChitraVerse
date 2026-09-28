// SQL for sync/enrichAll.js. Values are bound by the caller.

exports.insertCastCrew = `INSERT INTO cast_crew (tmdb_id, name, photo)
     VALUES ($1, $2, $3)
     ON CONFLICT (tmdb_id)
     DO UPDATE SET name = EXCLUDED.name, photo = EXCLUDED.photo
     RETURNING cast_crew_id`;

exports.insertRole = `INSERT INTO role (role_name)
     VALUES ($1)
     ON CONFLICT (role_name)
     DO UPDATE SET role_name = EXCLUDED.role_name
     RETURNING role_id`;

exports.insertMediaCastCrew = `INSERT INTO media_cast_crew (title_id, cast_crew_id, role_id)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`;

exports.insertProductionHouse = `INSERT INTO production_house (tmdb_id, name, country, logo)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tmdb_id)
       DO UPDATE SET
         name = EXCLUDED.name,
         country = EXCLUDED.country,
         logo = EXCLUDED.logo
       RETURNING company_id`;

exports.insertMediaCompany = `INSERT INTO media_company (title_id, company_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`;

exports.updateMedia = `UPDATE media
     SET budget = $1
     WHERE title_id = $2`;

exports.updateMovie = `UPDATE movie
     SET runtime = $1, box_office_gross = $2
     WHERE title_id = $3`;

exports.insertSeason = `INSERT INTO season (title_id, season_number)
     VALUES ($1, $2)
     ON CONFLICT (title_id, season_number)
     DO UPDATE SET season_number = EXCLUDED.season_number
     RETURNING season_id`;

exports.insertEpisode = `INSERT INTO episode
         (season_id, title, episode_number, runtime, air_date)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (season_id, episode_number)
       DO UPDATE SET
         title = EXCLUDED.title,
         runtime = EXCLUDED.runtime,
         air_date = EXCLUDED.air_date`;

exports.updateSeries = `UPDATE series
     SET status = $1, last_air_date = $2
     WHERE title_id = $3`;

exports.moviesToEnrich = `SELECT media.title_id, media.tmdb_id
       FROM media
       JOIN movie ON movie.title_id = media.title_id
       WHERE media.tmdb_id IS NOT NULL`;

exports.seriesToEnrich = `SELECT media.title_id, media.tmdb_id
       FROM media
       JOIN series ON series.title_id = media.title_id
       WHERE media.tmdb_id IS NOT NULL`;
