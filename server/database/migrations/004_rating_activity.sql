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
