-- TMDB movie IDs and TV IDs belong to separate namespaces.
ALTER TABLE media ADD COLUMN IF NOT EXISTS tmdb_type VARCHAR(5);
UPDATE media m SET tmdb_type=CASE
  WHEN EXISTS(SELECT 1 FROM movie WHERE title_id=m.title_id) THEN 'movie'
  WHEN EXISTS(SELECT 1 FROM series WHERE title_id=m.title_id) THEN 'tv'
  ELSE NULL END
WHERE tmdb_id IS NOT NULL AND tmdb_type IS NULL;
ALTER TABLE media DROP CONSTRAINT IF EXISTS media_tmdb_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_media_tmdb_identity ON media(tmdb_id,tmdb_type);
