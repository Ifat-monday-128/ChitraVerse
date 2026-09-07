const pool = require("../config/db");

const columns = `m.title_id, m.title, m.description, m.language, m.poster,
  m.tmdb_rating, m.trailer_link, mo.runtime,
  COALESCE(mo.release_date, s.first_air_date) AS release_date,
  CASE WHEN mo.title_id IS NOT NULL THEN 'movie' ELSE 'series' END AS media_type`;
const joins = `FROM media m LEFT JOIN movie mo USING(title_id) LEFT JOIN series s USING(title_id)`;
const hollywood = `mo.title_id IS NOT NULL AND m.language = 'en' AND EXISTS (
  SELECT 1 FROM media_company mc JOIN production_house ph USING(company_id)
  WHERE mc.title_id = m.title_id AND ph.country = 'US')`;
const vector = `(setweight(to_tsvector('simple', coalesce(m.title, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(m.description, '')), 'D'))`;
const escapeLike = (value) => value.replace(/[\\%_]/g, "\\$&");

exports.getHome = async () => {
  const { rows } = await pool.query(`SELECT ${columns} ${joins}
    WHERE ${hollywood}
    ORDER BY (m.poster IS NOT NULL AND m.trailer_link IS NOT NULL) DESC,
      m.tmdb_rating DESC NULLS LAST, m.title_id LIMIT 13`);
  const featured = rows.length ? await exports.getDetails(rows[0].title_id) : null;
  return { featured, items: rows.slice(1) };
};

exports.browse = async ({ type, collection, limit, offset, q = "" }) => {
  const values = [];
  const bind = (value) => { values.push(value); return `$${values.length}`; };
  const conditions = ["(mo.title_id IS NOT NULL OR s.title_id IS NOT NULL)"];
  if (type === "movie") conditions.push("mo.title_id IS NOT NULL");
  if (type === "series") conditions.push("s.title_id IS NOT NULL");
  if (collection === "hollywood") conditions.push(hollywood);
  let score = "0";
  let searchJoins = "";
  if (q) {
    const query = bind(q.toLowerCase());
    const prefix = bind(`${escapeLike(q.toLowerCase())}%`);
    const contains = bind(`%${escapeLike(q.toLowerCase())}%`);
    const tsquery = `websearch_to_tsquery('simple', ${query})`;
    // Rank exact titles above prefixes, title text matches, cast names and synopsis.
    searchJoins = `LEFT JOIN (
      SELECT credits.title_id, MAX(CASE WHEN lower(c.name) = ${query} THEN 1.0
        WHEN lower(c.name) LIKE ${contains} THEN 0.8
        ELSE similarity(lower(c.name), ${query}) END) AS rank
      FROM media_cast_crew credits JOIN cast_crew c USING(cast_crew_id)
      JOIN role r USING(role_id)
      WHERE r.role_name = 'Actor'
        AND (lower(c.name) LIKE ${contains} OR (length(${query}) >= 3 AND lower(c.name) % ${query}))
      GROUP BY credits.title_id
    ) actor ON actor.title_id = m.title_id`;
    const titleMatch = `to_tsvector('simple', coalesce(m.title, '')) @@ ${tsquery}`;
    conditions.push(`(lower(m.title) LIKE ${contains} OR ${vector} @@ ${tsquery}
      OR (length(${query}) >= 3 AND lower(m.title) % ${query}) OR actor.rank IS NOT NULL)`);
    score = `(CASE WHEN lower(m.title) = ${query} THEN 1000 ELSE 0 END
      + CASE WHEN lower(m.title) LIKE ${prefix} THEN 500 ELSE 0 END
      + CASE WHEN ${titleMatch} THEN 200 ELSE 0 END
      + CASE WHEN lower(m.title) LIKE ${contains} THEN 100 ELSE 0 END
      + coalesce(actor.rank, 0) * 70 + similarity(lower(m.title), ${query}) * 50
      + ts_rank_cd(${vector}, ${tsquery}) * 20)`;
  }
  const source = `${joins} ${searchJoins} WHERE ${conditions.join(" AND ")}`;
  const { rows: count } = await pool.query(`SELECT COUNT(*)::int AS total FROM (SELECT ${score} AS relevance ${source}) matches`, values);
  const limitParam = bind(limit);
  const offsetParam = bind(offset);
  const { rows } = await pool.query(`SELECT ${columns}, ${score} AS relevance ${source}
    ORDER BY relevance DESC, m.tmdb_rating DESC NULLS LAST, m.title_id
    LIMIT ${limitParam} OFFSET ${offsetParam}`, values);
  return { items: rows, total: count[0].total, hasMore: offset + rows.length < count[0].total, query: q };
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
