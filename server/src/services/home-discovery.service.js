const pool = require('../config/db');

exports.releases = async (date) => {
  const { rows } = await pool.query(`WITH releases AS (
    SELECT title_id,release_date AS released_on,'movie' AS media_type FROM movie
    UNION ALL
    SELECT title_id,first_air_date AS released_on,'series' AS media_type FROM series
  ) SELECT m.title_id,m.title,m.poster,m.tmdb_rating,r.media_type,
    to_char(r.released_on,'YYYY-MM-DD') AS release_date
    FROM releases r JOIN media m USING(title_id)
    WHERE EXTRACT(MONTH FROM r.released_on)=EXTRACT(MONTH FROM $1::date)
      AND EXTRACT(DAY FROM r.released_on)=EXTRACT(DAY FROM $1::date)
      AND r.released_on <= $1::date
    ORDER BY r.released_on DESC,m.title,m.title_id`, [date]);
  return { date, items: rows };
};

exports.interests = async () => {
  const { rows } = await pool.query(`WITH ranked AS (
    SELECT g.genre_id, g.name, m.title_id, m.title, m.poster,
      ROW_NUMBER() OVER (PARTITION BY g.genre_id ORDER BY
        (m.poster IS NOT NULL) DESC, m.tmdb_rating DESC NULLS LAST, m.title_id) AS position
    FROM genre g JOIN media_genre mg USING(genre_id) JOIN media m USING(title_id)
    WHERE EXISTS (SELECT 1 FROM movie mo WHERE mo.title_id = m.title_id)
      OR EXISTS (SELECT 1 FROM series s WHERE s.title_id = m.title_id)
  ) SELECT genre_id, name, COUNT(*)::int AS title_count,
    COALESCE(json_agg(json_build_object('title', title, 'poster', poster) ORDER BY position)
      FILTER (WHERE position <= 3 AND poster IS NOT NULL), '[]'::json) AS artwork
    FROM ranked GROUP BY genre_id, name
    ORDER BY title_count DESC, name, genre_id`);
  return { items: rows };
};

exports.boxOffice = async () => {
  const { rows } = await pool.query(`SELECT m.title_id, m.title, m.poster, m.description,
    m.tmdb_rating, m.budget, mo.runtime, mo.box_office_gross,
    to_char(mo.release_date, 'YYYY-MM-DD') AS release_date, 'movie' AS media_type
    FROM movie mo JOIN media m USING(title_id)
    WHERE mo.box_office_gross > 0
    ORDER BY mo.box_office_gross DESC, m.title_id LIMIT 10`);
  return { items: rows, territory: 'worldwide', period: 'lifetime', currency: 'USD' };
};

exports.birthdays = async (date) => {
  const { rows } = await pool.query(`SELECT c.cast_crew_id, c.name, c.photo,
    to_char(c.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
    COALESCE(array_agg(DISTINCT r.role_name ORDER BY r.role_name)
      FILTER (WHERE r.role_name IS NOT NULL), ARRAY[]::varchar[]) AS roles
    FROM cast_crew c
    LEFT JOIN media_cast_crew mc USING(cast_crew_id)
    LEFT JOIN role r USING(role_id)
    WHERE EXTRACT(MONTH FROM c.date_of_birth) = EXTRACT(MONTH FROM $1::date)
      AND EXTRACT(DAY FROM c.date_of_birth) = EXTRACT(DAY FROM $1::date)
      AND c.date_of_birth <= $1::date
    GROUP BY c.cast_crew_id
    ORDER BY (c.photo IS NOT NULL) DESC, COUNT(DISTINCT mc.title_id) DESC,
      c.name, c.cast_crew_id`, [date]);
  return { date, items: rows };
};
