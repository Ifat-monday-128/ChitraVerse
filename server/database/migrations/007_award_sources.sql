-- Preserve the existing awards table while making imported facts traceable.
ALTER TABLE awards ALTER COLUMN category TYPE TEXT;
ALTER TABLE awards ADD COLUMN IF NOT EXISTS source_name TEXT;
ALTER TABLE awards ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE awards ADD COLUMN IF NOT EXISTS source_key TEXT;
ALTER TABLE awards ADD COLUMN IF NOT EXISTS retrieved_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS idx_awards_source ON awards(title_id,source_key);
CREATE INDEX IF NOT EXISTS idx_awards_title ON awards(title_id);
CREATE INDEX IF NOT EXISTS idx_awards_year ON awards(year);
