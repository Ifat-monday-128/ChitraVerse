// SQL for services/tmdb-import.service.js. Values are bound by the caller.

exports.lockImport = 'SELECT pg_advisory_xact_lock(216,1)';

exports.findExistingTitle = (legacyType) => `SELECT m.title_id FROM media m WHERE
      (tmdb_id=$1 AND tmdb_type=$2) OR (tmdb_id=$1 AND tmdb_type IS NULL AND
      EXISTS(SELECT 1 FROM ${legacyType} t WHERE t.title_id=m.title_id)) OR
      ($2='tv' AND tmdb_id=-$1 AND EXISTS(SELECT 1 FROM series s WHERE s.title_id=m.title_id)) FOR UPDATE`;

exports.updateMedia = `UPDATE media SET tmdb_id=$1,tmdb_type=$2,title=$3,description=$4,language=$5,poster=$6,tmdb_rating=$7,budget=$8,trailer_link=COALESCE($9,trailer_link) WHERE title_id=$10 RETURNING title_id`;

exports.insertMedia = `INSERT INTO media(tmdb_id,tmdb_type,title,description,language,poster,tmdb_rating,budget,trailer_link) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING title_id`;

exports.insertMovie = `INSERT INTO movie(title_id,runtime,release_date,box_office_gross) VALUES($1,$2,$3,$4)
      ON CONFLICT(title_id) DO UPDATE SET runtime=EXCLUDED.runtime,release_date=EXCLUDED.release_date,box_office_gross=EXCLUDED.box_office_gross`;

exports.insertSeries = `INSERT INTO series(title_id,status,first_air_date,last_air_date) VALUES($1,$2,$3,$4)
      ON CONFLICT(title_id) DO UPDATE SET status=EXCLUDED.status,first_air_date=EXCLUDED.first_air_date,last_air_date=EXCLUDED.last_air_date`;

exports.deleteTitleRelationships = (table) => `DELETE FROM ${table} WHERE title_id=$1`;

exports.insertGenre = `INSERT INTO genre(tmdb_id,name) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET tmdb_id=COALESCE(genre.tmdb_id,EXCLUDED.tmdb_id) RETURNING genre_id`;

exports.insertMediaGenre = 'INSERT INTO media_genre VALUES($1,$2) ON CONFLICT DO NOTHING';

exports.insertCastCrew = `INSERT INTO cast_crew(tmdb_id,name,biography,photo,date_of_birth) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(tmdb_id) DO UPDATE SET name=EXCLUDED.name,biography=EXCLUDED.biography,photo=EXCLUDED.photo,date_of_birth=EXCLUDED.date_of_birth RETURNING cast_crew_id`;

exports.insertRole = 'INSERT INTO role(role_name) VALUES($1) ON CONFLICT(role_name) DO UPDATE SET role_name=EXCLUDED.role_name RETURNING role_id';

exports.insertMediaCastCrew = 'INSERT INTO media_cast_crew VALUES($1,$2,$3) ON CONFLICT DO NOTHING';

exports.insertProductionHouse = `INSERT INTO production_house(tmdb_id,name,country,logo) VALUES($1,$2,$3,$4)
        ON CONFLICT(tmdb_id) DO UPDATE SET name=EXCLUDED.name,country=EXCLUDED.country,logo=EXCLUDED.logo RETURNING company_id`;

exports.insertMediaCompany = 'INSERT INTO media_company VALUES($1,$2) ON CONFLICT DO NOTHING';

exports.insertSeason = `INSERT INTO season(title_id,season_number) VALUES($1,$2) ON CONFLICT(title_id,season_number) DO UPDATE SET season_number=EXCLUDED.season_number RETURNING season_id`;

exports.insertEpisode = `INSERT INTO episode(season_id,title,episode_number,runtime,air_date) VALUES($1,$2,$3,$4,$5)
          ON CONFLICT(season_id,episode_number) DO UPDATE SET title=EXCLUDED.title,runtime=EXCLUDED.runtime,air_date=EXCLUDED.air_date`;

exports.selectPlatformIdStreamingPlatform = 'SELECT platform_id FROM streaming_platform WHERE name=$1 ORDER BY platform_id LIMIT 1';

exports.insertStreamingPlatform = 'INSERT INTO streaming_platform(name,logo) VALUES($1,$2) RETURNING platform_id';

exports.updateStreamingPlatform = 'UPDATE streaming_platform SET logo=$1 WHERE platform_id=$2';

exports.insertMediaPlatform = 'INSERT INTO media_platform VALUES($1,$2) ON CONFLICT DO NOTHING';
