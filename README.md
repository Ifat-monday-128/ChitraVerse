# ChitraVerse

ChitraVerse is an IMDb-style movie and series discovery project. It combines a normalized PostgreSQL database, an Express API, TMDB synchronization, and a cinematic React homepage.

## Project structure

- `chitraverse/server` — Express API, PostgreSQL schema, and TMDB synchronization scripts.
- `frontend` — responsive ChitraVerse homepage.

## Backend setup

1. Create a PostgreSQL database.
2. Run `chitraverse/server/database/schema.sql`.
3. Copy `chitraverse/server/.env.example` to `.env` and configure it.
4. Install packages with `npm install`.
5. Run `npm run sync`, followed by `npm run enrich`.
6. Start the API with `npm run dev`.

The API runs at `http://localhost:5000` by default.

## Frontend setup

1. Open the `frontend` directory.
2. Install packages with `npm install`.
3. Start the homepage with `npm run dev`.

The homepage runs at `http://localhost:3000` by default and expects the backend API at `http://localhost:5000`.
