CREATE TABLE IF NOT EXISTS homepage_feature (
  title_id INT PRIMARY KEY REFERENCES media(title_id) ON DELETE CASCADE,
  position INT NOT NULL UNIQUE CHECK(position >= 0)
);
