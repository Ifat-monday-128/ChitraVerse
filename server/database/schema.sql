CREATE TABLE users (
user_id SERIAL PRIMARY KEY,
name VARCHAR(255) NOT NULL,
email VARCHAR(255) UNIQUE NOT NULL,
password_hash TEXT NOT NULL,
role VARCHAR(50),
avatar TEXT,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE media (
title_id SERIAL PRIMARY KEY,
tmdb_id INT UNIQUE,
title VARCHAR(255) NOT NULL,
description TEXT,
language VARCHAR(50),
poster TEXT,
tmdb_rating DECIMAL(3,1) CHECK (tmdb_rating BETWEEN 0 AND 10),
budget BIGINT,
trailer_link TEXT
);

CREATE TABLE homepage_feature (
title_id INT PRIMARY KEY REFERENCES media(title_id) ON DELETE CASCADE,
position INT NOT NULL UNIQUE CHECK(position >= 0)
);

CREATE TABLE movie (
title_id INT PRIMARY KEY,
runtime INT,
release_date DATE,
box_office_gross BIGINT,
FOREIGN KEY(title_id) REFERENCES media(title_id) ON DELETE CASCADE
);

CREATE TABLE series (
title_id INT PRIMARY KEY,
status VARCHAR(50),
first_air_date DATE,
last_air_date DATE,
FOREIGN KEY(title_id) REFERENCES media(title_id) ON DELETE CASCADE
);

CREATE TABLE season (
season_id SERIAL PRIMARY KEY,
title_id INT,
season_number INT,
UNIQUE(title_id, season_number),
FOREIGN KEY(title_id) REFERENCES series(title_id) ON DELETE CASCADE
);

CREATE TABLE episode (
ep_id SERIAL PRIMARY KEY,
season_id INT,
title VARCHAR(255),
episode_number INT,
runtime INT,
air_date DATE,
UNIQUE(season_id, episode_number),
FOREIGN KEY(season_id) REFERENCES season(season_id) ON DELETE CASCADE
);

CREATE TABLE genre (
genre_id SERIAL PRIMARY KEY,
tmdb_id INT UNIQUE,
name VARCHAR(100) UNIQUE NOT NULL,
description TEXT
);
CREATE TABLE media_genre (
title_id INT,
genre_id INT,
PRIMARY KEY(title_id, genre_id),
FOREIGN KEY(title_id) REFERENCES media(title_id) ON DELETE CASCADE,
FOREIGN KEY(genre_id) REFERENCES genre(genre_id) ON DELETE CASCADE
);
CREATE TABLE cast_crew (
cast_crew_id SERIAL PRIMARY KEY,
tmdb_id INT UNIQUE,
name VARCHAR(255),
biography TEXT,
photo TEXT,
date_of_birth DATE
);
CREATE TABLE role (
role_id SERIAL PRIMARY KEY,
role_name VARCHAR(100) UNIQUE NOT NULL
);
CREATE TABLE media_cast_crew (
title_id INT,
cast_crew_id INT,
role_id INT,
PRIMARY KEY(title_id, cast_crew_id, role_id),
FOREIGN KEY(title_id) REFERENCES media(title_id) ON DELETE CASCADE,
FOREIGN KEY(cast_crew_id) REFERENCES cast_crew(cast_crew_id) ON DELETE CASCADE,
FOREIGN KEY(role_id) REFERENCES role(role_id) ON DELETE RESTRICT
);
CREATE TABLE production_house (
company_id SERIAL PRIMARY KEY,
tmdb_id INT UNIQUE,
name VARCHAR(255),
country VARCHAR(100),
logo TEXT
);
CREATE TABLE media_company (
title_id INT,
company_id INT,
PRIMARY KEY(title_id, company_id),
FOREIGN KEY(title_id) REFERENCES media(title_id) ON DELETE CASCADE,
FOREIGN KEY(company_id) REFERENCES production_house(company_id) ON DELETE CASCADE
);
CREATE TABLE awards (
award_id SERIAL PRIMARY KEY,
title_id INT,
name VARCHAR(255),
year INT,
category VARCHAR(100),
description TEXT,
FOREIGN KEY(title_id) REFERENCES media(title_id) ON DELETE CASCADE
);
CREATE TABLE review (
review_id SERIAL PRIMARY KEY,
user_id INT,
title_id INT,
content TEXT,
rating DECIMAL(3,1) CHECK (rating BETWEEN 0 AND 10),
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE,
FOREIGN KEY(title_id) REFERENCES media(title_id) ON DELETE CASCADE
);
CREATE TABLE favourite (
favourite_id SERIAL PRIMARY KEY,
user_id INT,
title_id INT,
added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE,
FOREIGN KEY(title_id) REFERENCES media(title_id) ON DELETE CASCADE
);
CREATE TABLE watchlist (
watchlist_id SERIAL PRIMARY KEY,
user_id INT NOT NULL,
name VARCHAR(255) NOT NULL,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
CREATE TABLE watchlist_item (
watchlist_id INT NOT NULL,
title_id INT NOT NULL,
added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
PRIMARY KEY(watchlist_id, title_id),
FOREIGN KEY(watchlist_id) REFERENCES watchlist(watchlist_id) ON DELETE CASCADE,
FOREIGN KEY(title_id) REFERENCES media(title_id) ON DELETE CASCADE
);
CREATE TABLE streaming_platform (
platform_id SERIAL PRIMARY KEY,
name VARCHAR(100),
website TEXT,
logo TEXT
);
CREATE TABLE media_platform (
title_id INT,
platform_id INT,
PRIMARY KEY(title_id, platform_id),
FOREIGN KEY(title_id) REFERENCES media(title_id) ON DELETE CASCADE,
FOREIGN KEY(platform_id) REFERENCES streaming_platform(platform_id) ON DELETE CASCADE
);
CREATE INDEX idx_media_title ON media(title);
CREATE INDEX idx_media_tmdb_rating ON media(tmdb_rating);
CREATE INDEX idx_user_email ON users(email);

CREATE VIEW media_rating_summary AS
SELECT
m.title_id,
m.tmdb_rating,
ROUND(AVG(r.rating), 1) AS chitraverse_rating,
COUNT(r.rating)::INT AS chitraverse_vote_count
FROM media m
LEFT JOIN review r ON r.title_id = m.title_id
GROUP BY m.title_id, m.tmdb_rating;

CREATE VIEW season_episode_summary AS
SELECT
s.season_id,
s.title_id,
s.season_number,
COUNT(e.ep_id)::INT AS total_episode
FROM season s
LEFT JOIN episode e ON e.season_id = s.season_id
GROUP BY s.season_id, s.title_id, s.season_number;

-- Rating history starts when this migration is installed; existing votes are not backfilled.
CREATE TABLE IF NOT EXISTS activity_log (
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
CREATE INDEX IF NOT EXISTS idx_activity_log_user_time ON activity_log(user_id, occurred_at DESC, activity_id DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_time ON activity_log(occurred_at DESC, activity_id DESC);

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
  -- Parent deletion cascades are not deliberate rating removals.
  IF NOT EXISTS (SELECT 1 FROM users WHERE user_id = account_id) THEN RETURN NULL; END IF;
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
  INSERT INTO activity_log(user_id,title_id,title,action,old_rating,new_rating,detail)
  VALUES(account_id,media_id,media_title,event_action,before_rating,after_rating,event_detail);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER review_rating_activity
AFTER INSERT OR UPDATE OR DELETE ON review
FOR EACH ROW EXECUTE FUNCTION log_review_rating_change();

CREATE OR REPLACE FUNCTION get_title_rating(p_title_id INT)
RETURNS TABLE(chitraverse_rating NUMERIC, chitraverse_vote_count INT)
LANGUAGE sql STABLE AS $$
  SELECT ROUND(AVG(r.rating),1), COUNT(r.rating)::INT
  FROM review r WHERE r.title_id=p_title_id;
$$;

-- The caller owns BEGIN/COMMIT/ROLLBACK; both tables succeed or fail together.
CREATE OR REPLACE PROCEDURE save_catalog_title(
  INOUT p_title_id INT, IN p_type TEXT, IN p_title TEXT,
  IN p_description TEXT, IN p_language TEXT, IN p_poster TEXT,
  IN p_trailer TEXT, IN p_release DATE, IN p_runtime INT
)
LANGUAGE plpgsql AS $$
DECLARE actual_type TEXT;
BEGIN
  IF p_title IS NULL OR length(trim(p_title))=0 THEN
    RAISE EXCEPTION 'Title is required' USING ERRCODE='22023';
  END IF;
  IF p_title_id IS NULL THEN
    IF p_type NOT IN ('movie','series') OR p_type IS NULL THEN
      RAISE EXCEPTION 'Invalid media type' USING ERRCODE='22023';
    END IF;
    INSERT INTO media(title,description,language,poster,trailer_link)
      VALUES(p_title,p_description,p_language,p_poster,p_trailer) RETURNING title_id INTO p_title_id;
    actual_type := p_type;
  ELSE
    PERFORM 1 FROM media WHERE title_id=p_title_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Title not found' USING ERRCODE='P0002'; END IF;
    SELECT CASE WHEN EXISTS(SELECT 1 FROM movie WHERE title_id=p_title_id) THEN 'movie' ELSE 'series' END INTO actual_type;
    UPDATE media SET title=p_title,description=p_description,language=p_language,
      poster=p_poster,trailer_link=p_trailer WHERE title_id=p_title_id;
  END IF;
  IF actual_type='movie' THEN
    INSERT INTO movie(title_id,release_date,runtime) VALUES(p_title_id,p_release,p_runtime)
      ON CONFLICT(title_id) DO UPDATE SET release_date=EXCLUDED.release_date,runtime=EXCLUDED.runtime;
  ELSE
    INSERT INTO series(title_id,first_air_date) VALUES(p_title_id,p_release)
      ON CONFLICT(title_id) DO UPDATE SET first_air_date=EXCLUDED.first_air_date;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS password_reset (
  user_id INT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TMDB movie IDs and TV IDs belong to separate namespaces.
ALTER TABLE media ADD COLUMN IF NOT EXISTS tmdb_type VARCHAR(5);
UPDATE media m SET tmdb_type=CASE
  WHEN EXISTS(SELECT 1 FROM movie WHERE title_id=m.title_id) THEN 'movie'
  WHEN EXISTS(SELECT 1 FROM series WHERE title_id=m.title_id) THEN 'tv'
  ELSE NULL END
WHERE tmdb_id IS NOT NULL AND tmdb_type IS NULL;
ALTER TABLE media DROP CONSTRAINT IF EXISTS media_tmdb_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_media_tmdb_identity ON media(tmdb_id,tmdb_type);
