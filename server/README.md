# CF-Daily server

Authenticated Express API for Firebase Authentication, Firestore activity storage, streak calculations, and the current-streak leaderboard.

## Firestore model

```text
users/{uid}
  displayName, email, photoURL
  currentStreak, longestStreak, totalActiveDays, totalCompletions

users/{uid}/activity/{YYYY-MM-DD}
  ratings.{rating}.problemKey
  ratings.{rating}.completedAt
```

One active UTC day contributes one day to a streak, regardless of how many rating-specific POTDs the user completes on that day. The leaderboard sorts by current streak, longest streak, total completions, then display name.

## Run locally

```bash
cp .env.example .env
npm install
npm test
npm start
```

The Firebase Admin SDK uses the three service-account variables in `.env` when present, otherwise Application Default Credentials. Never commit `.env` or a service-account JSON key.

The extension must provide a Firebase ID token in `Authorization: Bearer <token>`. Firestore access from clients is disabled; all reads and writes go through this server.
