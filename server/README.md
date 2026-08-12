# CF-Daily server

Authenticated Express API for Supabase Auth, Postgres activity storage, streak calculations, and the current-streak leaderboard.

## Postgres model

```text
profiles
  id, display_name, photo_url
  current_streak, longest_streak, total_active_days, total_completions

activity
  user_id, day, rating, problem_key, completed_at
```

One active UTC day contributes one day to a streak, regardless of how many rating-specific POTDs the user completes on that day. The leaderboard sorts by current streak, longest streak, total completions, then display name.

## Run locally

```bash
cp .env.example .env
npm install
npm test
npm start
```

Run `../supabase/migrations/001_initial.sql` in the Supabase SQL editor before starting the API. The secret key belongs only in the server environment; never commit it or expose it to the extension. The publishable key is safe to copy into `src/config.js`.

The extension provides a Supabase access token in `Authorization: Bearer <token>`. Row-level security prevents direct cross-user reads, while all writes and leaderboard reads go through this server.

## Deploy on Vercel

Set the Vercel project Root Directory to `server`, then add `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in Project Settings → Environment Variables. `src/app.js` exports the Express app as Vercel's default serverless handler, while `src/index.js` remains the local development entrypoint.
