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
