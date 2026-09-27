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
