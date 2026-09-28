const queries = require('../queries/media-details.queries');
const pool = require("../config/db");

exports.getHome = async () => {
  const { rows } = await pool.query(queries.home);
  const chosen = await pool.query(queries.featuredTitleIds);
  const featuredItems = (await Promise.all((chosen.rows.length ? chosen.rows : rows.slice(0, 1)).map(item => exports.getDetails(item.title_id)))).filter(Boolean);
  return { featured: featuredItems[0] || null, featuredItems, items: rows.slice(1) };
};

exports.browse = async (options) => {
  const { count, items, seed } = queries.browse(options);
  const { rows: totals } = await pool.query(count);
  const { rows } = await pool.query(items);
  return { items: rows, total: totals[0].total, hasMore: options.offset + rows.length < totals[0].total, query: options.q || '', ...(seed ? { seed } : {}) };
};

exports.getDetails = async (titleId) => {
  const base = await pool.query(
    queries.titleDetails,
    [titleId],
  );
  if (!base.rowCount) return null;

  const media = base.rows[0];
  const [movie, series, genres, cast, companies] = await Promise.all([
    pool.query(queries.movieDetails, [titleId]),
    pool.query(queries.seriesDetails, [titleId]),
    pool.query(
      queries.titleGenres,
      [titleId],
    ),
    pool.query(
      queries.titleCredits,
      [titleId],
    ),
    pool.query(
      queries.titleCompanies,
      [titleId],
    ),
  ]);

  if (movie.rowCount) {
    Object.assign(media, movie.rows[0], { media_type: "movie" });
  } else if (series.rowCount) {
    Object.assign(media, series.rows[0], { media_type: "series" });
    const seasons = await pool.query(
      queries.titleSeasons,
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
    queries.seasonEpisodes,
    [titleId, seasonNumber],
  );

  return result.rows;
};
