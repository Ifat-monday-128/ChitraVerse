const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { randomBytes, scryptSync, createHash } = require("node:crypto");
require("../src/config/env");
const { Pool } = require("pg");

// All fixture accounts live in a disposable schema, never in the real users table.
const schema = `chitraverse_auth_${process.pid}_${Date.now()}`;
const admin = new Pool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, options: "" });
process.env.PGOPTIONS = `-c search_path=${schema},public`;
const pool = require("../src/config/db");
const app = require("../src/app");
const password = "Authentication test 123!";
const roles = ["user", "admin", "moderator"];
let server, base;

test.before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await pool.query(await fs.readFile(path.resolve(__dirname, "../database/schema.sql"), "utf8"));
  await pool.query(await fs.readFile(path.resolve(__dirname, "../database/migrations/001_search_and_sessions.sql"), "utf8"));
  assert.equal((await pool.query("SELECT current_schema() AS name")).rows[0].name, schema);
  // admin/moderator are test fixtures proving that login is not hardcoded to user.
  for (const role of roles) {
    const salt = randomBytes(16).toString("hex");
    const hash = `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
    await pool.query("INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4)", [role, `${role}@example.invalid`, hash, role]);
  }
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
});

async function request(url, { body, cookie, method = body ? "POST" : "GET" } = {}) {
  const response = await fetch(base + url, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const setCookie = response.headers.get("set-cookie");
  return { status: response.status, body: await response.json(), headers: response.headers, setCookie, cookie: setCookie?.split(";")[0] };
}

test("missing and malformed fields return 400; incorrect credentials return 401", async () => {
  for (const body of [
    {}, { email: "user@example.invalid" }, { email: "", password },
    { email: "not-an-email", password }, { email: "user@example.invalid", password: "" },
    { email: ["user@example.invalid"], password },
  ]) {
    assert.equal((await request("/api/account/login", { body })).status, 400);
  }
  for (const body of [
    { email: "user@example.invalid", password: "wrong" },
    { email: "missing@example.invalid", password },
  ]) {
    const result = await request("/api/account/login", { body });
    assert.equal(result.status, 401);
    assert.equal(result.cookie, undefined);
  }
});

test("each database role can log in then log out; replaying the old cookie fails", async () => {
  for (const role of roles) {
    const login = await request("/api/account/login", { body: { email: ` ${role.toUpperCase()}@EXAMPLE.INVALID `, password, role: "forged-role" } });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.role, role);
    assert.deepEqual(Object.keys(login.body.user).sort(), ["email", "name", "role", "user_id"]);
    assert.match(login.setCookie, /HttpOnly/i);
    assert.match(login.setCookie, /SameSite=Lax/i);
    assert.equal(login.headers.get("cache-control"), "no-store");
    const cookie = login.cookie;
    assert.equal((await request("/api/account/watchlist", { cookie })).status, role === "admin" ? 403 : 200);
    assert.equal((await request("/api/account/me", { cookie })).body.user.role, role);

    const token = cookie.split("=")[1];
    const [header, payload, signature] = token.split(".");
    assert.deepEqual(JSON.parse(Buffer.from(header, "base64url")), { alg: "HS256", typ: "JWT" });
    const claims = JSON.parse(Buffer.from(payload, "base64url"));
    assert.equal(claims.sub, String(login.body.user.user_id));
    assert.equal(claims.iss, "chitraverse-api");
    assert.equal(claims.aud, "chitraverse-web");
    assert.equal(claims.role, undefined);
    assert.ok(signature);
    const forgedPayload = Buffer.from(JSON.stringify({ ...claims, sub: "999999", role: "admin" })).toString("base64url");
    const tamperedCookies = [
      `chitraverse_session=${header}.${forgedPayload}.${signature}`,
      `chitraverse_session=${header}.${payload}.${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`,
    ];
    for (const tamperedCookie of tamperedCookies) {
      assert.equal((await request("/api/account/me", { cookie: tamperedCookie })).status, 401);
    }
    const hash = createHash("sha256").update(token).digest("hex");
    assert.equal((await pool.query("SELECT 1 FROM user_session WHERE token_hash=$1", [hash])).rowCount, 1);
    assert.equal((await pool.query("SELECT 1 FROM user_session WHERE token_hash=$1", [token])).rowCount, 0);

    const logout = await request("/api/account/logout", { method: "POST", cookie });
    assert.equal(logout.status, 200);
    assert.match(logout.setCookie, /chitraverse_session=;/);
    assert.equal((await pool.query("SELECT 1 FROM user_session WHERE token_hash=$1", [hash])).rowCount, 0);
    for (const method of ["GET", "PUT", "DELETE"]) {
      const endpoint = method === "GET" ? "/api/account/watchlist" : "/api/account/watchlist/1";
      assert.equal((await request(endpoint, { method, cookie })).status, 401);
    }
    assert.equal((await request("/api/account/me", { cookie })).status, 401);
  }
});

test("switching accounts revokes the previous session; expired and invalid sessions fail", async () => {
  const first = await request("/api/account/login", { body: { email: "user@example.invalid", password } });
  const second = await request("/api/account/login", { cookie: first.cookie, body: { email: "admin@example.invalid", password } });
  assert.equal(second.status, 200);
  assert.notEqual(second.cookie, first.cookie);
  assert.equal((await request("/api/account/watchlist", { cookie: first.cookie })).status, 401);
  assert.equal((await request("/api/account/me", { cookie: second.cookie })).body.user.role, "admin");
  // A role change is read from the database on the next protected request.
  await pool.query("UPDATE users SET role='user' WHERE email='admin@example.invalid'");
  assert.equal((await request("/api/account/me", { cookie: second.cookie })).body.user.role, "user");
  await pool.query("UPDATE user_session SET expires_at=now()-interval '1 second'");
  for (const cookie of [second.cookie, undefined, "chitraverse_session=invalid", `chitraverse_session=${"a".repeat(64)}`]) {
    assert.equal((await request("/api/account/watchlist", { cookie })).status, 401);
    assert.equal((await request("/api/account/me", { cookie })).status, 401);
  }
});

test("registration hashes passwords and ignores a client-supplied privileged role", async () => {
  const result = await request("/api/account/register", { body: { name: "New User", email: " NEW@example.invalid ", password, role: "admin" } });
  assert.equal(result.status, 200);
  assert.equal(result.body.user.role, "user");
  assert.equal(result.body.user.password_hash, undefined);
  const stored = (await pool.query("SELECT password_hash,role FROM users WHERE email='new@example.invalid'")).rows[0];
  assert.match(stored.password_hash, /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/);
  assert.notEqual(stored.password_hash, password);
  assert.equal(stored.role, "user");
});

test("local account command creates a usable role account and preserves existing accounts", async () => {
  const script = path.resolve(__dirname, "../src/createAccount.js");
  const args = [script, "evaluator@example.invalid", "moderator", "Evaluator"];
  const { stdout } = await promisify(execFile)(process.execPath, args);
  const generatedPassword = stdout.match(/Password: (\S+)/)?.[1];
  assert.ok(generatedPassword);
  const login = await request("/api/account/login", { body: { email: "evaluator@example.invalid", password: generatedPassword } });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.role, "moderator");
  const original = (await pool.query("SELECT password_hash FROM users WHERE email='evaluator@example.invalid'")).rows[0].password_hash;
  await assert.rejects(promisify(execFile)(process.execPath, args), /existing account was preserved/);
  assert.equal((await pool.query("SELECT password_hash FROM users WHERE email='evaluator@example.invalid'")).rows[0].password_hash, original);
});
