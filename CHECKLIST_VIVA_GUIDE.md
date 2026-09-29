# ChitraVerse: CSE216 Checklist and Viva Defence Guide

Reviewed: 29 September 2026. This guide describes the current working code, not a proposed implementation.

Project folder: `C:/Users/IFAT/OneDrive/Desktop/ChitraVerse_26`

Guide location: `C:/Users/IFAT/OneDrive/Desktop/ChitraVerse_26/CHECKLIST_VIVA_GUIDE.md`

Checklist source: `C:/Users/IFAT/Downloads/CSE216 Project Checklists.docx`.

The checklist's Research Network Social Platform is only an example. ChitraVerse should demonstrate equivalent database concepts using movies, ratings, watchlists, and community moderation. It does not need publications or citation counts.

## 1. What to say about the project

> ChitraVerse is a movie and TV-series discovery and community application. Visitors explore titles, cast, studios, and awards. Registered members maintain personal libraries and participate in the community. Moderators review reports, while administrators manage the catalog and privileged operations. React handles the interface, Express handles requests and authorization, and PostgreSQL stores relational data and executes database features.

The central request flow is:

```text
React page or component
  -> frontend/app/api.ts: HTTP request with session cookie
  -> Express route: validate input and check access where required
  -> service/query module: parameterized SQL
  -> PostgreSQL: constraints, functions, procedures, triggers
  -> JSON response -> React updates the screen
```

The frontend uses React/TypeScript and Next-style components through Vinext/Vite. The main application database is PostgreSQL through the Node `pg` connection pool. Drizzle/D1 starter files also exist, but they are not the database path used by the Express catalog/account APIs discussed here.

## 2. Checklist assessment

| Checklist requirement | Current assessment | Main evidence |
|---|---|---|
| Own user authentication | Implemented | S01, S02, S03 |
| Authentication on every page/request | Partial under the literal wording: private APIs are protected; catalog reads are public | S01, S04, S18 |
| Explicit transaction control for DML | Implemented pattern across inspected application writes; legacy import workflows have narrower transaction boundaries | S05, S06, S11 |
| At least one trigger | Implemented and installed | S07 |
| At least one computed-value database function | Implemented and called by rating updates | S08, S03 |
| At least one multi-table procedure | Implemented and called by catalog saves | S08, S09 |
| Three or more complex queries | Implemented; several concrete examples below | S12, S13, S14 |
| Appropriate use of database features | Defensible use cases; explain the distinctions in section 10 | S05, S07, S08 |
| Understand your own code | A viva preparation obligation, not something a test can certify | Sections 11–15 |

Do not claim unconditional 100% compliance. The public-page authentication interpretation is a real qualification, and understanding must be demonstrated by you.

## 3. Source-code map

All paths below are relative to the project folder above. Line numbers are starting points from this review and may shift after edits. Search the named function/query if a line moves.

| Reference | File location and useful starting point |
|---|---|
| S01 | `server/src/routes/account.routes.js`: `currentUser` line 34; `createSession` 43; register 94; login 114; logout 133; authentication middleware 140; rating update 216 |
| S02 | `server/src/utils/jwt.js`: signing-secret loader 7; `createJwt` 27; `verifyJwt` 42 |
| S03 | `server/src/queries/account.queries.js`: `findSessionUser` 4; `findByEmail` 25; `lockUserRatings` 79; `getRatingSummary` 91 |
| S04 | `server/src/routes/media.routes.js`: public catalog/discovery routes |
| S05 | `server/src/config/db.js`: `withTransaction` 16; `pool.write` 29 |
| S06 | `server/src/queries/transactions.queries.js`: BEGIN, COMMIT, ROLLBACK constants |
| S07 | `server/database/migrations/004_rating_activity.sql`: trigger function 16; trigger declaration 55 |
| S08 | `server/database/migrations/005_catalog_and_password_reset.sql`: `get_title_rating` 1; `save_catalog_title` 9 |
| S09 | `server/src/routes/admin-management.routes.js`: admin guard 7; `saveTitle` 36; transaction 41; metadata save 43 |
| S10 | `server/src/routes/admin-management.queries.js`: `callSaveCatalogTitle` |
| S11 | `server/src/routes/library.routes.js` and `server/src/queries/library.queries.js`: ownership, watchlists, favorites, locks |
| S12 | `server/src/services/home-discovery.queries.js`: releases 3; genre interests 15; box office 28; birthdays 35 |
| S13 | `server/src/queries/profile.queries.js`: `watchlistSummary` 17; `activityHistory` 37 |
| S14 | `server/src/queries/media-details.queries.js`: search builder `browse`, ranking, joins and pagination |
| S15 | `server/database/schema.sql`: base tables; rating view 170; episode-count view 180; later database objects |
| S16 | `server/src/routes/community.routes.js`: staff/actor checks, reports, moderation history and suspension |
| S17 | `server/src/services/catalog-metadata.service.js`: structured metadata validation and writes using the caller's connection |
| S18 | `server/tests/catalog.test.js`: public/private access policy, procedure rollback and SQL function tests |
| S19 | `server/tests/auth.test.js`: login, all roles, expiry, logout replay, registration |
| S20 | `server/tests/rating-trigger.test.js`: trigger logging, no-op updates, rollback and cascade behavior |
| S21 | `frontend/app/api.ts`: credentialed requests and 401 handling; `frontend/app/page.tsx`: navigation, login and logout |
| S22 | `frontend/app/page-state.ts`: `usePageState`, `saveScroll`, `restoreScroll`; `frontend/tests/page-state.test.mjs`: helper tests |
| S23 | `server/src/migrate.js` and `server/src/server.js`: transactional migrations before API startup |
| S24 | `server/src/createAccount.js`: local role-account creation command |
| S25 | `server/src/services/tmdb-import.service.js`: transactional full-title import; `server/src/sync/`: older synchronization tools |

## 4. Requirement: authentication handled by your own code

### Easy explanation

Authentication answers: **Who are you?** Authorization answers: **What are you allowed to do?**

ChitraVerse checks an email/password against its own `users` table. It does not delegate that decision to Google, Firebase, or another identity provider. Its active login form calls its own Express API.

A `frontend/app/chatgpt-auth.ts` starter helper exists, but no other file in the inspected `frontend/app` tree imports/calls it. Do not present that unused helper as the project's actual login mechanism. TMDB supplies movie metadata, not login identity.

### Registration and password storage

S01 generates a random salt and derives a password hash with Node's scrypt:

```js
const salt = randomBytes(16).toString("hex");
const key = await scrypt(password, salt, 64);
// Stored representation:
`scrypt:${salt}:${key.toString("hex")}`
```

This excerpt is from the registration implementation. The database receives the derived hash, not the plaintext password.

- A **salt** makes identical passwords produce different stored values.
- **scrypt** makes password guessing deliberately expensive.
- Hashing is not encryption: there is no password-decryption operation.
- Verification derives a new hash from the supplied password and saved salt.
- `timingSafeEqual` compares equal-length derived keys while reducing comparison timing leakage.

The registration SQL explicitly inserts role `'user'`. A client cannot register as an administrator by adding `role: 'admin'` to the request.

### Login sequence

1. Validate that email and password have acceptable types/formats.
2. Find the account using a bound email parameter.
3. Read the stored salt/hash and calculate scrypt for the submitted password.
4. Compare the hashes; reject invalid credentials.
5. Check account suspension.
6. Create a signed JWT and a server-controlled session row.
7. Send the JWT in an HTTP-only cookie and return a safe user object.

S01's response helper selects safe fields:

```js
function publicUser(user) {
  return { user_id: user.user_id, name: user.name,
    email: user.email, role: user.role, avatar: user.avatar || null };
}
```

The password hash is used internally but is absent from the successful login response.

| Situation | Expected response |
|---|---|
| Missing/malformed login fields | 400 |
| Wrong password or unknown account | 401 |
| Suspended account | 403 |
| Too many login attempts | 429 |
| Correct active account | 200 and authenticated cookie |

### JWT plus database-backed revocation

S02 signs JWTs using HMAC-SHA256. Claims include issuer, audience, subject/user ID, random token ID, issue time and expiry. Lifetime is seven days. Verification checks the signature and expected claim values, not just whether the token can be decoded.

The JWT does not supply the trusted role. S03 reads the current user and role from PostgreSQL:

```sql
SELECT u.user_id, u.name, u.email, u.role,
       u.suspension_reason, u.suspended_until
FROM users u
JOIN user_session s USING(user_id)
WHERE s.token_hash=$1
  AND s.expires_at > now()
  AND u.user_id=$2;
```

`$1` is the SHA-256 hash of the presented token; `$2` comes from the verified JWT subject. Password hashing and token hashing have different jobs: passwords need slow scrypt; already-random session tokens can use SHA-256 for database lookup.

**Both checks must succeed:** valid JWT AND matching unexpired database session. Therefore this is not a purely stateless JWT design.

The cookie is HTTP-only, preventing normal JavaScript access. In production it also uses `Secure`, `SameSite=None` and partitioning. Locally it uses `SameSite=Lax` without HTTPS-only transport. Production requires a configured signing secret of at least 32 bytes; the development fallback changes on server restart.

### Logout really invalidates access

S01 executes:

```js
const token = sessionToken(req);
if (token) await pool.write(queries.revokeSession, [hashToken(token)]);
res.clearCookie(cookieName, cookieOptions());
res.json({ user: null });
```

S03's revocation SQL is:

```sql
DELETE FROM user_session WHERE token_hash=$1;
```

Even a copied old cookie fails afterwards because its session row is gone. The frontend waits for backend logout success before clearing its user state. S19 tests replaying the old cookie after logout.

**Viva answer:** “We use our own scrypt password verification and a signed JWT in an HTTP-only cookie. Every protected request also checks a revocable database session. Logout deletes that session, so a previously issued JWT cannot continue accessing private endpoints.”

## 5. Requirement: authentication validation on every page

### What the implementation does

S01 places authentication middleware before the protected account routers:

```js
router.use(async (req, res, next) => {
  req.user = await currentUser(req);
  if (!req.user) return res.status(401).json({ error: "Sign in to continue." });
  if (suspended(req.user)) return suspensionError(req.user, res);
  next();
});
```

The middleware runs before private account data or mutations are processed. `/me` independently calls `currentUser`. Login and registration must be reachable before authentication. Logout can clear an existing token without requiring a currently valid session.

Authorization follows authentication. For example, S09 checks `req.user.role === 'admin'` before catalog administration. S11 includes the authenticated user ID when finding/updating a watchlist, preventing one member from accessing another member's list merely by guessing its ID.

Hiding a button is not the security boundary. Backend checks remain effective if somebody manually sends an HTTP request.

### Important checklist gap

S04 deliberately allows guest access to `/api/media/home`, `/api/media/search`, people, title details, awards and published community content. S18 explicitly tests public catalog access even without a session.

Therefore:

- **Accurate:** every inspected protected account workflow validates the session on the backend.
- **Inaccurate:** every HTTP request and every page requires login.
- If the evaluator requires a fully private application, this is an outstanding implementation change. Do not describe it as already done.

**Viva answer:** “Our public browsing pages intentionally allow guests. Authentication is enforced for private account operations, with role and ownership checks afterwards. Under a literal all-pages-private interpretation, the current design is only partially compliant.”

### Roles in this implementation

| Role | Examples of actual powers |
|---|---|
| Guest | Browse public catalog and published community content |
| User | Personal favorites/watchlists, ratings, stories, comments, reports |
| Moderator | Report review, hide/unhide stories, escalate, resolve/dismiss; may hide community comments; personal libraries remain allowed |
| Admin | Catalog and homepage management, account roles/session revocation, report-based story removal and author suspension |

The rating endpoint allows role `user` specifically. Do not claim moderators/admins can rate just because they are authenticated. Admins are deliberately excluded from personal favorites/watchlists. Authors can manage their own stories; admin-only report deletion refers to removing another member's story through moderation.

## 6. Requirement: explicit transaction control for DML

### Easy explanation

DML means data-changing statements such as `INSERT`, `UPDATE`, and `DELETE` here. A transaction groups work so it either succeeds together or rolls back.

Example: saving a movie needs a `media` row and a `movie` row. If the second write fails, the first should not remain as an incomplete catalog entry.

S05 implements the shared wrapper:

```js
pool.withTransaction = async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query(queries.begin);
    const result = await work(client);
    await client.query(queries.commit);
    return result;
  } catch (error) {
    await client.query(queries.rollback);
    throw error;
  } finally { client.release(); }
};
pool.write = (sql, values) =>
  pool.withTransaction(client => client.query(sql, values));
```

S06 defines the actual strings `BEGIN`, `COMMIT`, and `ROLLBACK`.

- `BEGIN`: open the transaction.
- `COMMIT`: make its successful changes permanent.
- `ROLLBACK`: undo its uncommitted changes after failure.
- `finally`: release the checked-out connection in both outcomes.

**Why the same client?** Transactions belong to a database connection. Calling unrelated `pool.query()` operations between BEGIN and COMMIT could select different pooled connections. The wrapper passes one client throughout.

### Where it is used

| Workflow | Transaction implementation |
|---|---|
| Single watchlist/profile/comment write | `pool.write(...)` |
| Catalog procedure plus cast/companies/awards | `pool.withTransaction(...)`, S09/S17 |
| Report creation plus admin notifications | `pool.withTransaction(...)`, S16 |
| Moderation update plus audit record | `pool.withTransaction(...)`, S16 |
| Session creation and previous-session replacement | Explicit checked-out client, S01 |
| Rating save and aggregate response | Explicit checked-out client, S01 |
| Password change and other-session revocation | Explicit client in `server/src/routes/profile.routes.js` |
| Named-list membership and favorite writes | Explicit client, S11 |
| Current full-title TMDB import | `pool.withTransaction(...)`, S25 |
| SQL migration file | Explicit client transaction, S23 |

The inspected standalone production `pool.query()` calls are reads. Writes use the wrapper or a transaction client. Trigger writes participate in their caller's transaction; they do not need a separate COMMIT.

**Qualification:** older scripts such as `syncAll.js` and `enrichAll.js` use `pool.write` for individual writes. This gives each write explicit transaction control, but not all-or-nothing behavior for the entire import. Use the current `tmdb-import.service.js` workflow as the stronger multi-table transaction example.

### ACID in your project

- **Atomicity:** catalog parent/subtype changes roll back together.
- **Consistency:** keys, foreign keys, checks and application validation preserve rules.
- **Isolation:** transactions plus explicit locks coordinate concurrent changes. No custom global isolation level is configured; do not claim every transaction is serializable.
- **Durability:** PostgreSQL provides committed-data durability subject to its server configuration.

Rating and favorite writes use transaction-scoped advisory locks keyed by user ID. List membership locks the owned watchlist with `FOR UPDATE`. These guard specific race conditions while preserving the existing schema.

**Proof:** S18 deliberately performs an invalid write after calling the procedure and asserts the media count is unchanged. S20 rolls a rating insertion back to a savepoint and verifies that its generated activity entry disappears too.

**Viva answer:** “Our writes use explicit BEGIN, COMMIT and ROLLBACK on one connection. Multi-table workflows share that connection, so failure cannot commit only half of the workflow.”

## 7. Requirement: at least one trigger

### Actual trigger

S07 contains:

```sql
CREATE OR REPLACE TRIGGER review_rating_activity
AFTER INSERT OR UPDATE OR DELETE ON review
FOR EACH ROW EXECUTE FUNCTION log_review_rating_change();
```

The trigger automatically records real rating changes in `activity_log`.

| Old rating | New rating | Activity |
|---|---|---|
| NULL | 8 | `rating_added` |
| 8 | 9 | `rating_changed` |
| 9 | NULL | `rating_removed` |
| 8 | 8 | No activity |

### How the function works

It uses `TG_OP` to identify INSERT/UPDATE/DELETE, `OLD` for previous values and `NEW` for new values. It selects the account/title and stores the action, old/new ratings, readable detail and timestamp.

The key no-op check is:

```sql
IF before_rating IS NOT DISTINCT FROM after_rating THEN
  RETURN NULL;
END IF;
```

`IS NOT DISTINCT FROM` treats two NULLs as equal. Ordinary `=` does not do that. Consequently, changing review text without changing its rating does not produce misleading rating history.

The inserted history row uses:

```sql
INSERT INTO activity_log
  (user_id,title_id,title,action,old_rating,new_rating,detail)
VALUES
  (account_id,media_id,media_title,event_action,
   before_rating,after_rating,event_detail);
```

Why `AFTER`? The log describes a change that the row operation has performed. It is still in the same transaction: rolling back the rating also rolls back the log. For this AFTER trigger, returning NULL does not cancel the original write.

The function avoids treating parent-deletion cascades as deliberate rating removals. When a title is deleted, existing activity can retain the copied title text with a null title ID. When a user is deleted, that user's activity rows cascade away. Do not claim this table is a permanent audit ledger independent of account deletion.

**Important:** this trigger logs ratings. It does not maintain the average rating. The average is computed by the SQL function/view described next.

### Demo

1. Sign in as a normal user and open a title.
2. Save rating 8, then change it to 9.
3. Open the account Activity section, or inspect `activity_log`.
4. Explain the old/new values and that the trigger runs automatically.
5. Show S20 for no-op updates and rollback, which are harder to illustrate reliably with clicks alone.

**Viva answer:** “The rating history must remain consistent regardless of which authorized code path updates a review. A database trigger records the change automatically in the same transaction.”

## 8. Requirement: at least one computed-value function

S08 defines the exact SQL function:

```sql
CREATE OR REPLACE FUNCTION get_title_rating(p_title_id INT)
RETURNS TABLE(chitraverse_rating NUMERIC, chitraverse_vote_count INT)
LANGUAGE sql STABLE AS $$
  SELECT ROUND(AVG(r.rating),1), COUNT(r.rating)::INT
  FROM review r WHERE r.title_id=p_title_id;
$$;
```

Input: one title ID. Output: its average ChitraVerse rating and number of non-null votes.

For ratings 8, 9 and NULL, the result is average 8.5 and vote count 2. SQL `AVG` and `COUNT(column)` ignore NULL. With no ratings, the average is NULL and the vote count is zero; NULL means “not rated,” not “rated zero.”

`RETURNS TABLE` names the returned columns. `STABLE` describes database-read behavior within a statement; it does not mean the result is cached forever.

S03 connects the function to real application behavior:

```js
exports.getRatingSummary = "SELECT * FROM get_title_rating($1)";
```

The rating PUT route calls that query after saving the vote and before committing. The response includes the updated aggregate. S18 verifies the function with a known vote.

S15 also defines `media_rating_summary`, a view joining titles and reviews with `AVG`, `COUNT`, and `GROUP BY`. Title details consume the view. The SQL function and the view compute the same kind of information through different interfaces.

**Do not confuse scores:** `tmdb_rating` is imported provider data; `chitraverse_rating` is calculated from your users' reviews. A local rating must not overwrite TMDB's score.

**Viva answer:** “We use a database function because the required result is a computed value over stored rows. PostgreSQL calculates the average and count, so the frontend does not download every review to calculate them.”

## 9. Requirement: at least one multi-table procedure

### What the procedure does

S08 defines `save_catalog_title`, which inserts or updates shared `media` data and the appropriate `movie` or `series` row.

The following is an explanatory excerpt, not the complete procedure:

```sql
-- New title branch:
INSERT INTO media(title,description,language,poster,trailer_link)
VALUES(p_title,p_description,p_language,p_poster,p_trailer)
RETURNING title_id INTO p_title_id;

-- Movie branch:
INSERT INTO movie(title_id,release_date,runtime)
VALUES(p_title_id,p_release,p_runtime)
ON CONFLICT(title_id) DO UPDATE
SET release_date=EXCLUDED.release_date,
    runtime=EXCLUDED.runtime;
```

The series branch similarly writes `series.first_air_date`. Existing titles are locked using `FOR UPDATE`; the code derives their actual stored type rather than changing a movie into a series because the request supplied a different type.

`INOUT p_title_id` receives an existing ID or NULL and returns the saved ID. `RETURNING` avoids an extra query to discover the newly inserted ID. `ON CONFLICT ... DO UPDATE` makes the subtype operation an upsert.

### The procedure is actually called

S10 contains:

```sql
CALL save_catalog_title(
  $1::int,$2::text,$3::text,$4::text,$5::text,
  $6::text,$7::text,$8::date,$9::int
);
```

S09 wraps the call and related metadata changes in one transaction:

```js
const result = await pool.withTransaction(async client => {
  const result = await client.query(queries.callSaveCatalogTitle,
    [req.params.id || null, req.body.media_type || null, ...values]);
  await structured.save(client, result.rows[0].p_title_id, data);
  return result;
});
```

The stored procedure itself writes the core parent/subtype tables. The JavaScript metadata service writes cast, company and award relationships on the same transaction client. Do not incorrectly attribute all metadata writes to the procedure body.

### Who commits?

The Express transaction wrapper owns BEGIN/COMMIT/ROLLBACK. The procedure intentionally contains no independent COMMIT. This lets a later metadata failure roll back the procedure's changes as well.

`RAISE EXCEPTION` rejects invalid titles/types or a missing existing record. An error propagates to the caller, which rolls back.

### Demo

1. Sign in as admin and open the dashboard's catalog management.
2. Create a test movie with a title, release date and runtime.
3. Show that its ID exists in `media` and `movie`.
4. Edit its title/runtime and explain the update/upsert path.
5. Show S18's intentional failure test to demonstrate rollback without damaging real catalog data.

**Viva answer:** “The procedure represents one domain operation: save a catalog title across related tables. The caller owns the transaction so the procedure and additional metadata succeed or fail together.”

## 10. Requirement: three or more complex queries, used appropriately

The checklist defines a complex query as using multiple tables and/or aggregation. You have considerably more than three. The following three are good primary viva examples.

### Query A: watchlist summaries, including empty lists

Exact query from S13, `watchlistSummary`:

```sql
SELECT w.watchlist_id,w.name,COUNT(wi.title_id)::int AS title_count
FROM watchlist w
LEFT JOIN watchlist_item wi USING(watchlist_id)
WHERE w.user_id=$1
GROUP BY w.watchlist_id
ORDER BY w.created_at DESC,w.watchlist_id DESC
LIMIT 6;
```

**Plain meaning:** “Show this user's six newest watchlists and how many titles each contains.”

- Two related tables and an aggregate make it complex under the checklist.
- `LEFT JOIN` retains lists without any titles.
- `COUNT(wi.title_id)` returns zero for an empty list. `COUNT(*)` would count the placeholder joined row and incorrectly return one.
- `WHERE w.user_id=$1` restricts the result to the authenticated user.
- `GROUP BY` gives one result per list. PostgreSQL recognizes that the other watchlist columns depend on its primary key.
- The profile overview uses this result to show playlist counts.

### Query B: genre popularity with ranked artwork

Exact query from S12, `genreInterests`:

```sql
WITH ranked AS (
  SELECT g.genre_id, g.name, m.title_id, m.title, m.poster,
    ROW_NUMBER() OVER (PARTITION BY g.genre_id ORDER BY
      (m.poster IS NOT NULL) DESC,
      m.tmdb_rating DESC NULLS LAST, m.title_id) AS position
  FROM genre g
  JOIN media_genre mg USING(genre_id)
  JOIN media m USING(title_id)
  WHERE EXISTS (SELECT 1 FROM movie mo WHERE mo.title_id=m.title_id)
     OR EXISTS (SELECT 1 FROM series s WHERE s.title_id=m.title_id)
)
SELECT genre_id, name, COUNT(*)::int AS title_count,
  COALESCE(json_agg(json_build_object('title',title,'poster',poster)
    ORDER BY position)
    FILTER (WHERE position<=3 AND poster IS NOT NULL),
    '[]'::json) AS artwork
FROM ranked
GROUP BY genre_id,name
ORDER BY title_count DESC,name,genre_id;
```

**Plain meaning:** “For each genre, count its titles and choose up to three useful poster examples.”

- The CTE `ranked` is a named intermediate query, not a stored permanent table.
- Three tables connect genre names to their titles.
- `ROW_NUMBER` numbers titles separately inside each genre because of `PARTITION BY`.
- A window function assigns ranks without collapsing the rows; the later GROUP BY performs the aggregation.
- `NULLS LAST` sends unknown ratings to the end of descending ranking.
- `json_agg` builds a JSON artwork array for the frontend.
- The aggregate FILTER restricts artwork, not the total title count.
- `COALESCE` returns an empty array instead of NULL when no artwork qualifies.
- `EXISTS` checks that a valid movie/series subtype is present.

Demo: show the homepage's genre-interest cards and their title counts/artwork. The route is `/api/media/home/interests`; its service invokes this query.

### Query C: birthday discovery with deduplicated roles

Exact query from S12, `birthdays`:

```sql
SELECT c.cast_crew_id,c.name,c.photo,
  to_char(c.date_of_birth,'YYYY-MM-DD') AS date_of_birth,
  COALESCE(array_agg(DISTINCT r.role_name ORDER BY r.role_name)
    FILTER (WHERE r.role_name IS NOT NULL),
    ARRAY[]::varchar[]) AS roles
FROM cast_crew c
LEFT JOIN media_cast_crew mc USING(cast_crew_id)
LEFT JOIN role r USING(role_id)
WHERE EXTRACT(MONTH FROM c.date_of_birth)=EXTRACT(MONTH FROM $1::date)
  AND EXTRACT(DAY FROM c.date_of_birth)=EXTRACT(DAY FROM $1::date)
  AND c.date_of_birth <= $1::date
GROUP BY c.cast_crew_id
ORDER BY (c.photo IS NOT NULL) DESC,
  COUNT(DISTINCT mc.title_id) DESC,c.name,c.cast_crew_id;
```

**Plain meaning:** “Find people with a birthday on the requested month/day, collect their roles and prioritize useful profiles.”

- Left joins keep a person even if no matching credits/roles exist.
- `DISTINCT` prevents displaying “Actor” repeatedly for a person with many acting credits.
- Matching month/day intentionally ignores the birth year.
- The full-date comparison excludes future birth dates.
- A distinct title count prevents multiple roles on one title from inflating the popularity order.

Demo: the homepage birthday section, or `/api/media/home/birthdays?date=YYYY-MM-DD` using a valid date with data. An empty result on a particular day is not a failed query.

### Further examples if asked

1. **Search, S14:** joins movies/series, aggregates matching actor credits, uses full-text search and trigram similarity, ranks exact matches above weaker matches, and applies pagination. User values use bound parameters; sort choices are allowlisted.
2. **Activity timeline, S13:** UNION ALL combines rating history, favorites, playlists, comments and stories into one chronological feed. NOT EXISTS avoids duplicating legacy ratings already represented in history.
3. **Box office, S12:** joins movie/media, optionally filters genres with EXISTS, then returns the top ten worldwide lifetime grosses. It is not current weekly ticket-sales data.
4. **Admin analytics:** `server/src/routes/admin-dashboard.queries.js` uses counts, role GROUP BY, and `generate_series` plus LEFT JOIN to include registration days with zero users.

### Why these database features are appropriate

| Feature | Appropriate job in ChitraVerse |
|---|---|
| Trigger | Automatically record real rating changes |
| SQL function | Return computed rating statistics |
| Procedure | Perform the core multi-table catalog-save workflow |
| Transaction | Keep related writes atomic |
| View | Reuse derived rating and episode-count results |
| Constraint | Reject invalid references, duplicates and out-of-range values |
| Index | Support frequent joins, lookups and search patterns |

Do not add a trigger for a simple button click or a procedure just to rename one value. The existing choices have concrete data-consistency or query-reuse purposes.

## 11. Database design you should understand

S15 and the migrations are the schema sources. Read both: the base schema alone does not tell the full upgrade history.

- `users` has account identity and role; `user_session` stores revocable sessions.
- `media` holds common movie/series fields; `movie` and `series` hold subtype-specific fields. Their title IDs are both primary keys and foreign keys to `media`.
- `series -> season -> episode` models the one-to-many hierarchy.
- `media_genre`, `media_company`, `media_platform` and `media_cast_crew` model many-to-many relationships.
- `media_cast_crew` includes role in its composite key: one person can be both actor and director on the same title.
- `watchlist` belongs to one user; `watchlist_item` links a list to titles and has a composite primary key.
- `review` stores local ratings; `activity_log` records rating changes.
- Community posts, comments, reports, moderation actions and notifications have separate responsibilities.

**Normalization example:** genre names live once in `genre`; linking rows store IDs instead of repeating “Drama” throughout every media record. This reduces update anomalies. Avoid claiming a formal proof that every table is in a particular normal form unless you can establish its functional dependencies.

**Primary key:** uniquely identifies a row. **Foreign key:** requires a referenced row to exist. **Composite key:** uses several columns together to identify a row.

`ON DELETE CASCADE` removes dependent rows when their parent is removed. `ON DELETE SET NULL` retains the dependent row while removing its reference. Use `activity_log.title_id` as the example of retaining a historical title snapshot.

Database checks include rating ranges, nonempty bounded community text and allowed report statuses. Frontend validation improves usability; server validation handles untrusted requests; database constraints provide a final layer of data integrity.

The API only accepts integer ratings 1–10, while the database's numeric check allows 0–10. The application rule is stricter than the storage rule. Also, a unique one-rating-per-user/title constraint is not present in `review`: the rating route uses locking and duplicate-rating cleanup. Do not invent a unique constraint that is not in the schema.

Search indexes include B-tree indexes and GIN indexes for full-text/trigram search in migration 001. Indexes can improve suitable reads but cost space and extra write maintenance. Never claim every query automatically uses an index; use `EXPLAIN` to inspect the plan.

## 12. Frontend state, security and moderation

### Frontend state is different from database state

React state controls the currently displayed interface. S22 adds in-memory page preferences and history-based scroll restoration. It preserves selected filters, directory/awards pagination, dashboard tabs, report filters and selected seasons; the main page also caches loaded catalog batches.

This is navigation convenience, not authentication or permanent storage. It is not a promise to preserve every form, modal or draft. Preferences are keyed by URL and name, not a complete independent snapshot of every history entry. Reload/restart can lose in-memory values. The root clears cached page preferences when the account identity changes.

Saved ratings/watchlists survive reload because PostgreSQL stores them. A restored “Reports” tab does not grant moderator permission: the API still validates the session and role.

### Moderation demonstration

1. As a normal user, report another member's test story from CVCommunity.
2. Sign in as a moderator.
3. Open View profile -> Reports, or the main menu -> Reports.
4. Choose Under review; supply a reason and confirm.
5. Hide the story and verify from a normal-user view that it disappears.
6. Unhide it and verify that it returns.
7. Escalate to Admin, then inspect the report as admin.
8. Expand Moderation history to explain who performed each recorded action.

S16 checks staff permissions on the backend and rechecks the acting user's role/suspension inside sensitive transactions. Report status, visibility changes, notifications and audit entries are coordinated transactionally.

Admin story removal uses `deleted_at`: this is soft deletion, retaining the record for audit. Moderator hide/unhide uses `hidden`. These are different from a physical SQL DELETE. The title-typing requirement was removed from story moderation; a reason and explicit confirmation remain. Catalog deletion is a separate workflow and still uses its own confirmation check.

“Online users” currently derives from unexpired sessions. It does not prove that a browser tab is open or that a person is actively using the app at that instant.

## 13. A practical viva demonstration plan

### Prepare

Use known test accounts for `user`, `moderator` and `admin`. The reviewed live database contained all three roles. Do not expose real passwords, JWTs, signing secrets or `.env` values on the projector.

If you need a new demonstration account, the local command is:

```powershell
npm --prefix server run account:create -- viva-user@example.invalid user "Viva User"
npm --prefix server run account:create -- viva-mod@example.invalid moderator "Viva Moderator"
npm --prefix server run account:create -- viva-admin@example.invalid admin "Viva Admin"
```

These commands create accounts; they are preparation examples, not commands executed for this guide. Each prints a generated password once. Save it privately. Existing duplicate emails are rejected rather than overwritten.

### Suggested demonstration order

1. Explain the architecture and schema relationships.
2. Log in with a wrong password: show 401 in browser Network tools.
3. Log in correctly: show safe JSON fields without exposing the cookie value.
4. Open a private endpoint, log out, and show that private access now returns 401.
5. Sign in as each role and explain 401 versus 403.
6. Rate a title 8 then 9; show the computed rating and activity history.
7. As admin, create a test movie; explain the stored procedure and its two tables.
8. Show a rollback test and explain why no partial data survives.
9. Show genre interests, playlist counts and birthday results as three complex-query examples.
10. Show moderator report handling and recorded reasons.
11. Change filters, open a title, go Back and explain frontend restoration versus database persistence.
12. State the public-page authentication qualification before claiming checklist completion.

### Useful read-only SQL

Run these in pgAdmin/psql against the intended project database. The title-rating example selects an existing title rather than assuming title ID 1 exists.

```sql
SELECT role, COUNT(*) FROM users GROUP BY role;

SELECT proname, prokind
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname=current_schema()
  AND proname IN ('get_title_rating',
                  'save_catalog_title',
                  'log_review_rating_change');

SELECT tgname FROM pg_trigger
WHERE tgrelid='review'::regclass AND NOT tgisinternal;

SELECT * FROM get_title_rating(
  (SELECT title_id FROM media ORDER BY title_id LIMIT 1)
);

SELECT activity_id,title,action,old_rating,new_rating,occurred_at
FROM activity_log ORDER BY activity_id DESC LIMIT 10;
```

`prokind='f'` identifies a function and `'p'` a procedure. Installed-object existence proves installation; route calls and behavior tests prove actual use.

## 14. Likely viva questions and short answers

**Why PostgreSQL instead of storing arrays in React?** PostgreSQL persists shared data, enforces relationships, supports transactions and executes joins/aggregates. React state is temporary UI state.

**Why not store plaintext passwords?** A database leak would immediately expose them. Salted scrypt hashes require expensive guessing instead.

**Is JWT encrypted?** No. Its ordinary payload is encoded and signed, not secret. The signature detects tampering; do not place passwords inside it.

**Why check a database session if JWT has a signature?** A valid signature cannot tell us that the user logged out. The session row lets the server revoke access immediately.

**Why use 401 and 403 separately?** 401 means valid authentication is absent. 403 means the request is refused despite identifying the account, such as a non-admin attempting an admin action.

**How do you stop SQL injection?** Bind user values with `$1`, `$2`, etc., and pass them separately to `pg`. Dynamic SQL identifiers/order fragments must come from controlled choices. Validation alone is not a substitute for parameterization.

**Why a trigger rather than only a JavaScript log call?** It automatically follows relevant database row changes and participates in the same transaction, reducing the chance of a forgotten log operation.

**Function versus procedure?** Our function returns rating statistics and is used in SELECT. Our procedure is invoked with CALL to perform a multi-table save. In PostgreSQL the distinction is more nuanced than “functions never write”; explain our actual use cases.

**Why does the procedure not COMMIT?** The outer transaction includes metadata writes too. Committing inside would break the intended all-or-nothing boundary.

**What happens when the second query fails?** The catch path rolls back the current transaction and rethrows the error. The connection is released in finally.

**Does rollback undo sequence increments?** PostgreSQL sequence allocations are not rolled back like table changes. Gaps in SERIAL IDs do not prove a failed transaction left a row behind.

**INNER JOIN versus LEFT JOIN?** INNER JOIN requires matches. LEFT JOIN also retains unmatched left-side rows, such as an empty watchlist.

**WHERE versus HAVING?** WHERE filters rows before grouping; HAVING filters groups after aggregation. Our playlist query filters ownership with WHERE before counting.

**GROUP BY versus a window function?** GROUP BY combines rows into groups. A window function such as ROW_NUMBER adds a value per row without collapsing them.

**UNION versus UNION ALL?** UNION removes duplicate result rows; UNION ALL preserves them. Our timeline combines different activity events with UNION ALL.

**Why stable ordering for pagination?** Equal scores/timestamps need a tie-breaker, such as title ID. Random browsing uses a stable seed plus a hash of the ID so each page does not reshuffle independently.

**Is the trigger your rating calculator?** No. It records history. `get_title_rating` and `media_rating_summary` calculate aggregates from review rows.

**Are all pages protected?** No. Private account APIs are protected; public discovery pages intentionally support guests. That is the main literal-checklist qualification.

**Does passing tests prove no bugs exist?** No. It confirms tested behaviors. It does not replace code understanding, browser verification or a full security audit.

## 15. Verification results and remaining qualifications

Checks performed for this guide:

- Backend: `npm --prefix server test` passed all 58 tests.
- Frontend: `npm run build` passed.
- Running frontend returned HTTP 200.
- Database-backed `/api/media/filters` returned HTTP 200.
- Read-only database inspection found `get_title_rating`, `log_review_rating_change`, `save_catalog_title` and `review_rating_activity` installed.
- The live database contained accounts for user, moderator and admin roles; no account credentials are included here.

Useful targeted commands, run from the project root:

```powershell
npm --prefix server test
npm run build
node --test server/tests/auth.test.js
node --test server/tests/catalog.test.js
node --test server/tests/rating-trigger.test.js
node --test server/tests/improvements.test.js
```

Existing frontend type-check errors remain in the photo-upload `onCancel` prop in `account-profile.tsx` and untyped `child.props` access in `custom-select.tsx`. A successful build is not the same as a clean TypeScript check. Browser-based end-to-end validation was unavailable for this review; no such pass is claimed.

Other qualifications to understand:

1. Public browsing does not meet a literal requirement to authenticate every page/request.
2. Old per-write import transactions do not make the whole legacy import atomic.
3. Advisory locks protect cooperating application writers; direct SQL can bypass application-only rules such as one vote per user/title.
4. The rating activity log is not an immutable, forever-retained audit system.
5. Frontend navigation state is in-memory convenience, not durable storage or an access-control mechanism.
6. Passing the checklist still requires you to explain the selected code and demonstrate it confidently.

### Final rehearsal statement

> Our strongest evidence is that the database features are installed, called by real endpoints, and covered by behavior tests. We use custom authentication with server-controlled session revocation, explicit transaction boundaries, a rating-audit trigger, a computed-rating function, a multi-table catalog procedure, and multiple joins/aggregations. We distinguish public browsing from protected operations and can explain the remaining checklist qualification instead of claiming features the code does not implement.
