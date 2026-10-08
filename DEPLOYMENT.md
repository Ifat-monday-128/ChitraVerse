# Supabase + Render + Vercel deployment

ChitraVerse uses Supabase for PostgreSQL, Render for the persistent Express API,
and Vercel for the Next.js frontend. Supabase Auth is not used; the existing
database-backed, revocable cookie sessions remain the authentication system.

## 1. Upload PostgreSQL to Supabase

Create a Supabase project in a region close to the Render service. This
repository's `render.yaml` selects Singapore. Keep the database password.

For an existing database, follow Supabase's PostgreSQL migration workflow and
use the Session pooler for the dump/restore operation. For an empty database,
execute `server/database/schema.sql`, followed by every file in
`server/database/migrations` in filename order.

Verify the result in Supabase's SQL editor:

```sql
select count(*) from users;
select count(*) from media;
select count(*) from user_session;
```

In Supabase's **Connect** dialog, copy the **Session pooler** URL. It normally
uses port 5432. Use the URL as supplied for the Render `DATABASE_URL`; the
Blueprint enables TLS with `DB_SSL=true`.

## 2. Deploy the Express API to Render

Push this repository to GitHub. In Render, choose **New > Blueprint**, connect
the repository, and use the checked-in `render.yaml`. It configures:

- Root directory: `server`
- Build command: `npm ci`
- Start command: `npm start`
- Health check: `/health`
- Region: Singapore

During initial Blueprint creation, Render asks for the variables marked as
secrets. Enter:

```dotenv
DATABASE_URL=postgresql://postgres.project-ref:password@pooler-host:5432/postgres
TMDB_TOKEN=your-tmdb-bearer-token
FRONTEND_ORIGINS=https://temporary.example
```

Use the exact URL supplied by Supabase because its host and username are
project-specific. Render generates `JWT_SECRET` automatically. The temporary
frontend origin will be replaced after Vercel assigns the real URL.

Wait for deployment, then open:

```text
https://chitraverse-api.onrender.com/health
```

Use the actual hostname assigned by Render. The expected response is
`{ "status": "ok" }`.

The server applies repeatable incremental migrations during startup. The base
schema must already exist in Supabase before the first Render deployment.

## 3. Deploy the Next.js frontend to Vercel

Import the same GitHub repository into Vercel and set **Root Directory** to
`frontend`. Vercel detects Next.js and runs `npm run build`.

Add this Production environment variable, using the real Render hostname:

```dotenv
API_PROXY_URL=https://chitraverse-api.onrender.com
```

Do not set `NEXT_PUBLIC_API_URL` in production. The server-side rewrite proxies
browser `/api` requests to Render while keeping authentication cookies
first-party.

Deploy the frontend and copy its stable production URL, for example:

```text
https://chitraverse.vercel.app
```

## 4. Finish CORS configuration

Open the Render service's Environment settings and replace
`FRONTEND_ORIGINS` with the exact Vercel production origin:

```dotenv
FRONTEND_ORIGINS=https://chitraverse.vercel.app
```

Do not include a path or trailing slash. Save and redeploy the Render service.
Multiple exact origins can be comma-separated if a custom domain is added.

## 5. Final checks

1. Confirm the Render `/health` endpoint returns `{ "status": "ok" }`.
2. Open the Vercel frontend and confirm catalog records load.
3. Sign in and sign out as `user`, `moderator`, and `admin`, one after another.
4. After each logout, refresh a protected page and confirm access is rejected.
5. Test ratings and watchlists as a user and administration screens as admin.

Keep all real secrets in Supabase, Render, and Vercel settings. Never commit
`.env` files or paste production credentials into this guide.
