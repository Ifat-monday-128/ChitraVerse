# ChitraVerse

ChitraVerse is a movie and TV series discovery application built with React, an Express API, and PostgreSQL. TMDB supplies catalog metadata; a separate web-search workflow discovers YouTube trailers. Users can browse titles, search by title or actor, inspect details and episodes, and maintain a private watchlist.

## Contents

- [Architecture](#architecture)
- [First-time setup](#first-time-setup)
- [Configuration](#configuration)
- [Catalog workflow](#catalog-workflow)
- [Trailer workflow](#trailer-workflow)
- [Application workflows](#application-workflows)
- [API reference](#api-reference)
- [Development and verification](#development-and-verification)
- [Build and hosting](#build-and-hosting)
- [Troubleshooting](#troubleshooting)

## Architecture

```text
TMDB -> sync + enrich -> PostgreSQL <- optional trailer-search updates
Browser -> React frontend -> Express API -> PostgreSQL
Browser -> TMDB image CDN / stored HTTPS poster URL
Browser -> YouTube when a trailer is opened
```

The browser obtains catalog records through the API. Poster paths and trailer references come from the database, although external providers serve the actual images and videos. Missing data produces loading, empty, unavailable, or error states. There is no sample-film fallback or manufactured Interstellar artwork. Cast profiles, biographies, filmographies, search, and title details use only local database records. Missing profile fields remain unavailable. Legacy TMDB title links resolve only to already imported local titles; they return 404 otherwise. TMDB API access is confined to the explicit import/enrichment scripts.

The frontend uses React 19, Next.js-compatible application conventions, vinext, Vite, and Tailwind CSS. The application database is PostgreSQL. The frontend's optional Drizzle/D1 examples and hosting bindings are starter infrastructure, not the movie or account database.

| Path | Purpose |
| --- | --- |
| `package.json` | Root setup, development, migration, build, and test commands. |
| `scripts/dev.mjs`, `start.cmd` | Launch and stop the API and frontend together. |
| `server/src/app.js`, `server.js` | Express middleware, routing, errors, and process lifecycle. |
| `server/src/config/` | Environment loading and PostgreSQL connection pool. |
| `server/src/routes/` | Media, authentication, and watchlist endpoints. |
| `server/src/controllers/` | Media request validation and responses. |
| `server/src/services/` | Catalog queries, search ranking, and TMDB client. |
| `server/src/sync/` | Catalog import, enrichment, and trailer discovery. |
| `server/database/schema.sql` | Base relational schema, indexes, and summary views. |
| `server/database/migrations/` | Incremental database changes. |
| `server/tests/` | API integration and trailer-matching tests. |
| `frontend/app/page.tsx` | Homepage, browsing, search, details, accounts, and watchlists. |
| `frontend/app/api.ts` | Typed API requests, timeouts, and media URL handling. |
| `frontend/app/globals.css` | Styling and responsive layouts. |
| `frontend/vite.config.ts`, `frontend/worker/` | Frontend build and Cloudflare integration. |
| `frontend/tests/` | Built-page HTML smoke test. |
| `.local-data/` | Trailer reports and timestamped link backups. |

## First-time setup

### 1. Prerequisites and dependencies

Use Node.js **22.13.0 or newer**, npm, and a running PostgreSQL server with `pg_trgm` available. Database setup requires permission to create tables, indexes, and the extension. Run the commands below from the project root in Windows PowerShell.

```powershell
npm.cmd run setup
```

This runs `npm ci` in both `server` and `frontend`, using their lockfiles. On Windows, `npm.cmd` avoids execution-policy problems with `npm.ps1`. On other systems, use `npm` instead.

### 2. Configure the backend

For a new checkout without an existing environment file:

```powershell
Copy-Item server/.env.example server/.env
```

Edit `server/.env` with your database credentials and TMDB bearer token. Preserve an existing environment file when upgrading. Backend commands always load `server/.env`, including commands launched from the root.

### 3. Initialize PostgreSQL

For a new database, use PostgreSQL's command-line tools or equivalent operations in your database administration tool:

```powershell
createdb -h localhost -p 5432 -U postgres chitraverse
psql -h localhost -p 5432 -U postgres -d chitraverse -v ON_ERROR_STOP=1 -f server/database/schema.sql
npm.cmd run migrate
```

Adjust host, port, username, and database name to match your configuration. `createdb` and `psql` do not automatically read `server/.env`.

The base schema is for an empty database. For an existing ChitraVerse database, skip creation and `schema.sql`; run `npm.cmd run migrate` instead.

The current migration adds full-text/trigram search indexes and a `user_session` table while preserving the existing media and watchlist structure. The runner executes every SQL file in filename order with one transaction per file. It has no migration-history table, so migrations must tolerate repeat execution, as the current migration does.

### 4. Populate the catalog

```powershell
npm.cmd --prefix server run sync
npm.cmd --prefix server run enrich
```

Enrichment must follow sync because it supplies the production-company data required by the Hollywood homepage filter. Use the trailer workflow below to populate trailer links.

### 5. Start both services

```powershell
npm.cmd run dev
```

Alternatively, double-click `start.cmd`. The launcher checks dependencies, starts both services, and stops them together on Ctrl+C. If one service exits, it stops the other.

- Frontend: normally `http://localhost:3000`; use the Local URL printed in the terminal.
- API: `http://localhost:5000` by default.
- API process health: `http://localhost:5000/health`.

To run services independently, execute these commands in separate terminals:

```powershell
npm.cmd run dev:server
```

```powershell
npm.cmd run dev:frontend
```

## Configuration

| Variable | Location | Purpose / default |
| --- | --- | --- |
| `PORT` | `server/.env` | API port; default `5000`. |
| `DB_HOST` | `server/.env` | PostgreSQL hostname. |
| `DB_PORT` | `server/.env` | PostgreSQL port; default `5432`. |
| `DB_USER` | `server/.env` | PostgreSQL username. |
| `DB_PASSWORD` | `server/.env` | PostgreSQL password. |
| `DB_NAME` | `server/.env` | Application database name. |
| `JWT_SECRET` | `server/.env` | HS256 signing secret; at least 32 bytes and mandatory in production. Generate a long random value and do not commit it. |
| `TMDB_TOKEN` | `server/.env` | Bearer token for TMDB sync and enrichment. |
| `TMDB_SYNC_PAGES` | `server/.env` | Popular-result pages per media type; default `5`, maximum `500`. |
| `FRONTEND_ORIGINS` | `server/.env` | Comma-separated allowed origins; default `http://localhost:3000,http://127.0.0.1:3000`. |
| `NODE_ENV` | Backend runtime environment | `production` enables secure session cookies requiring HTTPS. |
| `NEXT_PUBLIC_API_URL` | `frontend/.env.local` | Browser-accessible API base URL; default `http://localhost:5000`. |

Example `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:5000
```

Restart affected services after configuration changes. Set the public API address before building a deployed frontend. Public frontend variables must not contain database passwords or TMDB tokens.

## Catalog workflow

### Synchronize base records

```powershell
npm.cmd --prefix server run sync
```

The script imports movie/TV genres, popular movies, and popular TV shows. It upserts titles, descriptions, original languages, poster paths, ratings, release dates, and genre relationships. `TMDB_SYNC_PAGES` controls the page count for each media type. This imports a popular-title subset, not the entire TMDB catalog.

### Enrich stored titles

```powershell
npm.cmd --prefix server run enrich
```

Enrichment visits stored movies and series with TMDB IDs. It fills movie runtime, budget and revenue, series status and dates, production companies and countries, up to 15 actors per title, and selected director/writer credits. TV enrichment also imports seasons and episodes, skipping season zero specials. It does not import TMDB video links or overwrite trailers.

Both commands use upserts and can be rerun to refresh records. Imports are incremental rather than a single transaction for the whole catalog. Enrichment logs individual title failures and continues, so inspect its output even when the command completes. Neither import runs automatically when the application starts.

The current schema makes `media.tmdb_id` unique across movies and TV shows. Overlapping upstream movie/TV IDs cannot be represented separately by this importer; consider this existing constraint before substantially expanding imports.

### Database relationships

`media` stores common title fields. `movie` and `series` supply type-specific fields; series connect to seasons and episodes. Join tables associate titles with genres, cast/crew roles, and production houses. Users own watchlists and their items. The migration adds revocable hashed JWT session records, while rating and season summary views support title details.

The schema also includes reviews, favourites, awards, and streaming-platform tables. These do not currently have corresponding editing workflows or public endpoints in the application.

## Trailer workflow

Preview a small batch, including titles whose trailer is missing:

```powershell
npm.cmd --prefix server run trailers:search -- --all --limit=10
```

Inspect `.local-data/trailer-search.json`, then run discovery with database updates enabled:

```powershell
npm.cmd --prefix server run trailers:search -- --all --apply
```

To process only records with existing non-null trailer values, omit `--all`:

```powershell
npm.cmd --prefix server run trailers:search -- --apply
```

| Option | Behavior |
| --- | --- |
| Without `--apply` | Writes a report and backup without updating database links. |
| `--apply` | Saves successfully matched trailer paths. |
| `--all` | Includes titles whose trailer is null. |
| `--limit=10` | Processes at most 10 pending records; use a positive integer. |
| `--provider=bing` | Uses Bing RSS search plus YouTube oEmbed metadata instead of direct YouTube result pages. |

Search queries combine title, year, media type, and “official trailer.” Matching checks title-word overlap and release years, rejects common fan-made/concept/reaction results, and favors recognized studios or trusted channels. These are automated heuristics, so review candidates when accuracy matters.

The database stores the suffix after `youtube.com/`, for example `watch?v=zSWdZVtXT7E`. The frontend constructs the full YouTube URL. It also accepts legacy 11-character video IDs, but does not display arbitrary full trailer URLs.

Every run backs up selected records and their previous links to `.local-data/trailers-backup-<timestamp>.json`. The report records candidates, matches, errors, and whether updates were applied. Unmatched or failed searches preserve existing values. Updates also check that the old link has not changed since the search began.

Reruns resume from the report. Preview runs skip completed matched/unmatched entries; apply runs also retry entries not yet applied. Applying searches again rather than importing the preview report verbatim. Eight consecutive errors stop processing. Different providers share the same report/resume rules. There is no built-in restore command or force-refresh flag; retain the report and backups before any manual recovery or deliberate report reset.

## Application workflows

### Homepage and browsing

1. The frontend requests `/api/media/home` and checks the current account session.
2. Home includes only movies with original language `en` and at least one linked production house with country `US`. This is the application's operational definition of Hollywood.
3. Records with both poster and trailer fields sort first, followed by TMDB rating and title ID. At most 13 records are returned: one featured title and up to 12 cards.
4. Movies and TV Shows open their catalog categories. The homepage arrow opens all Hollywood movies. The menu provides home, movies, TV, search, and watchlist navigation.
5. Browse/search results load in batches of 24. “Load more” requests the next offset. Filters and search terms are reflected in the URL and restored through browser Back/Forward.

The Hollywood restriction applies to the home collection. General browsing/search can include other countries and series. Missing production-company metadata can exclude a movie from home.

### Search

The search button opens and focuses the search field. Typing triggers a request after a 250 ms delay; obsolete requests are cancelled. Empty search shows an instruction to enter a title or cast member. Category selection narrows results to movies or series.

PostgreSQL combines case-insensitive title matching, `websearch_to_tsquery` full-text matching, `pg_trgm` typo tolerance for queries of at least three characters, and actor-name matches through credits. Exact titles and prefixes receive the largest score boosts, followed by title text/substring matches, actor matches, similarity, and weighted synopsis relevance. Results sort by combined relevance, then rating and title ID.

SQL values are parameterized and literal `%`/`_` characters are escaped for substring matching. Search covers stored records, not the live web. Actor coverage depends on imported credits. The full-text configuration is `simple`, without language-specific stemming.

### Details, episodes, and trailers

Click a card or the featured About button to load title details, genres, credits, and production companies. Clicking an actor opens a search for that name. Selecting a season loads its episodes. A valid trailer opens YouTube in a new tab; missing/unsupported links show “Trailer unavailable.” Missing card posters show “No poster available.”

### Accounts and watchlists

Open the profile button to register or sign in. Registration requires a name, email, and an 8–128-character password. Passwords use salted scrypt hashes. Login and registration share a per-process limit of 15 attempts per IP per minute.

Successful authentication sets a signed HS256 JWT in an HttpOnly, SameSite=Lax cookie lasting seven days. The JWT contains only standard identity/session claims; the user's role is deliberately read from PostgreSQL on every protected request. PostgreSQL stores only a SHA-256 hash of each active JWT, providing server-controlled revocation. Browser API requests include credentials to restore sessions after reload. Logout removes the stored JWT session and clears the cookie. In production, `JWT_SECRET` must contain at least 32 bytes; without it the API refuses to start. Development uses an ephemeral random secret when the variable is absent, so development sessions are invalidated whenever the API restarts.

To create accounts for evaluation, run these commands from the project root:

```powershell
npm.cmd --prefix server run account:create -- user@example.com user "Test User"
npm.cmd --prefix server run account:create -- admin@example.com admin "Test Admin"
npm.cmd --prefix server run account:create -- moderator@example.com moderator "Test Moderator"
```

Each command prints a new random password once and saves only its salted hash. Save the printed password to sign in through the profile button. Existing accounts are never overwritten. This local command requires database access; public registration always creates a `user`. The schema allows role names, and login reads the role from the database. The examples above match the roles covered by the authentication tests; admins have a Users & activity panel; moderators have no separate screen.

For each account, sign in and check the role in the profile. Regular users can open a movie, save a whole-number rating from 1 to 10, update that rating, and manage their watchlist. Admins see Users & activity after login and can reopen it from the profile or menu. Admins cannot rate movies or access watchlists (the backend returns 403). Sign out before testing the next account. The server deletes that session on logout, so replaying its cookie returns `401` from `/api/account/me` and watchlist endpoints. The frontend clears the account only after logout succeeds. Invalid credentials return `401`; missing or malformed fields return `400`.

Signed-in users can save/remove titles through a detail dialog. The API creates a default “My watchlist” when needed, prevents duplicate items, and scopes operations to the current user. Watchlists persist in PostgreSQL. A signed-out save attempt opens the account dialog; after signing in, click save again.

### Ratings and admin activity

Movie details show the ChitraVerse average and vote count from the existing `media_rating_summary` view. Ratings use the existing `review` table, with one active vote per user/movie through the API; saving again replaces the vote. No database migration is needed for these features.

- `GET /api/account/ratings/:titleId`: read the current user's rating.
- `PUT /api/account/ratings/:titleId`: save `{ "rating": 8 }`; requires the database role `user` and a movie ID.
- `GET /api/account/admin/users`: admin-only account list with names, emails, roles, joined dates, latest ratings and currently saved watchlist items. Password hashes and session tokens are never included.

Activity is a snapshot of existing records, not a historical audit log: replaced ratings and removed watchlist items are not listed. All account endpoints require a valid server session; unauthorized roles receive 403 and signed-out requests receive 401.

## API reference

Paths are relative to the API base URL. Bodies use JSON; authenticated calls require the session cookie. `:titleId` is the internal database ID, not the TMDB ID.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/health` | Returns `{ "status": "ok" }`; checks the API process, not PostgreSQL. |
| GET | `/api/media/home` | Returns `{ featured, items }`; featured may be null. |
| GET | `/api/media` | Browse/search the stored catalog. |
| GET | `/api/media/search` | Same query behavior as browsing, used by the search UI. |
| GET | `/api/media/:titleId` | Title metadata and related records. |
| GET | `/api/media/:titleId/seasons/:seasonNumber/episodes` | Ordered episode array. |
| GET | `/api/account/me` | Returns `{ user }`; returns `401` when signed out or the session is invalid. |
| POST | `/api/account/register` | Body: `{ "name": "...", "email": "...", "password": "..." }`; creates a session. |
| POST | `/api/account/login` | Body: `{ "email": "...", "password": "..." }`; creates a session. |
| POST | `/api/account/logout` | Invalidates the session and returns `{ user: null }`. |
| GET | `/api/account/watchlist` | Returns the current user's `{ items }`. |
| PUT | `/api/account/watchlist/:titleId` | Saves a title; returns `{ saved: true }`. |
| DELETE | `/api/account/watchlist/:titleId` | Removes a title from the user's lists; returns `{ saved: false }`. |

Browse/search parameters:

| Parameter | Allowed values / default |
| --- | --- |
| `q` | Maximum 120 characters; defaults to empty. |
| `type` | `all`, `movie`, `series`; default `all`. |
| `collection` | `all`, `hollywood`; default `all`. |
| `limit` | Integer 1–100; default 24. |
| `offset` | Integer 0–100000; default 0. |

Browse/search returns `{ items, total, hasMore, query }`. Invalid parameters return 400, unauthorized actions 401, disallowed write origins 403, missing titles/routes 404, duplicate registration 409, and throttled authentication 429. Errors use `{ "error": "..." }`.

Read-only examples:

```powershell
Invoke-RestMethod 'http://localhost:5000/api/media/home'
Invoke-RestMethod 'http://localhost:5000/api/media/search?q=interstellar&type=movie&limit=24&offset=0'
```

## Development and verification

| Command from project root | Purpose |
| --- | --- |
| `npm.cmd run setup` | Install locked dependencies for both services. |
| `npm.cmd run migrate` | Apply incremental SQL migrations. |
| `npm.cmd run dev` | Run both services. |
| `npm.cmd run dev:server` | Run the API with Node's file watcher. |
| `npm.cmd run dev:frontend` | Run the frontend development server. |
| `npm.cmd run build` | Build the frontend. |
| `npm.cmd test` | Backend tests, then frontend build/typecheck/render tests. |
| `npm.cmd --prefix server test` | Backend tests only. |
| `npm.cmd --prefix frontend test` | Frontend build, typecheck, and HTML smoke test. |
| `npm.cmd --prefix frontend run typecheck` | Check TypeScript using the project script. |
| `npm.cmd --prefix frontend run lint` | Run ESLint. |

Backend tests require PostgreSQL configured through `server/.env` and permission to create/drop a test schema and install `pg_trgm` if needed. They create a uniquely named schema, seed fixtures, start an API on an available local port, and remove the schema afterward. Coverage includes Hollywood filtering, search ranking/typos/actors, pagination, validation, sessions, watchlist isolation, and trailer matching.

Frontend tests build the worker, typecheck the project, request rendered HTML, and check the loading page/navigation without fabricated movie data or the removed hero image. This is a rendered-page smoke test, not an interactive test of every button.

Run checks before finishing a change:

```powershell
npm.cmd test
npm.cmd --prefix frontend run lint
```

With `npm.cmd run dev` running in another terminal, verify both services:

```powershell
Invoke-RestMethod 'http://localhost:5000/health'
Invoke-RestMethod 'http://localhost:5000/api/media/home'
(Invoke-WebRequest 'http://localhost:3000' -UseBasicParsing).StatusCode
```

For behavior changes, also exercise search, categories, details, episodes, trailers, sign-in/out, and watchlist persistence in the browser. A successful health response alone does not verify the database or frontend API connection.

## Build and hosting

```powershell
npm.cmd run build
```

The build writes frontend artifacts under `frontend/dist/`. The frontend also exposes `npm.cmd --prefix frontend start` for vinext's start command. Start the API without file watching using `npm.cmd --prefix server start`.

The frontend contains Sites/Cloudflare worker configuration in `frontend/.openai/hosting.json`, `vite.config.ts`, and `worker/`. Building does not publish the site, deploy Express/PostgreSQL, or apply migrations. Complete hosting requires a reachable API and PostgreSQL deployment as well as the frontend.

Before deployment, apply migrations, set a strong `JWT_SECRET`, set `NEXT_PUBLIC_API_URL` to the public HTTPS API address, configure `FRONTEND_ORIGINS`, and set `NODE_ENV=production` for secure API cookies. Keep frontend/API on the same site for the current SameSite=Lax cookie behavior; CORS alone does not enable cross-site authenticated fetches. Accounts use signed, PostgreSQL-revocable JWT sessions rather than the frontend starter's optional ChatGPT identity helpers.

## Troubleshooting

| Symptom | Resolution |
| --- | --- |
| PowerShell blocks `npm.ps1` | Use `npm.cmd`; no execution-policy change is needed. |
| Missing dependencies | Run `npm.cmd run setup` from the root. |
| `psql`/`createdb` not found | Add PostgreSQL's `bin` directory to PATH or use a database administration tool. |
| Health works but catalog requests fail | Check PostgreSQL, credentials, base schema, and migrations. Health does not query the database. |
| Search reports missing functions/tables | Run migrations against the intended database and ensure `pg_trgm` is available. |
| Empty homepage after sync | Run enrichment; check for English movies linked to US production houses. |
| TMDB import fails | Check the token, outbound connectivity, and logged response. Resolve the issue and rerun. |
| Trailer search is rate limited/blocked | Inspect the report, wait before retrying, or try `--provider=bing`; failed searches preserve old links. |
| Trailer search skips titles | Check `--all`, the batch limit, and the report's resume entries. |
| Existing trailer unavailable in UI | Check for a supported suffix or video ID; trailer discovery replaces full URLs with suffixes. |
| Browser cannot reach API | Check the public API URL, API startup, allowed origins, and restart/rebuild after configuration changes. |
| Login does not persist | Use consistent hostnames, check cookies/origins, and use HTTPS with production cookies. |
| Port already occupied | Stop the conflicting service or adjust ports and matching API/origin configuration. Use the printed frontend URL. |
| Backend tests fail during setup | Check database connectivity and test-schema/extension permissions. |
