const queries = require('./syncAll.queries');
require("../config/env");

const pool = require("../config/db");
const tmdb = require("../services/tmdb.service");

const requestedPages = Number.parseInt(process.env.TMDB_SYNC_PAGES || "5", 10);
const pageCount = Number.isInteger(requestedPages) && requestedPages > 0
  ? Math.min(requestedPages, 500)
  : 5;

async function syncGenres() {
  const [movieResponse, tvResponse] = await Promise.all([
    tmdb.get("/genre/movie/list"),
    tmdb.get("/genre/tv/list"),
  ]);

  const genres = new Map();
  for (const genre of [...movieResponse.data.genres, ...tvResponse.data.genres]) {
    genres.set(genre.id, genre.name);
  }

  for (const [tmdbId, name] of genres) {
    await pool.write(
      queries.insertGenre,
      [tmdbId, name],
    );
  }

  console.log(`Genres synced: ${genres.size}`);
}

async function upsertMedia(item, type) {
  const isMovie = type === "movie";
  const result = await pool.write(
    queries.insertMedia,
    [
      item.id,
      isMovie ? item.title : item.name,
      item.overview || null,
      item.original_language || null,
      item.poster_path || null,
      item.vote_average ?? null,
      type,
    ],
  );

  return result.rows[0].title_id;
}

async function linkGenres(titleId, genreIds = []) {
  for (const tmdbGenreId of genreIds) {
    await pool.write(
      queries.insertMediaGenre,
      [titleId, tmdbGenreId],
    );
  }
}

async function syncMovies() {
  for (let page = 1; page <= pageCount; page += 1) {
    const { data } = await tmdb.get("/movie/popular", { params: { page } });

    for (const movie of data.results) {
      const titleId = await upsertMedia(movie, "movie");
      await pool.write(
        queries.insertMovie,
        [titleId, movie.release_date || null],
      );
      await linkGenres(titleId, movie.genre_ids);
    }

    console.log(`Movies page ${page}/${pageCount} synced`);
  }
}

async function syncTV() {
  for (let page = 1; page <= pageCount; page += 1) {
    const { data } = await tmdb.get("/tv/popular", { params: { page } });

    for (const show of data.results) {
      const titleId = await upsertMedia(show, "tv");
      await pool.write(
        queries.insertSeries,
        [titleId, show.first_air_date || null],
      );
      await linkGenres(titleId, show.genre_ids);
    }

    console.log(`TV page ${page}/${pageCount} synced`);
  }
}

async function main() {
  try {
    await syncGenres();
    await syncMovies();
    await syncTV();
    console.log("TMDB base sync complete");
  } catch (error) {
    console.error("Sync failed:", error.response?.data || error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
