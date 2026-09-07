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
