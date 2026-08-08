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
npm run lint:ci
npm run test:smoke
npm run build
npm run test:browser-smoke
npm run start
```

`npm run build` is the production build gate. Run `test:browser-smoke` after the build; it uses `playwright-core` with a locally installed Edge/Chrome executable. Set `PLAYWRIGHT_EXECUTABLE_PATH` when the browser is not installed in a standard location. The app uses system fonts so the build does not depend on fetching remote font assets.

## Route Overview

Implemented dashboard routes:

* `/`
* `/login`
* `/home`
* `/tasks`
* `/projects`
* `/requests`
* `/notes`
* `/operations`
* `/integration-events`
* `/staff`
* `/noticeboard`
* `/calendar`
* `/customers`
* `/analytics`
* `/usage`
* `/winery`

Public member route:

* `/confirm-address` — validates a single-use member action token, lets the
  member review/correct their proposed address, and confirms it without staff
  authentication

## API Contract

Authenticated frontend API calls are centralized in `lib/api.ts` and target the backend `/api` route groups documented in `../docs/API_SPEC.md`. The public address flow uses `lib/publicAddressFlow.mjs` and deliberately sends no Firebase or PIN credentials.

Authentication uses Firebase ID tokens for dashboard users. Staff PIN login stores a short-lived PIN session token in browser storage; see `../docs/PIN_LOGIN.md` for the current threat model and migration recommendation.
