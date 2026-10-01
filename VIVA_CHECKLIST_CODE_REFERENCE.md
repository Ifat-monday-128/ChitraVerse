# ChitraVerse Checklist Viva: Quick Answers with Code References

Use this file when preparing for the checklist evaluation. The answers describe the current code, not a proposed design.

> **Project summary:** ChitraVerse is a movie and TV-series discovery and community application. React/TypeScript provides the interface, Express handles the API and access control, and PostgreSQL stores the relational data and implements transactions, functions, a procedure, a trigger, views, constraints, and complex queries.

## How to use the references

Every reference gives a file and starting line. If a line changes after editing, search the same file for the named function, route, or SQL object.

## Checklist status at a glance

| Requirement | Status | Best code evidence |
|---|---|---|
| Own authentication system | Implemented | `server/src/routes/account.routes.js:34,45,96,116,135` |
| Secure password storage | Implemented with salted scrypt | `server/src/routes/account.routes.js:103-108` |
| Database-controlled roles | Implemented | `server/src/queries/account.queries.js:25`; `account.routes.js:122-133` |
| Real authenticated session | Signed JWT plus revocable DB session | `server/src/utils/jwt.js:27-63`; `account.routes.js:45-73` |
| Protected backend routes | Implemented for private account routes | `server/src/routes/account.routes.js:142-147` |
| Real logout invalidation | Implemented | `server/src/routes/account.routes.js:135-139`; `account.queries.js:27` |
| Explicit transactions | Implemented | `server/src/config/db.js:16-29` |
| Database trigger | Implemented | `server/database/migrations/004_rating_activity.sql:55-57` |
| Computed database function | Implemented and called | `server/database/migrations/005_catalog_and_password_reset.sql:1-6`; `account.queries.js:91` |
| Multi-table stored procedure | Implemented and called | `server/database/migrations/005_catalog_and_password_reset.sql:9-42`; `admin-management.queries.js:11` |
| Three complex queries | Implemented | `server/src/services/home-discovery.queries.js:15,35`; `server/src/queries/profile.queries.js:17` |
| All pages require authentication | **Partial under literal wording** | Public media routes intentionally allow guests; private account routes are protected |

---

## 1. Authentication

### What should I say?

> We built our own authentication system. Registration hashes passwords with salted scrypt. Login reads the user and role from PostgreSQL and verifies the submitted password. A successful login creates a signed JWT and stores a hash of that token in `user_session`. The JWT is sent in an HTTP-only cookie. Every protected request must pass both JWT verification and the database-session check.

### Registration and password hashing

**Location:** [`server/src/routes/account.routes.js:96`](server/src/routes/account.routes.js#L96)

Important code is at lines 103-108:

```js
const salt = randomBytes(16).toString("hex");
const key = await scrypt(password, salt, 64);
// Stored in the database:
`scrypt:${salt}:${key.toString("hex")}`
```

Explanation:

- The plaintext password is never stored.
- The random salt makes identical passwords produce different hashes.
- scrypt is deliberately expensive, which slows password guessing.
- Registration SQL always gives a new public account the `user` role.

**Role-safe registration SQL:** [`server/src/queries/account.queries.js:23`](server/src/queries/account.queries.js#L23)

```sql
INSERT INTO users(name,email,password_hash,role)
VALUES($1,$2,$3,'user')
```

The frontend cannot register itself as admin by sending `role: "admin"`.

### Login sequence

**Location:** [`server/src/routes/account.routes.js:116`](server/src/routes/account.routes.js#L116)

1. Validate email and password; malformed input returns `400`.
2. Query the database by email using `$1`.
3. Read the stored scrypt format, salt, and hash.
4. Derive a hash from the submitted password.
5. Compare it with `timingSafeEqual`; invalid credentials return `401`.
6. Reject a suspended account with `403`.
7. Read the role from the returned database row—not from request data.
8. Create the JWT and database session.
9. Return only safe user fields.

**Login query:** [`server/src/queries/account.queries.js:25`](server/src/queries/account.queries.js#L25)

```sql
SELECT user_id,name,email,password_hash,role,avatar,
       suspension_reason,suspended_until
FROM users WHERE email=$1
```

**Safe response object:** [`server/src/routes/account.routes.js:30`](server/src/routes/account.routes.js#L30)

The response includes ID, name, email, role, and avatar. It does not expose the password hash.

### JWT and database session

**JWT creation and verification:** [`server/src/utils/jwt.js:27`](server/src/utils/jwt.js#L27), [`server/src/utils/jwt.js:42`](server/src/utils/jwt.js#L42)

The JWT includes issuer, audience, subject/user ID, random token ID, issue time, and expiry. It is signed with HMAC-SHA256. Verification checks the signature, algorithm, issuer, audience, ID format, and expiration.

**Session creation:** [`server/src/routes/account.routes.js:45`](server/src/routes/account.routes.js#L45)

**Session table:** [`server/database/migrations/001_search_and_sessions.sql:10`](server/database/migrations/001_search_and_sessions.sql#L10)

```sql
CREATE TABLE user_session (
  token_hash TEXT PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
```

The raw JWT is kept in the cookie; only its SHA-256 hash is stored in the database. A protected request succeeds only when the JWT is valid and its matching unexpired session row exists.

### Cookie security

**Location:** [`server/src/routes/account.routes.js:10`](server/src/routes/account.routes.js#L10)

- `httpOnly: true`: ordinary browser JavaScript cannot read the cookie.
- `secure: true` in production: send only over HTTPS.
- `sameSite`: reduces cross-site request risks.
- The cookie is not proof by itself; the backend verifies it.

### Protected routes

**Location:** [`server/src/routes/account.routes.js:142`](server/src/routes/account.routes.js#L142)

```js
router.use(async (req, res, next) => {
  req.user = await currentUser(req);
  if (!req.user) return res.status(401).json({ error: "Sign in to continue." });
  if (suspended(req.user)) return suspensionError(req.user, res);
  next();
});
```

`currentUser` verifies the JWT and queries the session plus current database user: [`server/src/routes/account.routes.js:34`](server/src/routes/account.routes.js#L34).

The session lookup also reads the current database role: [`server/src/queries/account.queries.js:4`](server/src/queries/account.queries.js#L4).

### Authorization and roles

Authentication means **who the user is**. Authorization means **what that user may do**.

- Admin catalog guard: [`server/src/routes/admin-management.routes.js:7`](server/src/routes/admin-management.routes.js#L7)
- Rating restricted to normal users: [`server/src/routes/account.routes.js:218`](server/src/routes/account.routes.js#L218)
- Admin excluded from personal libraries: [`server/src/routes/library.routes.js:9`](server/src/routes/library.routes.js#L9)
- Watchlist queries include the authenticated user ID: [`server/src/routes/library.routes.js:21`](server/src/routes/library.routes.js#L21)
- Community staff checks: [`server/src/routes/community.routes.js:14`](server/src/routes/community.routes.js#L14)

### Logout

**Location:** [`server/src/routes/account.routes.js:135`](server/src/routes/account.routes.js#L135)

```js
const token = sessionToken(req);
if (token) await pool.write(queries.revokeSession, [hashToken(token)]);
res.clearCookie(cookieName, cookieOptions());
```

**Revocation query:** [`server/src/queries/account.queries.js:27`](server/src/queries/account.queries.js#L27)

```sql
DELETE FROM user_session WHERE token_hash=$1;
```

This is a real logout because the backend deletes the session row. Reusing the old JWT afterward fails, even if someone retained a copy of the cookie.

### Authentication status codes

| Situation | Status |
|---|---:|
| Missing or malformed login fields | `400 Bad Request` |
| Wrong email/password | `401 Unauthorized` |
| No valid session on a private route | `401 Unauthorized` |
| Authenticated but wrong role | `403 Forbidden` |
| Suspended user | `403 Forbidden` |
| Too many attempts | `429 Too Many Requests` |

### Honest qualification

Public discovery routes intentionally work without login. Private account operations are protected. Therefore, if the checklist literally demands authentication for every page and every request, the project is only partially compliant with that sentence.

Public media routes are mounted in [`server/src/app.js`](server/src/app.js), with their implementation in [`server/src/routes/media.routes.js`](server/src/routes/media.routes.js).

---

## 2. Explicit transactions

### What should I say?

> We use explicit `BEGIN`, `COMMIT`, and `ROLLBACK` on one checked-out PostgreSQL connection. Related writes either succeed together or are all undone. The connection is released in `finally`.

**Transaction wrapper:** [`server/src/config/db.js:16`](server/src/config/db.js#L16)

```js
await client.query(queries.begin);
const result = await work(client);
await client.query(queries.commit);
// On error:
await client.query(queries.rollback);
```

**SQL constants:** [`server/src/queries/transactions.queries.js:1`](server/src/queries/transactions.queries.js#L1)

Why one client? A PostgreSQL transaction belongs to one database connection. Using different pooled connections could make `BEGIN` and the writes belong to different sessions.

Examples:

- Catalog procedure plus metadata: [`server/src/routes/admin-management.routes.js:41`](server/src/routes/admin-management.routes.js#L41)
- Rating update plus computed summary: [`server/src/routes/account.routes.js:224`](server/src/routes/account.routes.js#L224)
- Watchlist item changes: [`server/src/routes/library.routes.js:50`](server/src/routes/library.routes.js#L50)
- Password update plus session revocation: [`server/src/routes/profile.routes.js:43`](server/src/routes/profile.routes.js#L43)
- Complete TMDB import: [`server/src/services/tmdb-import.service.js:63`](server/src/services/tmdb-import.service.js#L63)

### ACID explanation

- **Atomicity:** a multi-table operation is entirely committed or rolled back.
- **Consistency:** constraints, keys, validation, and procedures preserve database rules.
- **Isolation:** locks coordinate concurrent operations. Do not claim that every transaction uses serializable isolation.
- **Durability:** PostgreSQL persists committed data according to its server configuration.

---

## 3. Database trigger

### What should I say?

> The `review_rating_activity` trigger automatically records rating additions, changes, and removals in `activity_log`. Because it is in the database, all code paths that modify a review receive the same logging behavior, and the log participates in the same transaction.

**Trigger function:** [`server/database/migrations/004_rating_activity.sql:16`](server/database/migrations/004_rating_activity.sql#L16)

**Trigger declaration:** [`server/database/migrations/004_rating_activity.sql:55`](server/database/migrations/004_rating_activity.sql#L55)

```sql
CREATE OR REPLACE TRIGGER review_rating_activity
AFTER INSERT OR UPDATE OR DELETE ON review
FOR EACH ROW EXECUTE FUNCTION log_review_rating_change();
```

Meaning:

- `AFTER`: run after the row operation.
- `INSERT OR UPDATE OR DELETE`: observe all rating-changing operations.
- `FOR EACH ROW`: run once for every affected review row.
- `OLD`: values before update/delete.
- `NEW`: values after insert/update.
- `TG_OP`: the current operation name.

Activity behavior:

| Old rating | New rating | Logged action |
|---:|---:|---|
| `NULL` | `8` | `rating_added` |
| `8` | `9` | `rating_changed` |
| `9` | `NULL` | `rating_removed` |
| `8` | `8` | Nothing |

The null-safe no-change check is at [`004_rating_activity.sql:29`](server/database/migrations/004_rating_activity.sql#L29):

```sql
IF before_rating IS NOT DISTINCT FROM after_rating THEN RETURN NULL; END IF;
```

The insert into `activity_log` is at [`004_rating_activity.sql:49`](server/database/migrations/004_rating_activity.sql#L49).

The trigger is tested for changes, no-op updates, rollback, and cascading deletion in [`server/tests/rating-trigger.test.js:9`](server/tests/rating-trigger.test.js#L9).

Important: this trigger records history. It does **not** calculate the average rating.

---

## 4. Computed database function

### What should I say?

> `get_title_rating` computes the local average rating and vote count for one title. PostgreSQL performs the aggregate, so the application does not download every review and calculate it in JavaScript.

**Definition:** [`server/database/migrations/005_catalog_and_password_reset.sql:1`](server/database/migrations/005_catalog_and_password_reset.sql#L1)

```sql
CREATE OR REPLACE FUNCTION get_title_rating(p_title_id INT)
RETURNS TABLE(chitraverse_rating NUMERIC, chitraverse_vote_count INT)
LANGUAGE sql STABLE AS $$
  SELECT ROUND(AVG(r.rating),1), COUNT(r.rating)::INT
  FROM review r WHERE r.title_id=p_title_id;
$$;
```

- `AVG` calculates the mean rating.
- `ROUND(...,1)` keeps one decimal place.
- `COUNT(r.rating)` counts non-null votes.
- `STABLE` is appropriate because this function reads data and does not modify it.

**Real application call:** [`server/src/queries/account.queries.js:91`](server/src/queries/account.queries.js#L91)

```sql
SELECT * FROM get_title_rating($1)
```

**Called by the rating endpoint:** [`server/src/routes/account.routes.js:238`](server/src/routes/account.routes.js#L238)

**Behavior test:** [`server/tests/catalog.test.js:56`](server/tests/catalog.test.js#L56)

---

## 5. Stored procedure

### What should I say?

> `save_catalog_title` implements one catalog-save workflow across related tables. It validates the title, creates or locks the parent `media` row, determines the subtype, updates the common fields, and upserts either the `movie` or `series` row. The caller owns the larger transaction.

**Definition:** [`server/database/migrations/005_catalog_and_password_reset.sql:9`](server/database/migrations/005_catalog_and_password_reset.sql#L9)

### Create path

When `p_title_id IS NULL`:

1. Validate that `p_type` is `movie` or `series`.
2. Insert common fields into `media`.
3. Obtain the generated ID through `RETURNING title_id INTO p_title_id`.
4. Insert the subtype details into `movie` or `series`.

### Update path

When `p_title_id` is present:

```sql
PERFORM 1 FROM media WHERE title_id=p_title_id FOR UPDATE;
IF NOT FOUND THEN
  RAISE EXCEPTION 'Title not found' USING ERRCODE='P0002';
END IF;
```

- `PERFORM` runs a query without returning its rows to the caller.
- `FOR UPDATE` locks the title until the transaction finishes.
- `NOT FOUND` detects an invalid title ID.
- `P0002` is converted to HTTP 404 by [`admin-management.routes.js:49`](server/src/routes/admin-management.routes.js#L49).

The procedure discovers the existing subtype from the database. It then updates common `media` values and performs an upsert on the subtype.

### What does `ON CONFLICT ... DO UPDATE` mean?

```sql
INSERT INTO movie(title_id,release_date,runtime)
VALUES(p_title_id,p_release,p_runtime)
ON CONFLICT(title_id) DO UPDATE
SET release_date=EXCLUDED.release_date,
    runtime=EXCLUDED.runtime;
```

It means: insert the row if the key is new; otherwise update the existing row. This is called an **upsert**. `EXCLUDED.runtime` is the new runtime from the attempted insert.

### Real application call

**CALL statement:** [`server/src/routes/admin-management.queries.js:11`](server/src/routes/admin-management.queries.js#L11)

**Admin route and transaction:** [`server/src/routes/admin-management.routes.js:36`](server/src/routes/admin-management.routes.js#L36)

The procedure writes `media` plus `movie`/`series`. Cast, companies, and awards are handled by [`server/src/services/catalog-metadata.service.js:29`](server/src/services/catalog-metadata.service.js#L29) on the same transaction connection.

The procedure intentionally does not commit. The outer transaction must also include the metadata operations, so a later failure can roll everything back.

**Rollback test:** [`server/tests/catalog.test.js:45`](server/tests/catalog.test.js#L45)

---

## 6. Function, procedure, and trigger differences

| Object | How it runs | Job in this project |
|---|---|---|
| Function | Called using `SELECT` | Return average rating and vote count |
| Procedure | Called using `CALL` | Save a title across parent/subtype tables |
| Trigger | Fires automatically after a table event | Record rating history |

Do not say “functions can never modify data.” PostgreSQL functions can be more flexible than that. Explain how these particular objects are used.

---

## 7. Three complex queries

### Query A: Watchlist summary

**Location:** [`server/src/queries/profile.queries.js:17`](server/src/queries/profile.queries.js#L17)

> It returns each watchlist with its title count. `LEFT JOIN` keeps empty lists, `COUNT(wi.title_id)` correctly returns zero for them, `WHERE` restricts ownership, and `GROUP BY` produces one row per list.

Terms to explain:

- `LEFT JOIN`: retain the left row even without a matching right row.
- `COUNT(column)`: ignores nulls.
- `GROUP BY`: combine rows into one group/result per watchlist.

### Query B: Genre popularity and ranked artwork

**Location:** [`server/src/services/home-discovery.queries.js:15`](server/src/services/home-discovery.queries.js#L15)

> It joins genres, title-genre links, and media; counts titles per genre; ranks posters inside each genre; and produces up to three artwork entries as JSON.

Terms to explain:

- CTE `WITH ranked`: a named intermediate query.
- `ROW_NUMBER() OVER (PARTITION BY genre_id ...)`: number titles separately within every genre.
- `json_agg`: build a JSON array for the frontend.
- `FILTER`: restrict which rows enter the artwork aggregate.
- `COALESCE`: return an empty JSON array instead of null.

### Query C: Birthday discovery

**Location:** [`server/src/services/home-discovery.queries.js:35`](server/src/services/home-discovery.queries.js#L35)

> It finds cast/crew born on a requested month and day, joins their roles, removes duplicate role names, and ranks profiles using photos and distinct title counts.

Terms to explain:

- `EXTRACT`: get month/day components from a date.
- `array_agg(DISTINCT ...)`: create an array without repeated roles.
- `LEFT JOIN`: keep people even when credit/role rows are missing.
- `COUNT(DISTINCT mc.title_id)`: avoid counting one title repeatedly.

### Other complex examples

- Search scoring, actor matching, full-text search, trigram similarity, filters, and pagination: [`server/src/queries/media-details.queries.js:75`](server/src/queries/media-details.queries.js#L75)
- Activity timeline using `UNION ALL`: [`server/src/queries/profile.queries.js:37`](server/src/queries/profile.queries.js#L37)
- Admin counts, role grouping, and date-series analytics: [`server/src/routes/admin-dashboard.queries.js`](server/src/routes/admin-dashboard.queries.js)

---

## 8. Database design terms

**Main schema:** [`server/database/schema.sql`](server/database/schema.sql)

- **Primary key:** uniquely identifies a row, such as `media.title_id`.
- **Foreign key:** requires the related parent row to exist.
- **Composite key:** multiple columns jointly identify a row, such as `watchlist_item(watchlist_id,title_id)`.
- **One-to-many:** one series has many seasons; one season has many episodes.
- **Many-to-many:** media and genre connect through `media_genre`.
- **Normalization:** genre names are stored once in `genre`; link tables store IDs instead of repeating names.
- **ON DELETE CASCADE:** deleting a parent removes dependent rows.
- **ON DELETE SET NULL:** keep the dependent row but clear the deleted reference.
- **Constraint:** a database rule, such as rating being between 0 and 10.
- **Index:** an additional data structure that can speed suitable lookups but costs storage and write maintenance.
- **View:** a reusable stored query. Rating summary view: [`server/database/schema.sql:170`](server/database/schema.sql#L170).

---

## 9. Common teacher questions

### Why use parameterized SQL?

User values are passed as `$1`, `$2`, and so on rather than concatenated into SQL. This prevents input from becoming SQL syntax and reduces SQL injection risk. Example: [`server/src/queries/account.queries.js:25`](server/src/queries/account.queries.js#L25).

### Why use a trigger instead of JavaScript logging?

The database automatically logs every relevant review-row change, regardless of which authorized application code path performs it. The rating and activity row also share the same transaction.

### Why use a database function for ratings?

The result is an aggregate over stored rows. PostgreSQL can compute it close to the data and return only the result.

### Why use a procedure for catalog saving?

Saving a catalog title is a domain operation involving a parent row and subtype row. The procedure centralizes validation, locking, subtype selection, and upsert logic.

### Why does the procedure not contain `COMMIT`?

The Express transaction also includes cast, company, and award changes. Committing inside the procedure would prevent a later metadata failure from rolling back the whole workflow.

### Difference between 401 and 403?

- `401`: the request has no valid authenticated session.
- `403`: the user is authenticated but lacks permission.

### Is a JWT encrypted?

No. Its payload is encoded and signed, not encrypted. The signature detects tampering. Passwords and secrets must never be placed in it.

### Why keep a database session when the JWT is signed?

A valid signature alone cannot tell whether the user logged out. Deleting the database session provides immediate server-controlled revocation.

### `INNER JOIN` versus `LEFT JOIN`?

`INNER JOIN` returns only matching rows. `LEFT JOIN` also retains unmatched rows from the left table, such as an empty watchlist.

### `WHERE` versus `HAVING`?

`WHERE` filters rows before grouping. `HAVING` filters groups after aggregation.

### `GROUP BY` versus a window function?

`GROUP BY` collapses rows into groups. A window function such as `ROW_NUMBER` calculates values across related rows without collapsing them.

### `UNION` versus `UNION ALL`?

`UNION` removes duplicate result rows. `UNION ALL` keeps them and is appropriate for distinct activity events.

### Does rollback undo a PostgreSQL sequence number?

Usually no. A rolled-back insert may leave a gap in a `SERIAL` ID. The gap does not mean a partial row survived.

### Is the trigger the rating calculator?

No. The trigger records history. `get_title_rating` and the `media_rating_summary` view calculate rating aggregates.

---

## 10. Suggested demonstration

1. Attempt login with malformed data and show `400`.
2. Attempt a wrong password and show `401`.
3. Login correctly and show that the response contains no password/hash.
4. Open a private endpoint successfully.
5. Logout, replay the old cookie, and show `401`.
6. Login as user, moderator, and admin to demonstrate database roles and `403` authorization.
7. Rate one title `8`, then `9`; show the rating summary and activity log.
8. Create or update a catalog movie as admin and explain the procedure.
9. Run the rollback test and explain why partial catalog data does not remain.
10. Show watchlist counts, genre cards, and birthdays as the three complex-query examples.

Do not show real passwords, JWTs, `.env`, or signing secrets on the projector.

---

## 11. Useful read-only database checks

```sql
-- Confirm roles without displaying private account data.
SELECT role, COUNT(*) FROM users GROUP BY role;

-- Confirm the custom functions and procedure are installed.
SELECT proname, prokind
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname=current_schema()
  AND proname IN (
    'get_title_rating',
    'save_catalog_title',
    'log_review_rating_change'
  );

-- prokind='f' means function; prokind='p' means procedure.

-- Confirm the trigger is installed.
SELECT tgname
FROM pg_trigger
WHERE tgrelid='review'::regclass AND NOT tgisinternal;

-- Run the computed function for an existing title.
SELECT * FROM get_title_rating(
  (SELECT title_id FROM media ORDER BY title_id LIMIT 1)
);

-- Inspect recent rating history.
SELECT activity_id,title,action,old_rating,new_rating,occurred_at
FROM activity_log
ORDER BY activity_id DESC
LIMIT 10;
```

---

## 12. Verification and tests

Run from the project root:

```powershell
npm --prefix server test
npm --prefix frontend test
```

Focused tests:

```powershell
node --test server/tests/auth.test.js
node --test server/tests/catalog.test.js
node --test server/tests/rating-trigger.test.js
node --test server/tests/roles.test.js
```

Important evidence:

- Authentication and logout replay: [`server/tests/auth.test.js`](server/tests/auth.test.js)
- Every role can log in: [`server/tests/roles.test.js`](server/tests/roles.test.js)
- Procedure, rollback, and computed function: [`server/tests/catalog.test.js:45`](server/tests/catalog.test.js#L45)
- Trigger and transactional logging: [`server/tests/rating-trigger.test.js:9`](server/tests/rating-trigger.test.js#L9)

## Final 30-second answer

> ChitraVerse uses custom authentication with salted scrypt password hashes, a signed JWT in an HTTP-only cookie, and a revocable PostgreSQL session. Roles always come from the database, protected routes verify the session on the backend, and logout deletes the session. Data-changing workflows use explicit transactions. A trigger records rating history, a SQL function calculates rating statistics, and a stored procedure saves catalog titles across parent and subtype tables. The project also uses joins, CTEs, aggregates, window functions, constraints, views, and indexes. Public browsing is intentionally unauthenticated, so under a literal every-page-authentication requirement that point is only partially compliant.
