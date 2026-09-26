const pool = require('../config/db');

function parseLink(value) {
  try {
    if (typeof value !== 'string' || value.length > 2000) throw new Error();
    const url = new URL(value.trim());
    const match = url.pathname.match(/^\/(movie|tv)\/([1-9]\d*)(?:-[^/]*)?\/?$/);
    if (url.protocol !== 'https:' || !['www.themoviedb.org','themoviedb.org'].includes(url.hostname) ||
        url.port || url.username || url.password || !match || Number(match[2]) > 2147483647) throw new Error();
    return { type: match[1], id: Number(match[2]) };
  } catch { throw Object.assign(new Error('Paste a valid https://www.themoviedb.org/movie/... or /tv/... link.'), { status: 400 }); }
}

async function mapLimited(items, work) {
  const results = new Array(items.length);
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (index < items.length) { const i = index++; results[i] = await work(items[i]); }
  }));
  return results;
}

async function importTitle(link, progress = () => {}, fetchData) {
  const { type, id } = parseLink(link);
  const deadline = Date.now() + 10 * 60 * 1000;
  const get = fetchData || (async (path, params) => {
    if (Date.now() > deadline) throw new Error('Import timed out. Please try again.');
    const tmdb = require('./tmdb.service');
    for (let attempt = 0; ; attempt++) {
      try { return (await tmdb.get(path, { params })).data; }
      catch (error) {
        if (error.response?.status !== 429 || attempt >= 3) throw error;
        await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
      }
    }
  });
  progress('Fetching title, genres, companies, trailer and streaming availability…');
  const data = await get(`/${type}/${id}`, { append_to_response: `${type === 'tv' ? 'aggregate_credits' : 'credits'},videos,watch/providers` });
  const sourceCredits = data.aggregate_credits || data.credits || {};
  const credits = [...(sourceCredits.cast || []).map(person => ({ ...person, job: 'Actor' })),
    ...(sourceCredits.crew || []).flatMap(person => person.jobs?.length
      ? person.jobs.map(job => ({ ...person, job: job.job })) : [person])];
  const people = [...new Map(credits.map(person => [person.id, person])).values()];
  let completed = 0;
  const profiles = await mapLimited(people, async person => {
    const profile = await get(`/person/${person.id}`);
    progress(`Fetching cast and crew profiles: ${++completed}/${people.length}`);
    return profile;
  });
  completed = 0;
  const seasons = type === 'tv' ? await mapLimited(data.seasons || [], async season => {
    const result = await get(`/tv/${id}/season/${season.season_number}`);
    progress(`Fetching seasons and episodes: ${++completed}/${data.seasons.length}`);
    return result;
  }) : [];
  const region = (process.env.TMDB_WATCH_REGION || 'BD').toUpperCase();
  const offers = data['watch/providers']?.results?.[region] || {};
  const providers = [...new Map(['flatrate','free','ads','rent','buy'].flatMap(kind => offers[kind] || []).map(provider => [provider.provider_id, provider])).values()];
  const trailer = (data.videos?.results || []).filter(video => video.site === 'YouTube' && video.type === 'Trailer' && /^[A-Za-z0-9_-]{11}$/.test(video.key))
    .sort((a,b) => Number(Boolean(b.official)) - Number(Boolean(a.official)))[0];
  progress('Saving the complete title…');
  const result = await pool.withTransaction(async client => {
    // Serialize catalog imports, including shared people, genres and providers.
    await client.query('SELECT pg_advisory_xact_lock(216,1)');
    const previous = await client.query(`SELECT m.title_id FROM media m WHERE
      (tmdb_id=$1 AND tmdb_type=$2) OR (tmdb_id=$1 AND tmdb_type IS NULL AND
      EXISTS(SELECT 1 FROM ${type === 'movie' ? 'movie' : 'series'} t WHERE t.title_id=m.title_id)) OR
      ($2='tv' AND tmdb_id=-$1 AND EXISTS(SELECT 1 FROM series s WHERE s.title_id=m.title_id)) FOR UPDATE`, [id,type]);
    const existingId = previous.rows[0]?.title_id;
    const values = [id,type,data.title || data.name,data.overview || null,data.original_language || null,data.poster_path || null,
      data.vote_average ?? null,data.budget ?? null,trailer ? `watch?v=${trailer.key}` : null];
    const saved = existingId
      ? await client.query(`UPDATE media SET tmdb_id=$1,tmdb_type=$2,title=$3,description=$4,language=$5,poster=$6,tmdb_rating=$7,budget=$8,trailer_link=COALESCE($9,trailer_link) WHERE title_id=$10 RETURNING title_id`, [...values,existingId])
      : await client.query(`INSERT INTO media(tmdb_id,tmdb_type,title,description,language,poster,tmdb_rating,budget,trailer_link) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING title_id`,values);
    const titleId = saved.rows[0].title_id;
    if (type === 'movie') await client.query(`INSERT INTO movie(title_id,runtime,release_date,box_office_gross) VALUES($1,$2,$3,$4)
      ON CONFLICT(title_id) DO UPDATE SET runtime=EXCLUDED.runtime,release_date=EXCLUDED.release_date,box_office_gross=EXCLUDED.box_office_gross`, [titleId,data.runtime || null,data.release_date || null,data.revenue ?? null]);
    else await client.query(`INSERT INTO series(title_id,status,first_air_date,last_air_date) VALUES($1,$2,$3,$4)
      ON CONFLICT(title_id) DO UPDATE SET status=EXCLUDED.status,first_air_date=EXCLUDED.first_air_date,last_air_date=EXCLUDED.last_air_date`, [titleId,data.status || null,data.first_air_date || null,data.last_air_date || null]);
    // Refresh imported memberships; preserve user-authored data and title IDs.
    for (const table of ['media_genre','media_cast_crew','media_company','media_platform']) await client.query(`DELETE FROM ${table} WHERE title_id=$1`,[titleId]);
    for (const genre of data.genres || []) {
      const { rows: [row] } = await client.query(`INSERT INTO genre(tmdb_id,name) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET tmdb_id=COALESCE(genre.tmdb_id,EXCLUDED.tmdb_id) RETURNING genre_id`,[genre.id,genre.name]);
      await client.query('INSERT INTO media_genre VALUES($1,$2) ON CONFLICT DO NOTHING',[titleId,row.genre_id]);
    }
    const personIds = new Map();
    for (const person of profiles) {
      const { rows: [row] } = await client.query(`INSERT INTO cast_crew(tmdb_id,name,biography,photo,date_of_birth) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(tmdb_id) DO UPDATE SET name=EXCLUDED.name,biography=EXCLUDED.biography,photo=EXCLUDED.photo,date_of_birth=EXCLUDED.date_of_birth RETURNING cast_crew_id`,
      [person.id,person.name,person.biography || null,person.profile_path || null,person.birthday || null]);
      personIds.set(person.id,row.cast_crew_id);
    }
    for (const person of credits) {
      const { rows: [role] } = await client.query('INSERT INTO role(role_name) VALUES($1) ON CONFLICT(role_name) DO UPDATE SET role_name=EXCLUDED.role_name RETURNING role_id',[person.job || person.department || 'Crew']);
      await client.query('INSERT INTO media_cast_crew VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[titleId,personIds.get(person.id),role.role_id]);
    }
    for (const company of data.production_companies || []) {
      const { rows: [row] } = await client.query(`INSERT INTO production_house(tmdb_id,name,country,logo) VALUES($1,$2,$3,$4)
        ON CONFLICT(tmdb_id) DO UPDATE SET name=EXCLUDED.name,country=EXCLUDED.country,logo=EXCLUDED.logo RETURNING company_id`,
      [company.id,company.name,company.origin_country || null,company.logo_path || null]);
      await client.query('INSERT INTO media_company VALUES($1,$2) ON CONFLICT DO NOTHING',[titleId,row.company_id]);
    }
    let episodes = 0;
    for (const season of seasons) {
      const { rows: [row] } = await client.query(`INSERT INTO season(title_id,season_number) VALUES($1,$2) ON CONFLICT(title_id,season_number) DO UPDATE SET season_number=EXCLUDED.season_number RETURNING season_id`,[titleId,season.season_number]);
      for (const episode of season.episodes || []) {
        await client.query(`INSERT INTO episode(season_id,title,episode_number,runtime,air_date) VALUES($1,$2,$3,$4,$5)
          ON CONFLICT(season_id,episode_number) DO UPDATE SET title=EXCLUDED.title,runtime=EXCLUDED.runtime,air_date=EXCLUDED.air_date`,
        [row.season_id,episode.name,episode.episode_number,episode.runtime ?? null,episode.air_date || null]); episodes++;
      }
    }
    for (const provider of providers) {
      let { rows: [row] } = await client.query('SELECT platform_id FROM streaming_platform WHERE name=$1 ORDER BY platform_id LIMIT 1',[provider.provider_name]);
      if (!row) ({ rows: [row] } = await client.query('INSERT INTO streaming_platform(name,logo) VALUES($1,$2) RETURNING platform_id',[provider.provider_name,provider.logo_path || null]));
      else await client.query('UPDATE streaming_platform SET logo=$1 WHERE platform_id=$2',[provider.logo_path || null,row.platform_id]);
      await client.query('INSERT INTO media_platform VALUES($1,$2) ON CONFLICT DO NOTHING',[titleId,row.platform_id]);
    }
    return { title_id: titleId, title: data.title || data.name, updated: Boolean(existingId), people: profiles.length, seasons: seasons.length, episodes, genres: (data.genres || []).length, companies: (data.production_companies || []).length, providers: providers.length, region };
  });
  return result;
}
module.exports = { parseLink, importTitle };
