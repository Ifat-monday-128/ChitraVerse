CREATE TABLE IF NOT EXISTS media_comment (
  comment_id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  title_id INT NOT NULL REFERENCES media(title_id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_media_comment_title ON media_comment(title_id, created_at DESC);
CREATE TABLE IF NOT EXISTS community_post (
  post_id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 10000),
  media_id INT REFERENCES media(title_id) ON DELETE SET NULL,
  cast_crew_id INT REFERENCES cast_crew(cast_crew_id) ON DELETE SET NULL,
  genre_id INT REFERENCES genre(genre_id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_community_post_feed ON community_post(created_at DESC, post_id DESC);
