const pool = require("../config/db");

exports.getHome = async (limit = 20) => {
  const result = await pool.query(
    `SELECT
       m.title_id,
       m.tmdb_id,
       m.title,
       m.poster,
       m.tmdb_rating,
       ratings.chitraverse_rating,
       ratings.chitraverse_vote_count,
       CASE
         WHEN mo.title_id IS NOT NULL THEN 'movie'
         WHEN s.title_id IS NOT NULL THEN 'series'
       END AS media_type
     FROM media m
     LEFT JOIN movie mo ON mo.title_id = m.title_id
     LEFT JOIN series s ON s.title_id = m.title_id
     LEFT JOIN media_rating_summary ratings ON ratings.title_id = m.title_id
     ORDER BY m.tmdb_rating DESC NULLS LAST
     LIMIT $1`,
    [limit],
  );

  return result.rows;
};

exports.getDetails = async (titleId) => {
  const base = await pool.query(
    `SELECT
       m.*,
       ratings.chitraverse_rating,
       ratings.chitraverse_vote_count
     FROM media m
     LEFT JOIN media_rating_summary ratings ON ratings.title_id = m.title_id
     WHERE m.title_id = $1`,
    [titleId],
  );
  if (!base.rowCount) return null;

  const media = base.rows[0];
  const [movie, series, genres, cast, companies] = await Promise.all([
    pool.query(`SELECT * FROM movie WHERE title_id = $1`, [titleId]),
    pool.query(`SELECT * FROM series WHERE title_id = $1`, [titleId]),
    pool.query(
      `SELECT g.genre_id, g.name
       FROM genre g
       JOIN media_genre mg ON mg.genre_id = g.genre_id
       WHERE mg.title_id = $1
       ORDER BY g.name`,
      [titleId],
    ),
    pool.query(
      `SELECT
         c.cast_crew_id,
         c.name,
         c.photo,
         r.role_name AS role_type
       FROM cast_crew c
       JOIN media_cast_crew mcc ON mcc.cast_crew_id = c.cast_crew_id
       JOIN role r ON r.role_id = mcc.role_id
       WHERE mcc.title_id = $1
       ORDER BY r.role_name, c.name`,
      [titleId],
    ),
    pool.query(
      `SELECT p.company_id, p.name, p.country, p.logo
       FROM production_house p
       JOIN media_company mc ON mc.company_id = p.company_id
       WHERE mc.title_id = $1
       ORDER BY p.name`,
      [titleId],
    ),
  ]);

  if (movie.rowCount) {
    Object.assign(media, movie.rows[0], { media_type: "movie" });
  } else if (series.rowCount) {
    Object.assign(media, series.rows[0], { media_type: "series" });
    const seasons = await pool.query(
      `SELECT season_id, season_number, total_episode
       FROM season_episode_summary
       WHERE title_id = $1
       ORDER BY season_number`,
      [titleId],
    );
    media.seasons = seasons.rows;
  }

  media.genres = genres.rows;
  media.cast_crew = cast.rows;
  media.production_companies = companies.rows;
  return media;
};

exports.getEpisodes = async (titleId, seasonNumber) => {
  const result = await pool.query(
    `SELECT e.ep_id, e.title, e.episode_number, e.runtime, e.air_date
     FROM episode e
     JOIN season s ON s.season_id = e.season_id
     WHERE s.title_id = $1 AND s.season_number = $2
     ORDER BY e.episode_number`,
    [titleId, seasonNumber],
  );

  return result.rows;
};
