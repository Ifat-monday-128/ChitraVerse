require("../config/env");

const pool = require("../config/db");
const tmdb = require("../services/tmdb.service");

const delay = (milliseconds) => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

function trailerKey(videos = []) {
  return videos.find(
    (video) => video.site === "YouTube" && video.type === "Trailer",
  )?.key || null;
}

async function linkPerson(titleId, person, roleType) {
  const result = await pool.query(
    `INSERT INTO cast_crew (tmdb_id, name, photo)
     VALUES ($1, $2, $3)
     ON CONFLICT (tmdb_id)
     DO UPDATE SET name = EXCLUDED.name, photo = EXCLUDED.photo
     RETURNING cast_crew_id`,
    [person.id, person.name, person.profile_path || null],
  );

  const roleResult = await pool.query(
    `INSERT INTO role (role_name)
     VALUES ($1)
     ON CONFLICT (role_name)
     DO UPDATE SET role_name = EXCLUDED.role_name
     RETURNING role_id`,
    [roleType],
  );

  await pool.query(
    `INSERT INTO media_cast_crew (title_id, cast_crew_id, role_id)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [
      titleId,
      result.rows[0].cast_crew_id,
      roleResult.rows[0].role_id,
    ],
  );
}

async function linkCastAndCompanies(titleId, credits = {}, companies = []) {
  for (const person of (credits.cast || []).slice(0, 15)) {
    await linkPerson(titleId, person, "Actor");
  }

  for (const person of credits.crew || []) {
    if (!["Director", "Writer", "Screenplay"].includes(person.job)) continue;
    await linkPerson(titleId, person, person.job);
  }

  for (const company of companies) {
    const result = await pool.query(
      `INSERT INTO production_house (tmdb_id, name, country, logo)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tmdb_id)
       DO UPDATE SET
         name = EXCLUDED.name,
         country = EXCLUDED.country,
         logo = EXCLUDED.logo
       RETURNING company_id`,
      [
        company.id,
        company.name,
        company.origin_country || null,
        company.logo_path || null,
      ],
    );

    await pool.query(
      `INSERT INTO media_company (title_id, company_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [titleId, result.rows[0].company_id],
    );
  }
}

async function enrichMovie(titleId, tmdbId) {
  const { data } = await tmdb.get(`/movie/${tmdbId}`, {
    params: { append_to_response: "credits,videos" },
  });

  await pool.query(
    `UPDATE media
     SET budget = $1, trailer_link = $2
     WHERE title_id = $3`,
    [data.budget || null, trailerKey(data.videos?.results), titleId],
  );
  await pool.query(
    `UPDATE movie
     SET runtime = $1, box_office_gross = $2
     WHERE title_id = $3`,
    [data.runtime || null, data.revenue || null, titleId],
  );
  await linkCastAndCompanies(titleId, data.credits, data.production_companies);

  console.log(`Enriched movie: ${data.title}`);
}

async function upsertSeasonAndEpisodes(titleId, tmdbId, seasonSummary) {
  const seasonResult = await pool.query(
    `INSERT INTO season (title_id, season_number)
     VALUES ($1, $2)
     ON CONFLICT (title_id, season_number)
     DO UPDATE SET season_number = EXCLUDED.season_number
     RETURNING season_id`,
    [titleId, seasonSummary.season_number],
  );
  const seasonId = seasonResult.rows[0].season_id;
  const { data } = await tmdb.get(
    `/tv/${tmdbId}/season/${seasonSummary.season_number}`,
  );

  for (const episode of data.episodes || []) {
    await pool.query(
      `INSERT INTO episode
         (season_id, title, episode_number, runtime, air_date)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (season_id, episode_number)
       DO UPDATE SET
         title = EXCLUDED.title,
         runtime = EXCLUDED.runtime,
         air_date = EXCLUDED.air_date`,
      [
        seasonId,
        episode.name,
        episode.episode_number,
        episode.runtime ?? null,
        episode.air_date || null,
      ],
    );
  }
}

async function enrichTV(titleId, tmdbId) {
  const { data } = await tmdb.get(`/tv/${tmdbId}`, {
    params: { append_to_response: "credits,videos" },
  });

  await pool.query(
    `UPDATE media SET trailer_link = $1 WHERE title_id = $2`,
    [trailerKey(data.videos?.results), titleId],
  );
  await pool.query(
    `UPDATE series
     SET status = $1, last_air_date = $2
     WHERE title_id = $3`,
    [data.status || null, data.last_air_date || null, titleId],
  );

  for (const season of data.seasons || []) {
    if (season.season_number === 0) continue;
    await upsertSeasonAndEpisodes(titleId, tmdbId, season);
    await delay(120);
  }

  await linkCastAndCompanies(titleId, data.credits, data.production_companies);
  console.log(`Enriched TV show: ${data.name}`);
}

async function enrichRows(rows, enrich) {
  for (const row of rows) {
    try {
      await enrich(row.title_id, row.tmdb_id);
    } catch (error) {
      console.error(
        `Could not enrich TMDB ID ${row.tmdb_id}:`,
        error.response?.data || error.message,
      );
    }
    await delay(120);
  }
}

async function main() {
  try {
    const movies = await pool.query(
      `SELECT media.title_id, media.tmdb_id
       FROM media
       JOIN movie ON movie.title_id = media.title_id
       WHERE media.tmdb_id IS NOT NULL`,
    );
    await enrichRows(movies.rows, enrichMovie);

    const shows = await pool.query(
      `SELECT media.title_id, media.tmdb_id
       FROM media
       JOIN series ON series.title_id = media.title_id
       WHERE media.tmdb_id IS NOT NULL`,
    );
    await enrichRows(shows.rows, enrichTV);

    console.log("TMDB enrichment complete");
  } catch (error) {
    console.error("Enrichment failed:", error.response?.data || error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
