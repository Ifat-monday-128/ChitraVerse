const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
require("../src/config/env");
const { Pool } = require("pg");
const schema = `chitraverse_test_${process.pid}_${Date.now()}`;
const admin = new Pool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, options: "" });
// Every application connection uses an isolated test schema, never the real catalog.
process.env.PGOPTIONS = `-c search_path=${schema},public`;
const pool = require("../src/config/db");
const app = require("../src/app");
const { youtubeId } = require("../src/utils/trailer");
const { chooseTrailer, extractResults } = require("../src/sync/searchTrailers");
let server, base;
const ids = {};

test.before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await pool.query(await fs.readFile(path.resolve(__dirname, "../database/schema.sql"), "utf8"));
  await pool.query(await fs.readFile(path.resolve(__dirname, "../database/migrations/001_search_and_sessions.sql"), "utf8"));
  const current = await pool.query("SELECT current_schema() AS name");
  assert.equal(current.rows[0].name, schema);
  for (const [title, language, type, country] of [
    ["Interstellar", "en", "movie", "US"], ["Interstellar Journey", "en", "movie", "US"],
    ["Bengali Story", "bn", "movie", "BD"], ["British Story", "en", "movie", "GB"],
    ["Space Series", "en", "series", "US"], ["Empty Credits", "en", "movie", null],
  ]) {
    const result = await pool.query("INSERT INTO media(title,language,description,poster,tmdb_rating,trailer_link) VALUES($1,$2,$3,'/test.jpg',8.5,'watch?v=zSWdZVtXT7E') RETURNING title_id", [title, language, `A story about ${title}`]);
    const id = result.rows[0].title_id; ids[title] = id;
    await pool.query(`INSERT INTO ${type}(title_id) VALUES($1)`, [id]);
    if (country) {
      const company = await pool.query("INSERT INTO production_house(name,country) VALUES($1,$2) RETURNING company_id", [`${country} studio`, country]);
      await pool.query("INSERT INTO media_company VALUES($1,$2)", [id, company.rows[0].company_id]);
    }
  }
  const person = await pool.query("INSERT INTO cast_crew(name) VALUES('Test Actress') RETURNING cast_crew_id");
  const role = await pool.query("INSERT INTO role(role_name) VALUES('Actor') RETURNING role_id");
  await pool.query("INSERT INTO media_cast_crew VALUES($1,$2,$3)", [ids["Bengali Story"], person.rows[0].cast_crew_id, role.rows[0].role_id]);
  server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end();
});
async function request(url, options = {}) {
  const response = await fetch(base + url, { ...options, headers: { "Content-Type": "application/json", ...options.headers } });
  return { status: response.status, body: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
}
test("home contains only English movies linked to US companies", async () => {
  const { status, body } = await request("/api/media/home");
  assert.equal(status, 200);
  const titles = [body.featured, ...body.items];
  assert.deepEqual(new Set(titles.map((item) => item.title)), new Set(["Interstellar", "Interstellar Journey"]));
  assert.ok(titles.every((item) => item.language === "en" && item.media_type === "movie"));
});

test("person profiles return photos and deduplicated movie/series credits with validation", async () => {
  const { rows: [person] } = await pool.query("INSERT INTO cast_crew(name, photo, biography, date_of_birth) VALUES('Profile Person', '/portrait.jpg', 'Stored biography', '1980-06-15') RETURNING cast_crew_id");
  const { rows: [role] } = await pool.query("INSERT INTO role(role_name) VALUES('Director') RETURNING role_id");
  const actor = await pool.query("SELECT role_id FROM role WHERE role_name='Actor'");
  for (const title of [ids.Interstellar, ids['Space Series']]) {
    await pool.query('INSERT INTO media_cast_crew VALUES($1,$2,$3)', [title, person.cast_crew_id, role.role_id]);
  }
  await pool.query('INSERT INTO media_cast_crew VALUES($1,$2,$3)', [ids.Interstellar, person.cast_crew_id, actor.rows[0].role_id]);
  const result = await request(`/api/media/people/${person.cast_crew_id}`);
  assert.equal(result.status, 200);
  assert.equal(result.body.photo, '/portrait.jpg');
  assert.equal(result.body.biography, 'Stored biography');
  assert.equal(result.body.date_of_birth, '1980-06-15');
  assert.equal(result.body.age, null); // Unknown life status must not fabricate a current age.
  assert.equal(result.body.filmography.length, 2);
  assert.deepEqual(new Set(result.body.filmography.map(item => item.media_type)), new Set(['movie', 'series']));
  assert.deepEqual(result.body.filmography.find(item => item.title_id === ids.Interstellar).roles, ['Actor', 'Director']);
  for (const invalid of ['0', '-1', 'abc', '1.5', '2147483648']) assert.equal((await request(`/api/media/people/${invalid}`)).status, 400);
  assert.equal((await request('/api/media/people/2147483647')).status, 404);
});

test("ages respect birthdays and age at death", () => {
  const { ageAt } = require('../src/services/person.service');
  assert.equal(ageAt('1980-06-15', '2026-06-14'), 45);
  assert.equal(ageAt('1980-06-15', '2026-06-15'), 46);
  assert.equal(ageAt('1980-06-15', '2020-01-01'), 39);
  assert.equal(ageAt(null), null);
  assert.equal(ageAt('2030-01-01', '2026-01-01'), null);
});

test('advanced title filters combine before pagination and retain stable sorting', async () => {
  const genre=(await pool.query("INSERT INTO genre(name) VALUES('Filter Drama') RETURNING genre_id")).rows[0].genre_id;
  const company=(await pool.query("INSERT INTO production_house(name,country) VALUES('Filter Studio','JP') RETURNING company_id")).rows[0].company_id;
  const created=[];
  for(const [title,type,year,rating,runtime,language,trailer] of [
    ['Filter Alpha','movie',2001,7.5,95,'ja','zSWdZVtXT7E'],
    ['Filter Beta','movie',2015,8.5,150,'ja',null],
    ['Filter Gamma','series',2020,9,null,'en',null],
  ]) {
    const id=(await pool.query('INSERT INTO media(title,language,tmdb_rating,trailer_link) VALUES($1,$2,$3,$4) RETURNING title_id',[title,language,rating,trailer])).rows[0].title_id;
    created.push(id);
    if(type==='movie')await pool.query('INSERT INTO movie(title_id,release_date,runtime) VALUES($1,$2,$3)',[id,`${year}-06-01`,runtime]);
    else await pool.query('INSERT INTO series(title_id,first_air_date) VALUES($1,$2)',[id,`${year}-06-01`]);
    await pool.query('INSERT INTO media_genre VALUES($1,$2)',[id,genre]);
    await pool.query('INSERT INTO media_company VALUES($1,$2)',[id,company]);
  }
  const filters=`genre=${genre}&language=ja&country=JP&year_from=1990&year_to=2018&rating_min=7&rating_max=9&runtime_min=90&runtime_max=160&type=movie&sort=newest`;
  const first=await request(`/api/media/search?${filters}&limit=1`);
  const second=await request(`/api/media/search?${filters}&limit=1&offset=1`);
  assert.equal(first.status,200);assert.equal(first.body.total,2);assert.equal(first.body.hasMore,true);
  assert.equal(first.body.items[0].title_id,created[1]);assert.equal(second.body.items[0].title_id,created[0]);
  assert.equal(second.body.hasMore,false);
  const studio=await request(`/api/media/companies/${company}?${filters}&q=Filter`);
  assert.deepEqual(studio.body.items.map(item=>item.title_id),[created[1],created[0]]);
  assert.deepEqual((await request(`/api/media?genre=${genre}&trailer=yes`)).body.items.map(item=>item.title_id),[created[0]]);
  assert.deepEqual((await request(`/api/media?genre=${genre}&type=series&sort=title_desc`)).body.items.map(item=>item.title_id),[created[2]]);
  for(const sort of ['relevance','rating_desc','rating_asc','newest','oldest','title_asc','title_desc','runtime_asc','runtime_desc']) assert.equal((await request(`/api/media?genre=${genre}&sort=${sort}`)).status,200);
  for(const query of ['year_from=2025&year_to=2000','rating_min=9&rating_max=2','runtime_min=150&runtime_max=20','rating_min=NaN','rating_min=11','genre=1.5','genre=-1','language=en%27','country=USA','trailer=maybe','sort=DROP%20TABLE','sort=x&sort=y']) assert.equal((await request(`/api/media?${query}`)).status,400,query);
  const facets=await request('/api/media/filters');
  assert.equal(facets.status,200);assert.ok(facets.body.genres.some(item=>item.genre_id===genre));assert.ok(facets.body.languages.includes('ja'));assert.ok(facets.body.countries.includes('JP'));
  // Keep existing catalog count assertions independent of these fixtures.
  await pool.query('DELETE FROM media WHERE title_id=ANY($1::int[])',[created]);
});

test('people filters combine role, portrait and birth years without duplicate credits', async () => {
  const person=(await pool.query("INSERT INTO cast_crew(name,photo,date_of_birth) VALUES('Filter Person','/face.jpg','1985-04-01') RETURNING cast_crew_id")).rows[0].cast_crew_id;
  const role=(await pool.query("SELECT role_id FROM role WHERE role_name='Actor'")).rows[0].role_id;
  for(const title of [ids.Interstellar,ids['Space Series']])await pool.query('INSERT INTO media_cast_crew VALUES($1,$2,$3)',[title,person,role]);
  const result=await request(`/api/media/people?q=Filter%20Person&role=${role}&photo=yes&born_from=1980&born_to=1990&sort=birth_desc`);
  assert.equal(result.status,200);assert.equal(result.body.total,1);assert.equal(result.body.items[0].cast_crew_id,person);
  assert.equal((await request(`/api/media/people?q=Filter%20Person&photo=no`)).body.total,0);
  for(const query of ['role=-1','photo=maybe','born_from=2000&born_to=1900','sort=rating_desc','born_to=abc'])assert.equal((await request(`/api/media/people?${query}`)).status,400);
});

test('legacy title links never fetch missing movies or series from the provider', async (t) => {
  const calls = [];
  t.mock.method(require('../src/services/tmdb.service'), 'get', async path => {
    calls.push(path);
    return { data: { title: path.startsWith('/movie') ? 'External movie' : undefined, name: 'External series', poster_path: '/poster.jpg', overview: 'A synopsis',
      credits: { cast: [{ id: 123, name: 'A person', profile_path: '/person.jpg' }] },
      videos: { results: [{ site: 'YouTube', type: 'Trailer', official: true, key: 'zSWdZVtXT7E' }] },
      seasons: [{ id: 2, name: 'Season 1', episode_count: 8 }] } };
  });
  const movie = await request('/api/media/external/movie/9001');
  const series = await request('/api/media/external/series/9001');
  assert.equal(movie.status, 404); assert.equal(series.status, 404);
  assert.deepEqual(calls, []);
  for (const path of ['person/1', 'movie/0', 'series/nope']) assert.equal((await request(`/api/media/external/${path}`)).status, 400);
});

test("cast directory searches all stored people with stable pagination and photos", async () => {
  await pool.query("INSERT INTO cast_crew(name,photo) VALUES ('Directory Alpha','/alpha.jpg'),('Directory Beta',NULL),('Directory Gamma','/gamma.jpg')");
  const first = await request('/api/media/people?q=directory&limit=2');
  const next = await request('/api/media/people?q=directory&limit=2&offset=2');
  assert.equal(first.status, 200);
  assert.equal(first.body.total, 3);
  assert.equal(first.body.hasMore, true);
  assert.deepEqual(first.body.items.map(person => person.name), ['Directory Alpha', 'Directory Beta']);
  assert.equal(first.body.items[0].photo, '/alpha.jpg');
  assert.equal(first.body.items[1].photo, null);
  assert.equal(next.body.items[0].name, 'Directory Gamma');
  assert.equal(next.body.hasMore, false);
  for (const q of ['%', '_', "x' OR 1=1 --", 'zzzznotaperson']) {
    assert.equal((await request(`/api/media/people?q=${encodeURIComponent(q)}`)).body.total, 0);
  }
  const total = await pool.query('SELECT COUNT(*)::int AS total FROM cast_crew');
  assert.equal((await request('/api/media/people')).body.total, total.rows[0].total);
  for (const query of ['limit=0', 'limit=101', 'offset=-1', 'offset=abc', 'q=' + 'x'.repeat(121), 'q=x&q=y']) {
    assert.equal((await request(`/api/media/people?${query}`)).status, 400);
  }
});

test("production pages return only linked titles, support filters and validate IDs", async () => {
  const { rows: [company] } = await pool.query("INSERT INTO production_house(name,country,logo) VALUES ('Directory Studio','US','/studio.png') RETURNING company_id");
  for (const title of [ids.Interstellar, ids['Space Series']]) await pool.query('INSERT INTO media_company VALUES($1,$2)', [title, company.company_id]);
  const endpoint = `/api/media/companies/${company.company_id}`;
  const first = await request(endpoint + '?limit=1');
  const second = await request(endpoint + '?limit=1&offset=1');
  assert.equal(first.status, 200);
  assert.equal(first.body.company.logo, '/studio.png');
  assert.equal(first.body.total, 2);
  assert.equal(first.body.hasMore, true);
  assert.notEqual(first.body.items[0].title_id, second.body.items[0].title_id);
  assert.equal(second.body.hasMore, false);
  assert.deepEqual((await request(endpoint + '?type=movie')).body.items.map(item => item.title_id), [ids.Interstellar]);
  assert.deepEqual((await request(endpoint + '?type=series')).body.items.map(item => item.title_id), [ids['Space Series']]);
  const empty = await pool.query("INSERT INTO production_house(name) VALUES('Empty studio') RETURNING company_id");
  assert.equal((await request(`/api/media/companies/${empty.rows[0].company_id}`)).body.total, 0);
  for (const id of ['0', 'abc', '-1', '2147483648']) assert.equal((await request(`/api/media/companies/${id}`)).status, 400);
  for (const query of ['type=bad', 'limit=101', 'offset=-1']) assert.equal((await request(endpoint + '?' + query)).status, 400);
  assert.equal((await request('/api/media/companies/2147483647')).status, 404);
});

test("profiles never replace missing stored fields or credits with provider metadata", async (t) => {
  const tmdb = require('../src/services/tmdb.service');
  t.mock.method(tmdb, 'get', async () => ({ data: {
    biography: 'Provider biography', birthday: '1940-02-20', deathday: '2020-02-19', profile_path: '/provider.jpg',
    combined_credits: { cast: [
      { id: 98765001, media_type: 'movie', title: 'Interstellar', release_date: '2014-11-07' },
      { id: 98765002, media_type: 'tv', name: 'Remote Series', first_air_date: '2022-01-01' },
    ], crew: [{ id: 98765001, media_type: 'movie', title: 'Interstellar', job: 'Director', release_date: '2014-11-07' }] },
  } }));
  const { rows: [person] } = await pool.query("INSERT INTO cast_crew(name, tmdb_id) VALUES('Extended Profile',98765999) RETURNING cast_crew_id");
  await pool.query('UPDATE media SET tmdb_id=98765001 WHERE title_id=$1', [ids.Interstellar]);
  const result = await request(`/api/media/people/${person.cast_crew_id}`);
  assert.equal(result.status, 200);
  assert.equal(result.body.age, null);
  assert.equal(result.body.deathday, null);
  assert.equal(result.body.biography, null);
  assert.equal(result.body.photo, null);
  assert.deepEqual(result.body.filmography, []);
  assert.equal(tmdb.get.mock.callCount(), 0);
});

test("provider outages preserve stored profiles and library credits", async (t) => {
  t.mock.method(require('../src/services/tmdb.service'), 'get', async () => { throw new Error('Provider unavailable'); });
  const { rows: [person] } = await pool.query("INSERT INTO cast_crew(name, tmdb_id, biography) VALUES('Offline Profile',98765998,'Local biography') RETURNING cast_crew_id");
  const result = await request(`/api/media/people/${person.cast_crew_id}`);
  assert.equal(result.status, 200);
  assert.equal(result.body.biography, 'Local biography');
  assert.equal(result.body.profile_source, 'library');
  assert.deepEqual(result.body.filmography, []);
});
test("search ranks exact titles first, supports prefixes, typos and actresses", async () => {
  for (const q of ["Interstellar", "interstel", "intersteller"]) {
    const { status, body } = await request(`/api/media/search?q=${encodeURIComponent(q)}`);
    assert.equal(status, 200); assert.equal(body.items[0].title, "Interstellar");
  }
  const actor = await request("/api/media/search?q=Test%20Actress");
  assert.equal(actor.body.items[0].title, "Bengali Story");
  for (const q of ["%", "_", "x' OR 1=1 --", "zzqnotafilm"]) {
    const result = await request(`/api/media/search?q=${encodeURIComponent(q)}`);
    assert.equal(result.status, 200); assert.equal(result.body.total, 0);
  }
});
test("pagination, categories, details and parameter validation", async () => {
  const first = await request("/api/media?type=movie&limit=2");
  const second = await request("/api/media?type=movie&limit=2&offset=2");
  assert.equal(first.body.total, 5); assert.equal(first.body.hasMore, true);
  assert.ok(second.body.items.every((item) => !first.body.items.some((other) => item.title_id === other.title_id)));
  const series = await request("/api/media?type=series"); assert.equal(series.body.items[0].title, "Space Series");
  assert.equal((await request(`/api/media/${ids.Interstellar}`)).body.title, "Interstellar");
  for (const url of ["/api/media/1abc", "/api/media?limit=-2", "/api/media?type=bad", "/api/media?offset=oops", "/api/media/search?q=" + "a".repeat(121)]) assert.equal((await request(url)).status, 400);
  assert.equal((await request("/api/media/9999999")).status, 404);
});
test("sessions and watchlists persist, stay private and reject unauthorized writes", async () => {
  assert.equal((await request("/api/account/watchlist")).status, 401);
  const payload = { name: "Test User", email: "test@example.invalid", password: "Test password 123" };
  const registered = await request("/api/account/register", { method: "POST", body: JSON.stringify(payload) });
  assert.equal(registered.status, 200); assert.ok(registered.cookie);
  assert.equal(registered.body.user.password_hash, undefined);
  const headers = { Cookie: registered.cookie };
  const stored = await pool.query("SELECT password_hash FROM users WHERE email=$1", [payload.email]); assert.notEqual(stored.rows[0].password_hash, payload.password);
  assert.equal((await request("/api/account/me", { headers })).body.user.email, payload.email);
  const url = `/api/account/watchlist/${ids.Interstellar}`;
  assert.equal((await request(url, { method: "PUT", headers })).status, 200);
  await request(url, { method: "PUT", headers });
  assert.equal((await request("/api/account/watchlist", { headers })).body.items.length, 1);
  const other = await request("/api/account/register", { method: "POST", body: JSON.stringify({ ...payload, email: "other@example.invalid" }) });
  const otherHeaders = { Cookie: other.cookie };
  assert.equal((await request("/api/account/watchlist", { headers: otherHeaders })).body.items.length, 0);
  await request(url, { method: "DELETE", headers: otherHeaders });
  assert.equal((await request("/api/account/watchlist", { headers })).body.items.length, 1);
  assert.equal((await request(url, { method: "DELETE", headers: { ...headers, Origin: "https://untrusted.example" } })).status, 403);
  await request("/api/account/logout", { method: "POST", headers });
  assert.equal((await request("/api/account/me", { headers })).status, 401);
  const login = await request("/api/account/login", { method: "POST", body: JSON.stringify(payload) });
  assert.equal(login.status, 200);
  assert.equal((await request("/api/account/watchlist", { headers: { Cookie: login.cookie } })).body.items.length, 1);
  await request(url, { method: "DELETE", headers: { Cookie: login.cookie } });
  assert.equal((await request("/api/account/watchlist", { headers: { Cookie: login.cookie } })).body.items.length, 0);
  assert.equal((await request("/api/account/login", { method: "POST", body: JSON.stringify({ ...payload, password: "wrong" }) })).status, 401);
});
test("trailer matching rejects fabricated videos and prioritizes studio trailers", () => {
  assert.equal(youtubeId("watch?v=zSWdZVtXT7E"), "zSWdZVtXT7E");
  assert.equal(youtubeId("https://example.com/watch?v=zSWdZVtXT7E"), null);
  assert.equal(youtubeId("invalid/video"), null);
  const row = { title: "Interstellar", year: 2014 };
  const studio = { id: "zSWdZVtXT7E", title: "Interstellar Official Trailer", channel: "Warner Bros. UK", verified: true, description: "2014" };
  const fan = { ...studio, title: "Interstellar 2 Fan Made Trailer", channel: "A fan" };
  const wrongYear = { ...studio, title: "Interstellar (2026) Official Trailer" };
  assert.equal(chooseTrailer(row, [fan, wrongYear, studio]).id, studio.id);
  assert.equal(chooseTrailer(row, [fan, wrongYear]), null);
  assert.throws(() => extractResults("<html>Too many requests</html>"));
});


test('profiles and legacy title links stay local even when TMDB is configured', async () => {
  const tmdb = require('../src/services/tmdb.service');
  const originalGet = tmdb.get;
  let remoteCalls = 0;
  tmdb.get = async () => { remoteCalls++; throw new Error('Unexpected remote lookup'); };
  try {
    const person = (await pool.query("INSERT INTO cast_crew(tmdb_id,name,biography,photo) VALUES(987654,'Local Profile','Stored biography','/stored.jpg') RETURNING cast_crew_id")).rows[0];
    const role = (await pool.query("SELECT role_id FROM role WHERE role_name='Actor'")).rows[0];
    const titles = [];
    for (const [type, tmdbId] of [['movie', 987654], ['series', -987654]]) {
      const item = (await pool.query('INSERT INTO media(tmdb_id,title) VALUES($1,$2) RETURNING title_id', [tmdbId, `Local Only ${type}`])).rows[0];
      await pool.query(`INSERT INTO ${type}(title_id) VALUES($1)`, [item.title_id]);
      await pool.query('INSERT INTO media_cast_crew VALUES($1,$2,$3)', [item.title_id, person.cast_crew_id, role.role_id]);
      titles.push(item.title_id);
      const legacy = await request(`/api/media/external/${type}/987654`);
      assert.equal(legacy.status, 200);
      assert.equal(legacy.body.title_id, item.title_id);
      assert.equal(legacy.body.media_type, type);
    }
    const profile = await request(`/api/media/people/${person.cast_crew_id}`);
    assert.equal(profile.body.profile_source, 'library');
    assert.equal(profile.body.biography, 'Stored biography');
    assert.equal(profile.body.photo, '/stored.jpg');
    assert.deepEqual(new Set(profile.body.filmography.map(film => film.title_id)), new Set(titles));
    for (const film of profile.body.filmography) {
      const search = await request(`/api/media/search?q=${encodeURIComponent(film.title)}`);
      assert.ok(search.body.items.some(item => item.title_id === film.title_id));
      assert.equal((await request(`/api/media/${film.title_id}`)).status, 200);
    }
    assert.equal((await request('/api/media/external/movie/2147483647')).status, 404);
    assert.equal((await request('/api/media/external/person/987654')).status, 400);
    assert.equal(remoteCalls, 0);
  } finally { tmdb.get = originalGet; }
});
