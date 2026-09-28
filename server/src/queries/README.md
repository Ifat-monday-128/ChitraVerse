# Core application queries

This folder contains fundamental account, profile, library, and catalog queries, plus shared SQL helpers. Feature-specific queries live beside the route, service, or script that owns them. Query modules do not connect to the database or handle HTTP requests.

```js
const pool = require('../config/db');
const queries = require('../queries/account.queries');

const { rows } = await pool.query(queries.findByEmail, [email]);
```

Keep values in the separate parameters array. Never interpolate user input into SQL. `$1`, `$2`, and subsequent placeholders are bound by PostgreSQL's client.

| File | Contents |
| --- | --- |
| `account.queries.js` | Login, sessions, registration, ratings, featured titles, community |
| `library.queries.js` | Watchlists and favorites |
| `profile.queries.js` | Profiles, activity and password changes |
| `media.queries.js`, `media-details.queries.js` | Public content, title details and catalog search |
| `search-filters.queries.js` | Shared SQL conditions and allowed sort expressions |
| `transactions.queries.js` | Transaction commands; callers retain connection and commit/rollback control |

## Feature-specific queries

| Location | Query files |
| --- | --- |
| `../routes/` | `admin-dashboard.queries.js`, `admin-management.queries.js`, `awards.queries.js` |
| `../services/` | `directory.queries.js`, `person.queries.js`, `external-title.queries.js`, `home-discovery.queries.js`, `tmdb-import.queries.js` |
| `../sync/` | `syncAll.queries.js`, `enrichAll.queries.js`, `searchTrailers.queries.js`, `collectAwards.queries.js`, `importAwards.queries.js` |
| `../` | `createAccount.queries.js`, beside the local account creation command |

Keep new feature-specific SQL beside its owner. Use this folder for the core concerns listed above or helpers shared across features. Import transaction commands from `transactions.queries.js` when needed; keep connection and transaction lifecycle control in the caller.

Dynamic search builders return `{ text, values }` query configurations, which can be passed directly to `pool.query()`. Other builders accept only internal SQL fragments or allowlisted identifiers; actual search terms and other user values remain bound parameters. Filter validation stays in `utils/searchFilters.js`.

Database definitions remain in `server/database/schema.sql` and `server/database/migrations/`. Tests keep their isolated fixture SQL in `server/tests/`. Changing the location of application statements does not require a database migration.
