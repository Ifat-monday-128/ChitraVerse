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


// SQL for services/media.service.js. Values are bound by the caller.

exports.home = `SELECT ${columns} ${joins}
    WHERE ${hollywood}
    ORDER BY (m.poster IS NOT NULL AND m.trailer_link IS NOT NULL) DESC,
      m.tmdb_rating DESC NULLS LAST, m.title_id LIMIT 13`;

exports.featuredTitleIds = 'SELECT title_id FROM homepage_feature ORDER BY position';

exports.countMatches = (score, source) => `SELECT COUNT(*)::int AS total FROM (SELECT ${score} AS relevance ${source}) matches`;

exports.matchingTitles = (columns, score, source, order, limitParam, offsetParam) => `SELECT ${columns}, ${score} AS relevance ${source}
    ORDER BY ${order}, m.title_id
    LIMIT ${limitParam} OFFSET ${offsetParam}`;

exports.titleDetails = `SELECT
       m.*,
       ratings.chitraverse_rating,
       ratings.chitraverse_vote_count
     FROM media m
     LEFT JOIN media_rating_summary ratings ON ratings.title_id = m.title_id
     WHERE m.title_id = $1`;

exports.movieDetails = `SELECT * FROM movie WHERE title_id = $1`;

exports.seriesDetails = `SELECT * FROM series WHERE title_id = $1`;

exports.titleGenres = `SELECT g.genre_id, g.name
       FROM genre g
       JOIN media_genre mg ON mg.genre_id = g.genre_id
       WHERE mg.title_id = $1
       ORDER BY g.name`;

exports.titleCredits = `SELECT
         c.cast_crew_id,
         c.name,
         c.photo,
         r.role_name AS role_type, mcc.character_name, mcc.display_order
       FROM cast_crew c
       JOIN media_cast_crew mcc ON mcc.cast_crew_id = c.cast_crew_id
       JOIN role r ON r.role_id = mcc.role_id
       WHERE mcc.title_id = $1
       ORDER BY mcc.display_order, r.role_name, c.name`;

exports.titleCompanies = `SELECT p.company_id, p.name, p.country, p.logo
       FROM production_house p
       JOIN media_company mc ON mc.company_id = p.company_id
       WHERE mc.title_id = $1
       ORDER BY p.name`;

exports.titleSeasons = `SELECT season_id, season_number, total_episode
       FROM season_episode_summary
       WHERE title_id = $1
       ORDER BY season_number`;

exports.seasonEpisodes = `SELECT e.ep_id, e.title, e.episode_number, e.runtime, e.air_date
     FROM episode e
     JOIN season s ON s.season_id = e.season_id
     WHERE s.title_id = $1 AND s.season_number = $2
     ORDER BY e.episode_number`;

exports.browse = ({ type, collection, limit, offset, q = "", companyId, watchlistUser, ...filters }) => {
  const values = [];
  const bind = (value) => { values.push(value); return `$${values.length}`; };
  const conditions = ["(mo.title_id IS NOT NULL OR s.title_id IS NOT NULL)"];
  if (type === "movie") conditions.push("mo.title_id IS NOT NULL");
  if (type === "series") conditions.push("s.title_id IS NOT NULL");
  if (collection === "hollywood") conditions.push(hollywood);
  conditions.push(...require('./search-filters.queries').conditions(filters, bind));
  if (companyId) conditions.push(`EXISTS(SELECT 1 FROM media_company mc WHERE mc.title_id=m.title_id AND mc.company_id=${bind(companyId)})`);
  if (watchlistUser) conditions.push(`EXISTS(SELECT 1 FROM watchlist_item wi JOIN watchlist w USING(watchlist_id) WHERE wi.title_id=m.title_id AND w.user_id=${bind(watchlistUser)})`);
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
  const count = { text: exports.countMatches(score, source), values: [...values] };
  // Hash the stable title ID with one seed for the whole browsing visit.
  // ORDER BY random() would reshuffle each page and repeat or skip titles.
  const seed = filters.sort === 'random' ? filters.seed || require('node:crypto').randomBytes(16).toString('hex') : undefined;
  const order = seed ? `md5(m.title_id::text || ':' || ${bind(seed)}::text)` : require('./search-filters.queries').order(filters.sort);
  const limitParam = bind(limit);
  const offsetParam = bind(offset);
  const items = { text: exports.matchingTitles(columns, score, source, order, limitParam, offsetParam), values };
  return { count, items, seed };
};

