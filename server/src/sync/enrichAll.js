const queries = require('./enrichAll.queries');
require("../config/env");

const pool = require("../config/db");
const tmdb = require("../services/tmdb.service");

const delay = (milliseconds) => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

async function linkPerson(titleId, person, roleType) {
  const result = await pool.write(
    queries.insertCastCrew,
    [person.id, person.name, person.profile_path || null],
  );

  const roleResult = await pool.write(
    queries.insertRole,
    [roleType],
  );

  await pool.write(
    queries.insertMediaCastCrew,
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
    const result = await pool.write(
      queries.insertProductionHouse,
      [
        company.id,
        company.name,
        company.origin_country || null,
        company.logo_path || null,
      ],
    );

    await pool.write(
      queries.insertMediaCompany,
      [titleId, result.rows[0].company_id],
    );
  }
}

async function enrichMovie(titleId, tmdbId) {
  const { data } = await tmdb.get(`/movie/${tmdbId}`, {
    params: { append_to_response: "credits" },
  });

  await pool.write(
    queries.updateMedia,
    [data.budget || null, titleId],
  );
  await pool.write(
    queries.updateMovie,
    [data.runtime || null, data.revenue || null, titleId],
  );
  await linkCastAndCompanies(titleId, data.credits, data.production_companies);

  console.log(`Enriched movie: ${data.title}`);
}

async function upsertSeasonAndEpisodes(titleId, tmdbId, seasonSummary) {
  const seasonResult = await pool.write(
    queries.insertSeason,
    [titleId, seasonSummary.season_number],
  );
  const seasonId = seasonResult.rows[0].season_id;
  const { data } = await tmdb.get(
    `/tv/${tmdbId}/season/${seasonSummary.season_number}`,
  );

  for (const episode of data.episodes || []) {
    await pool.write(
      queries.insertEpisode,
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
    params: { append_to_response: "credits" },
  });

  await pool.write(
    queries.updateSeries,
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
      queries.moviesToEnrich,
    );
    await enrichRows(movies.rows, enrichMovie);

    const shows = await pool.query(
      queries.seriesToEnrich,
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
