-- Add indexes for search and a small session table; existing media data stays intact.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_media_title_trigram ON media USING gin (lower(title) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_media_search ON media USING gin (
  (setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
   setweight(to_tsvector('simple', coalesce(description, '')), 'D'))
);
CREATE INDEX IF NOT EXISTS idx_cast_name_trigram ON cast_crew USING gin (lower(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_media_cast_person ON media_cast_crew (cast_crew_id, title_id);
CREATE TABLE IF NOT EXISTS user_session (
  token_hash TEXT PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_expiry ON user_session(expires_at);
