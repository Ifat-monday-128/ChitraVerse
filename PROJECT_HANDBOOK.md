# CHITRAVERSE — Complete Project Handbook & Defense Guide
## Database, Backend API, Frontend & Evaluation Checklist Manual

---

## TABLE OF CONTENTS
1. [Executive Summary & Tech Stack Overview](#1-executive-summary--tech-stack-overview)
2. [Checklist Item 1: User Authentication](#2-checklist-item-1-user-authentication)
3. [Checklist Item 2: Authentication Validation on Every Page & Endpoint](#3-checklist-item-2-authentication-validation-on-every-page--endpoint)
4. [Checklist Item 3: Explicit Transaction Control (BEGIN, COMMIT, ROLLBACK)](#4-checklist-item-3-explicit-transaction-control-begin-commit-rollback)
5. [Checklist Item 4: Database Triggers & Audit Logging](#5-checklist-item-4-database-triggers--audit-logging)
6. [Checklist Item 5: Database Functions](#6-checklist-item-5-database-functions)
7. [Checklist Item 6: Database Stored Procedures](#7-checklist-item-6-database-stored-procedures)
8. [Checklist Item 7: Complex Database Queries](#8-checklist-item-7-complex-database-queries)
9. [Checklist Item 8: Appropriate Use of Database Features](#9-checklist-item-8-appropriate-use-of-database-features)
10. [Checklist Item 9: Defense Q&A & Code Understanding Guide](#10-checklist-item-9-defense-qa--code-understanding-guide)
11. [Frontend Feature: Smooth In-App YouTube Trailer Player](#11-frontend-feature-smooth-in-app-youtube-trailer-player)

---

## 1. Executive Summary & Tech Stack Overview

**ChitraVerse** is a modern, high-performance web application for browsing Hollywood movies, TV series, awards, cast profiles, user ratings, watchlists, and community discussions.

### Technology Stack
* **Frontend**: Next.js 15 (React 19, TypeScript), Tailwind CSS, Custom SVG/CSS Motion Animations.
* **Backend**: Node.js 22, Express.js 5, Native PostgreSQL driver (`pg` connection pool), JWT.
* **Database**: PostgreSQL with PL/pgSQL Triggers, Functions, Procedures, Views, Composite Indexes, and Foreign Key Constraints.

---

## 2. Checklist Item 1: User Authentication

### Requirement
Authentication of users must be handled by custom code (not third-party OAuth/Firebase). Passwords must be securely hashed (bcrypt/argon2). Role must be read directly from the database during login. Token/session must be issued securely.

### Implementation Details
* **Password Hashing**: Passwords are never stored as plain text. We use `crypto` / `bcrypt` algorithms to generate secure salted hashes.
* **Role Verification**: Roles (`user`, `admin`) are explicitly queried from the `users` database table during authentication. The frontend role claim is never trusted.
* **Session & Token Management**: After successful authentication, a signed JWT token is issued and attached as an `HTTP-Only` secure cookie (`token`) as well as returned for `Authorization: Bearer <token>` headers.

```sql
-- Database Schema for Users
CREATE TABLE users (
  user_id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  avatar TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

```javascript
// Server Authentication Logic (server/src/routes/account.routes.js)
const userResult = await pool.query('SELECT user_id, name, email, password_hash, role, avatar FROM users WHERE email = $1', [email.toLowerCase().trim()]);
if (userResult.rows.length === 0) {
  return res.status(401).json({ error: 'Invalid email or password.' });
}
const user = userResult.rows[0];
const passwordMatch = await bcrypt.compare(password, user.password_hash);
if (!passwordMatch) {
  return res.status(401).json({ error: 'Invalid email or password.' });
}

// Token generation containing DB-verified role
const token = jwt.sign({ userId: user.user_id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
```

---

## 3. Checklist Item 2: Authentication Validation on Every Page & Endpoint

### Requirement
Protected endpoints must verify authentication on every request. Missing/invalid tokens return `401 Unauthorized`. Missing required fields return `400 Bad Request`. Passwords/hashes must never be exposed.

### Implementation Details
We implement authentication middleware (`requireAuth`, `requireAdmin`, `optionalAuth`) that intercept HTTP requests:

1. Extract token from HTTP-only cookie (`req.cookies.token`) or `Authorization` header.
2. Verify token signature using JWT secret.
3. Query database to confirm user active status and current role.
4. Pass `req.user = { user_id, name, email, role }` to downstream route handlers.

```javascript
// Auth Middleware (server/src/routes/account.routes.js)
async function requireAuth(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const userRes = await pool.query('SELECT user_id, name, email, role, avatar FROM users WHERE user_id = $1', [payload.userId]);
    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'User session invalid or expired.' });
    }
    req.user = userRes.rows[0]; // Password hash is NOT included
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session token.' });
  }
}
```

---

## 4. Checklist Item 3: Explicit Transaction Control (BEGIN, COMMIT, ROLLBACK)

### Requirement
Every multi-step DML operation (Insert/Update/Delete) must enforce explicit database transaction control. If any step fails, the transaction must be explicitly rolled back.

### Implementation Details
We use NodeJS PostgreSQL client transactions with explicit SQL execution: `BEGIN`, `COMMIT`, and `ROLLBACK`.

```javascript
// Explicit Transaction Example: Catalog Modification Flow
// File: server/src/queries/transactions.queries.js
const client = await pool.connect();
try {
  await client.query('BEGIN'); // Start explicit transaction

  await client.query('COMMIT'); // Commit all changes if successful
} catch (error) {
  await client.query('ROLLBACK'); // Revert all changes on any failure
  throw error;
} finally {
  client.release(); // Return client back to connection pool
}
```

---

## 5. Checklist Item 4: Database Triggers & Audit Logging

### Requirement
The project must feature one or more database triggers used for data validation or logging sensitive actions to a shadow audit table.

### Implementation Details
* **Trigger Name**: `review_rating_activity`
* **Target Table**: `review`
* **Trigger Event**: `AFTER INSERT OR UPDATE OR DELETE ON review FOR EACH ROW`
* **Shadow Table**: `activity_log`

Whenever a user adds, modifies, or deletes a rating/review on any movie or TV series, the trigger automatically fires PL/pgSQL function `log_review_rating_change()`. It calculates the before and after rating, formats human-readable detail ("Rated 8.5/10", "Changed rating from 7.0 to 9.0/10"), and records an immutable log entry into the shadow `activity_log` table.

```sql
-- Shadow Audit Table Definition
CREATE TABLE activity_log (
  activity_id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  title_id INT REFERENCES media(title_id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('rating_added','rating_changed','rating_removed')),
  old_rating DECIMAL(3,1),
  new_rating DECIMAL(3,1),
  detail TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- PL/pgSQL Trigger Function
CREATE OR REPLACE FUNCTION log_review_rating_change() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  before_rating DECIMAL(3,1);
  after_rating DECIMAL(3,1);
  account_id INT;
  media_id INT;
  media_title TEXT;
  event_action TEXT;
  event_detail TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN before_rating := OLD.rating; END IF;
  IF TG_OP <> 'DELETE' THEN after_rating := NEW.rating; END IF;
  IF before_rating IS NOT DISTINCT FROM after_rating THEN RETURN NULL; END IF;
  
  IF TG_OP = 'DELETE' THEN
    account_id := OLD.user_id; media_id := OLD.title_id;
  ELSE
    account_id := NEW.user_id; media_id := NEW.title_id;
  END IF;

  SELECT title INTO media_title FROM media WHERE title_id = media_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF before_rating IS NULL THEN
    event_action := 'rating_added';
    event_detail := 'Rated ' || after_rating || '/10';
  ELSIF after_rating IS NULL THEN
    event_action := 'rating_removed';
    event_detail := 'Removed rating of ' || before_rating || '/10';
  ELSE
    event_action := 'rating_changed';
    event_detail := 'Changed rating from ' || before_rating || ' to ' || after_rating || '/10';
  END IF;

  INSERT INTO activity_log(user_id, title_id, title, action, old_rating, new_rating, detail)
  VALUES(account_id, media_id, media_title, event_action, before_rating, after_rating, event_detail);

  RETURN NULL;
END;
$$;

-- Trigger Declaration
CREATE OR REPLACE TRIGGER review_rating_activity
AFTER INSERT OR UPDATE OR DELETE ON review
FOR EACH ROW EXECUTE FUNCTION log_review_rating_change();
```

---

## 6. Checklist Item 5: Database Functions

### Requirement
Must use one or more stored database functions to compute and return statistical values.

### Implementation Details
* **Function Name**: `get_title_rating(p_title_id INT)`
* **Return Type**: `TABLE(chitraverse_rating NUMERIC, chitraverse_vote_count INT)`
* **Description**: Returns the rounded average ChitraVerse community rating and vote count for a specific title.

```sql
CREATE OR REPLACE FUNCTION get_title_rating(p_title_id INT)
RETURNS TABLE(chitraverse_rating NUMERIC, chitraverse_vote_count INT)
LANGUAGE sql STABLE AS $$
  SELECT 
    ROUND(AVG(r.rating), 1) AS chitraverse_rating,
    COUNT(r.rating)::INT AS chitraverse_vote_count
  FROM review r 
  WHERE r.title_id = p_title_id;
$$;
```

---

## 7. Checklist Item 6: Database Stored Procedures

### Requirement
Must use at least one stored procedure to execute multi-step workflows modifying several tables in one operation.

### Implementation Details
* **Procedure Name**: `save_catalog_title(...)`
* **Tables Modified**: `media`, `movie`, `series`

This procedure accepts catalog media metadata. It handles creation or updating of the base `media` record, validates constraints, locks records with `FOR UPDATE` concurrency control, and automatically inserts or updates the corresponding subtype table (`movie` or `series`).

```sql
CREATE OR REPLACE PROCEDURE save_catalog_title(
  INOUT p_title_id INT, 
  IN p_type TEXT, 
  IN p_title TEXT,
  IN p_description TEXT, 
  IN p_language TEXT, 
  IN p_poster TEXT,
  IN p_trailer TEXT, 
  IN p_release DATE, 
  IN p_runtime INT
)
LANGUAGE plpgsql AS $$
DECLARE 
  actual_type TEXT;
BEGIN
  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'Title is required' USING ERRCODE = '22023';
  END IF;

  IF p_title_id IS NULL THEN
    IF p_type NOT IN ('movie', 'series') OR p_type IS NULL THEN
      RAISE EXCEPTION 'Invalid media type' USING ERRCODE = '22023';
    END IF;
    INSERT INTO media(title, description, language, poster, trailer_link)
    VALUES(p_title, p_description, p_language, p_poster, p_trailer)
    RETURNING title_id INTO p_title_id;
    actual_type := p_type;
  ELSE
    PERFORM 1 FROM media WHERE title_id = p_title_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Title not found' USING ERRCODE = 'P0002'; END IF;
    SELECT CASE WHEN EXISTS(SELECT 1 FROM movie WHERE title_id = p_title_id) THEN 'movie' ELSE 'series' END INTO actual_type;
    UPDATE media SET title = p_title, description = p_description, language = p_language,
      poster = p_poster, trailer_link = p_trailer WHERE title_id = p_title_id;
  END IF;

  IF actual_type = 'movie' THEN
    INSERT INTO movie(title_id, release_date, runtime) 
    VALUES(p_title_id, p_release, p_runtime)
    ON CONFLICT(title_id) DO UPDATE 
    SET release_date = EXCLUDED.release_date, runtime = EXCLUDED.runtime;
  ELSE
    INSERT INTO series(title_id, first_air_date) 
    VALUES(p_title_id, p_release)
    ON CONFLICT(title_id) DO UPDATE 
    SET first_air_date = EXCLUDED.first_air_date;
  END IF;
END;
$$;
```

---

## 8. Checklist Item 7: Complex Database Queries

### Requirement
Must use three or more complex queries combining multiple table JOINs, subqueries/CTEs, and aggregate functions.

### Query 1: Full Search & Filter with Genre Aggregation & Rating Aggregation
Retrieves media items matching multi-field criteria (type, rating, runtime, year range, genre) while joining `media`, `movie`, `series`, `media_genre`, `genre`, and computing community aggregate ratings.

```sql
SELECT 
  m.title_id, m.title, m.poster, m.tmdb_rating, m.trailer_link,
  COALESCE(mv.release_date, s.first_air_date) AS release_date,
  mv.runtime,
  CASE WHEN mv.title_id IS NOT NULL THEN 'movie' ELSE 'series' END AS media_type,
  ROUND(AVG(r.rating), 1) AS chitraverse_rating,
  COUNT(r.rating)::INT AS chitraverse_vote_count,
  COALESCE(
    json_agg(DISTINCT jsonb_build_object('name', g.name)) 
    FILTER (WHERE g.name IS NOT NULL), '[]'
  ) AS genres
FROM media m
LEFT JOIN movie mv ON mv.title_id = m.title_id
LEFT JOIN series s ON s.title_id = m.title_id
LEFT JOIN media_genre mg ON mg.title_id = m.title_id
LEFT JOIN genre g ON g.genre_id = mg.genre_id
LEFT JOIN review r ON r.title_id = m.title_id
WHERE ($1::TEXT IS NULL OR m.title ILIKE '%' || $1 || '%')
GROUP BY m.title_id, mv.release_date, s.first_air_date, mv.runtime, mv.title_id
HAVING ($2::DECIMAL IS NULL OR ROUND(AVG(r.rating), 1) >= $2)
ORDER BY m.tmdb_rating DESC NULLS LAST
LIMIT $3 OFFSET $4;
```

### Query 2: Detailed Media View with Cast, Crew, Production Houses, and Seasons
Assembles full page metadata for a movie or TV show using multiple `LEFT JOIN`s and JSON aggregations across `media_cast_crew`, `cast_crew`, `role`, `media_company`, `production_house`, and `season_episode_summary`.

```sql
SELECT 
  m.*,
  mv.runtime, mv.release_date, s.status, s.first_air_date, s.last_air_date,
  (SELECT json_agg(json_build_object('cast_crew_id', c.cast_crew_id, 'name', c.name, 'photo', c.photo, 'role_type', r.role_name))
   FROM media_cast_crew mcc 
   JOIN cast_crew c ON c.cast_crew_id = mcc.cast_crew_id 
   JOIN role r ON r.role_id = mcc.role_id 
   WHERE mcc.title_id = m.title_id) AS cast_crew,
  (SELECT json_agg(json_build_object('company_id', ph.company_id, 'name', ph.name, 'country', ph.country, 'logo', ph.logo))
   FROM media_company mc 
   JOIN production_house ph ON ph.company_id = mc.company_id 
   WHERE mc.title_id = m.title_id) AS production_companies
FROM media m
LEFT JOIN movie mv ON mv.title_id = m.title_id
LEFT JOIN series s ON s.title_id = m.title_id
WHERE m.title_id = $1;
```

### Query 3: Admin Analytics & System Activity Overview
Aggregates key system metrics using aggregate functions (`COUNT`, `AVG`, `MAX`), CTEs, and activity logs across users, media titles, reviews, and activity logs.

```sql
WITH user_stats AS (
  SELECT COUNT(*)::INT AS total_users FROM users
),
media_stats AS (
  SELECT 
    COUNT(*)::INT AS total_titles,
    COUNT(CASE WHEN EXISTS(SELECT 1 FROM movie WHERE title_id = m.title_id) THEN 1 END)::INT AS total_movies,
    COUNT(CASE WHEN EXISTS(SELECT 1 FROM series WHERE title_id = m.title_id) THEN 1 END)::INT AS total_series
  FROM media m
),
review_stats AS (
  SELECT COUNT(*)::INT AS total_reviews, ROUND(AVG(rating), 2) AS avg_community_rating FROM review
)
SELECT 
  us.total_users, ms.total_titles, ms.total_movies, ms.total_series, rs.total_reviews, rs.avg_community_rating
FROM user_stats us, media_stats ms, review_stats rs;
```

---

## 9. Checklist Item 8: Appropriate Use of Database Features

* **Primary & Foreign Keys**: Enforced on all tables with explicit cascading rules (`ON DELETE CASCADE` for child entries like `movie`, `series`, `review`, `favourite`, `watchlist_item`; `ON DELETE RESTRICT` for reference lookup `role`).
* **Composite Indexes**:
  * `idx_media_title` ON `media(title)`
  * `idx_media_tmdb_rating` ON `media(tmdb_rating)`
  * `idx_user_email` ON `users(email)`
  * `idx_activity_log_user_time` ON `activity_log(user_id, occurred_at DESC, activity_id DESC)`
  * `idx_media_tmdb_identity` UNIQUE ON `media(tmdb_id, tmdb_type)`
* **Database Views**:
  * `media_rating_summary`: Pre-calculates average rating and vote count per media item.
  * `season_episode_summary`: Computes total episodes per season.

---

## 10. Checklist Item 9: Defense Q&A & Code Understanding Guide

### Key Questions & Answers for Evaluation

**Q1: How does authentication work from request to database?**
> *Answer*: When a user submits credentials, the server queries `users` by email. If found, `bcrypt.compare` checks the password against `password_hash`. On match, a JWT containing `userId` and DB role is created and stored in an HTTP-only cookie. On subsequent requests, `requireAuth` middleware verifies the token and re-verifies user existence in the database.

**Q2: What happens if a database operation fails during a procedure or multi-table update?**
> *Answer*: In PostgreSQL, procedures run inside transaction blocks. If an exception occurs, PL/pgSQL aborts execution and raises an error code (e.g., `22023`). On the Node.js backend, our `try...catch` block catches the error and executes `client.query('ROLLBACK')`, guaranteeing data consistency.

**Q3: How does the trigger record user actions automatically?**
> *Answer*: The `review_rating_activity` trigger is attached `AFTER INSERT OR UPDATE OR DELETE ON review`. Whenever a row in `review` is modified, PostgreSQL invokes `log_review_rating_change()`. This PL/pgSQL function accesses special variables `OLD` and `NEW` to inspect previous and new ratings, and inserts a audit row into `activity_log`.

---

## 11. Frontend Feature: Smooth In-App YouTube Trailer Player

### Enhancement Details
To prevent external redirects to YouTube, we built an embedded, responsive **Trailer Modal**:
* **Glassmorphism Backdrop**: Uses `backdrop-filter: blur(16px) saturate(180%)` with dark ambient backdrop (`rgba(4, 5, 7, 0.88)`).
* **Smooth Animation**: Smooth scale-up (`scale(0.92)` to `scale(1)`) and opacity fade-in transition (`cubic-bezier(0.16, 1, 0.3, 1)`).
* **Keyboard & Click Listener**: Listens for `Escape` key press or backdrop clicks to close smoothly.
* **YouTube Embed**: Uses `youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1` with full privacy and high-definition widescreen aspect ratio (16:9).

---
*Manual compiled for ChitraVerse Final Project Evaluation.*
