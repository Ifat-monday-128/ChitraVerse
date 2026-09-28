// SQL for services/person.service.js. Values are bound by the caller.

exports.selectCastCrewIdCastCrew = `SELECT cast_crew_id, tmdb_id, name, photo, biography,
    to_char(date_of_birth, 'YYYY-MM-DD') AS date_of_birth FROM cast_crew WHERE cast_crew_id = $1`;

exports.selectTitleIdMedia = `SELECT m.title_id, m.tmdb_id, m.title, m.poster, m.tmdb_rating,
    to_char(COALESCE(mo.release_date, s.first_air_date), 'YYYY-MM-DD') AS release_date,
    CASE WHEN mo.title_id IS NOT NULL THEN 'movie' ELSE 'series' END AS media_type,
    array_agg(DISTINCT r.role_name ORDER BY r.role_name) AS roles
    FROM media m JOIN media_cast_crew mc USING(title_id) JOIN role r USING(role_id)
    LEFT JOIN movie mo USING(title_id) LEFT JOIN series s USING(title_id)
    WHERE mc.cast_crew_id = $1 AND (mo.title_id IS NOT NULL OR s.title_id IS NOT NULL)
    GROUP BY m.title_id, mo.title_id, s.title_id
    ORDER BY COALESCE(mo.release_date, s.first_air_date) DESC NULLS LAST, m.title, m.title_id`;
