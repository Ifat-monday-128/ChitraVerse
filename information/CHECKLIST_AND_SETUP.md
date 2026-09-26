# Checklist implementation and new features

## Gmail password reset setup

In `server/.env`, fill in the two empty settings:

```dotenv
GMAIL_USER=your-sender@gmail.com
GMAIL_APP_PASSWORD=your_google_app_password
```

Enable 2-Step Verification on the sender's Google account, then create an App Password. Use that App Password, not the normal Gmail password. Restart the backend after saving `.env`. Never commit or share this file. See [Nodemailer's Gmail guide](https://nodemailer.com/guides/using-gmail).

On the sign-in screen, select **Forgot password?**, enter the email address of an existing ChitraVerse account, and request a code. Enter the emailed six-digit code and a new password, then select **Verify code & reset password**. The new password must have 8-128 characters.

The server stores a salted scrypt hash of the code. Codes expire after 10 minutes and are single-use; five wrong attempts invalidate a code. Resending requires a 60-second wait and replaces the old code. Requests are rate limited by IP. A successful reset changes the password hash and deletes all account sessions and the reset challenge in the same transaction. A normal authenticated password change also invalidates outstanding reset codes.

Known and unknown emails receive the same successful request message. Missing Gmail configuration and SMTP failures return an actionable error. Automated tests substitute the mail sender; real inbox delivery must be checked after configuring Gmail.

## Import a movie or TV series

Sign in as an administrator, open catalog management, and select **+ Add title**. The TMDB import section appears above the manual fields. Paste a link such as `https://www.themoviedb.org/movie/774` or a TV link in the form `https://www.themoviedb.org/tv/ID`, then select **Fetch & add from TMDB**.

The server validates the host and extracts the ID; it only requests the fixed TMDB API host. Keep the existing `TMDB_TOKEN` configured in `server/.env`.

The importer fetches all TMDB fields represented by these existing tables:

| Tables | Imported information |
| --- | --- |
| `media`, `movie`, `series` | Title, synopsis, original language, poster, TMDB score, budget/revenue when available, runtime, dates, series status, YouTube trailer |
| `genre`, `media_genre` | Genres and title memberships |
| `cast_crew`, `role`, `media_cast_crew` | Movie credits or aggregate TV credits, biographies, photos, birthdays and job relationships |
| `production_house`, `media_company` | Companies, origin countries, logos and title memberships |
| `season`, `episode` | All returned seasons including specials, episode names/numbers, runtimes and air dates |
| `streaming_platform`, `media_platform` | Provider names/logos and title memberships for `TMDB_WATCH_REGION` (defaults to `BD`) |

Missing source values remain null. Awards, genre descriptions and platform website addresses are not provided by these endpoints and are not fabricated. User ratings, comments, favorites and watchlists are not imported or overwritten. Provider availability comes from JustWatch through TMDB; the current schema does not distinguish subscription, rental and purchase offers.

Requests run with limited concurrency, and progress appears in the import panel. Network requests finish before one database transaction saves the title and all relationships. Failure rolls back that save. Reimporting updates the same title ID and preserves user activity. Movie and TV IDs use distinct namespaces through `media.tmdb_type` and a composite unique index.

Import jobs run inside the API process. Keep the server running; a restart loses job status. If status is lost, check the catalog before retrying. Repeating an import is safe. Very large imports have a 10-minute network-fetch deadline.

## Evaluation demonstration

| Checklist | Implementation and demonstration |
| --- | --- |
| Own authentication | `account.routes.js`: database email/password lookup, scrypt comparison, database role, signed HTTP-only JWT cookie with revocable `user_session` record. Demonstrate user/admin login and logout. |
| Authentication coverage | Catalog browsing and published stories are public, as requested. Private account features and admin operations verify sessions on the backend. The checklist wording requiring authentication on every page is intentionally not applied to public browsing. |
| Explicit DML transactions | `config/db.js`: `withTransaction()` runs BEGIN/COMMIT/ROLLBACK on one connection; `write()` wraps standalone writes. Existing multi-step routes retain their explicit transaction blocks. Import scripts also use explicit writes. |
| Trigger | `review_rating_activity` invokes `log_review_rating_change()` when a rating changes and writes `activity_log` in the same transaction. Demonstrate rating then changing a title's score. |
| Computed-value function | `get_title_rating(title_id)` returns the mean user rating and vote count. The save-rating endpoint calls it. |
| Procedure | `save_catalog_title(...)` saves the shared media row and movie/series row. The admin manual editor calls this procedure inside `withTransaction()`. |
| Complex queries | Genre interests use joins, ranking and aggregation; birthdays join people/credits/roles and group results; the admin dashboard aggregates counts and combines recent activity. |

Read-only function demonstration (replace `1` with an existing title ID):

```sql
SELECT * FROM get_title_rating(1);
SELECT * FROM activity_log ORDER BY occurred_at DESC LIMIT 10;
```

Procedure and rollback demonstration, which leaves no demonstration title behind:

```sql
BEGIN;
CALL save_catalog_title(NULL::int, 'movie'::text, 'Demonstration title'::text,
  'Demonstration synopsis'::text, 'en'::text, NULL::text, NULL::text,
  '2026-01-01'::date, 100::int);
-- Inspect the returned title ID in media and movie before rolling back.
ROLLBACK;
```

The schema changes are migration `005` (function, procedure, password reset table) and `006` (TMDB identity column/index). Existing catalog/user tables and their primary keys remain intact. The server applies migrations at startup; `npm.cmd run migrate` can apply them explicitly. Do not rerun the base schema on an existing database.

Run `npm.cmd test` for backend integration tests, frontend build, typecheck, and rendered-HTML checks. `npm.cmd --prefix frontend run lint` checks frontend lint. These checks do not replace practicing the viva: explain why each transaction, function, procedure, and trigger is used.
