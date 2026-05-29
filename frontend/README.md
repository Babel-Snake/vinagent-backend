# VinAgent Frontend

This is the VinAgent dashboard frontend. It is a Next.js App Router application for winery managers, admins, and staff to operate tasks, notices, calendar events, customer records, analytics, and winery configuration.

## Local Setup

Install dependencies from this directory:

```bash
npm install
```

Create `frontend/.env.local` from `frontend/.env.example` and provide:

```bash
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

Run the dashboard:

```bash
npm run dev
```

The default local URL is `http://localhost:3000`. `NEXT_PUBLIC_API_URL` must point at the backend origin without the `/api` suffix.

## Commands

```bash
npm run dev
npm run lint
npm run build
npm run start
```

`npm run build` is the production build gate. The app uses system fonts so the build does not depend on fetching remote font assets.

## Route Overview

Implemented dashboard routes:

* `/`
* `/login`
* `/home`
* `/tasks`
* `/staff`
* `/noticeboard`
* `/calendar`
* `/customers`
* `/analytics`
* `/winery`

## API Contract

Frontend API calls are centralized in `lib/api.ts` and target the backend `/api` route groups documented in `../docs/API_SPEC.md`.

Authentication uses Firebase ID tokens for dashboard users. Staff PIN login stores a short-lived PIN session token in browser storage; see `../docs/PIN_LOGIN.md` for the current threat model and migration recommendation.
