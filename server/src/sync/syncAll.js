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
    await pool.query(
      `INSERT INTO genre (tmdb_id, name)
       VALUES ($1, $2)
       ON CONFLICT (tmdb_id)
       DO UPDATE SET name = EXCLUDED.name`,
      [tmdbId, name],
    );
  }

  console.log(`Genres synced: ${genres.size}`);
}

async function upsertMedia(item, type) {
  const isMovie = type === "movie";
  const result = await pool.query(
    `INSERT INTO media (tmdb_id, title, description, language, poster, tmdb_rating)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tmdb_id)
     DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       language = EXCLUDED.language,
       poster = EXCLUDED.poster,
       tmdb_rating = EXCLUDED.tmdb_rating
     RETURNING title_id`,
    [
      item.id,
      isMovie ? item.title : item.name,
      item.overview || null,
      item.original_language || null,
      item.poster_path || null,
      item.vote_average ?? null,
    ],
  );

  return result.rows[0].title_id;
}

async function linkGenres(titleId, genreIds = []) {
  for (const tmdbGenreId of genreIds) {
    await pool.query(
      `INSERT INTO media_genre (title_id, genre_id)
       SELECT $1, genre_id FROM genre WHERE tmdb_id = $2
       ON CONFLICT DO NOTHING`,
      [titleId, tmdbGenreId],
    );
  }
}

async function syncMovies() {
  for (let page = 1; page <= pageCount; page += 1) {
    const { data } = await tmdb.get("/movie/popular", { params: { page } });

    for (const movie of data.results) {
      const titleId = await upsertMedia(movie, "movie");
      await pool.query(
        `INSERT INTO movie (title_id, release_date)
         VALUES ($1, $2)
         ON CONFLICT (title_id)
         DO UPDATE SET release_date = EXCLUDED.release_date`,
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
      await pool.query(
        `INSERT INTO series (title_id, first_air_date)
         VALUES ($1, $2)
         ON CONFLICT (title_id)
         DO UPDATE SET first_air_date = EXCLUDED.first_air_date`,
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
