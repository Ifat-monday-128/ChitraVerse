# ChitraVerse

ChitraVerse is an IMDb-style movie and series discovery project. It combines a normalized PostgreSQL database, an Express API, TMDB synchronization, and a cinematic React homepage.

## Project structure

- `server` — Express API, PostgreSQL schema, and TMDB synchronization scripts.
- `frontend` — responsive ChitraVerse homepage.

## Backend setup

1. Create a PostgreSQL database.
2. Run `server/database/schema.sql`.
3. Copy `server/.env.example` to `.env` and configure it.
4. Install packages with `npm install`.
5. Run `npm run sync`, followed by `npm run enrich`.
6. Start the API with `npm run dev`.

The API runs at `http://localhost:5000` by default.

## Frontend setup

1. Open the `frontend` directory.
2. Install packages with `npm install`.
3. Start the homepage with `npm run dev`.

The homepage runs at `http://localhost:3000` by default and expects the backend API at `http://localhost:5000`.

## Run from the project root (Windows PowerShell)

Use Node.js 22.13 or newer. Install both sets of dependencies once:

```powershell
npm.cmd run setup
```

Start both the API and frontend in one terminal:

```powershell
npm.cmd run dev
```

Alternatively, double-click `start.cmd` in the project folder. Use Ctrl+C to stop both services.

On Windows PowerShell, use `npm.cmd` instead of `npm`: the `npm.ps1` wrapper may be blocked by the execution policy. No policy change is needed.

To run each service separately, use two terminals:

```powershell
npm.cmd run dev:server
npm.cmd run dev:frontend
```

Open the Local URL printed by the frontend (normally http://localhost:3000).
The API health endpoint is http://localhost:5000/health.
Backend configuration always loads from `server/.env`, including when launched from the project root.
To use a different API address, set `NEXT_PUBLIC_API_URL` in `frontend/.env.local`.
The homepage displays sample titles when the API or database is unavailable.

Run `npm.cmd test` from the root to build and smoke-test the rendered homepage.
