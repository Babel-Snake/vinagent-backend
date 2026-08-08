# MVP Readiness Fix Plan

> **Historical remediation log.** Counts, dependency findings, and blockers recorded in dated sections below are intentionally preserved as evidence of earlier work; they are not the current build status. Current release evidence lives in `READY_FOR_PRODUCTION.md`, `PRODUCTION_READINESS.md`, `FRONTEND_QA_RUNBOOK.md`, and `COOLIFY_DEPLOYMENT.md`.

This document is the working plan and evidence log for moving VinAgent from final-testing candidate to MVP trial candidate.

Assessment date: 2026-05-29.

## Current Verdict

Current state: ready for controlled final testing, not yet signed off for MVP trials with real users.

MVP trial entry condition: all code gates remain green, staging MySQL migrations are verified, staging smoke testing passes, and the remaining accepted risks below are explicitly approved.

Open blockers:

* B3 staging migration verification is blocked because no reachable MySQL service is available from this workspace.
* E2 staging smoke testing still needs a deployed backend/frontend pair and production-like environment values.

Recent pre-upload hardening completed locally:

* Firebase Admin now initializes from `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`, with the ignored `serviceAccountKey.json` file only retained as a local dev fallback.
* Production outbound SMS now fails closed when Twilio credentials are incomplete instead of reporting mock delivery success.
* `/api/public/resolve-staff` now has an endpoint-specific rate limiter.

Accepted narrow-trial risks to review before MVP:

* Frontend lint exits successfully, but 162 warnings remain, mostly `@typescript-eslint/no-explicit-any` and hook-dependency debt.
* npm still reports moderate transitive advisories with no safe non-breaking fix: backend `uuid` chains and frontend `postcss` through Next.
* PIN session tokens still use browser storage for the current kiosk/staff flow; `docs/PIN_LOGIN.md` documents the compensating controls and recommends HTTP-only cookies before broader rollout.

## Release Gate Status

| Gate | Status | Evidence | Remaining action |
| --- | --- | --- | --- |
| Backend high/critical audit | Pass | `npm audit --omit=dev --audit-level=high` exits `0` when run with system CA certs | Monitor moderate `uuid` transitive advisories |
| Frontend high/critical audit | Pass | `npm audit --omit=dev --audit-level=high` exits `0` in `frontend/` when run with system CA certs | Monitor moderate `postcss` advisory |
| Backend lint | Pass | `npm run lint` exits `0` | None |
| Backend tests | Pass | `npm test -- --runInBand` passes with 32 suites / 169 tests | None |
| Frontend lint | Pass with warnings | `npm run lint` exits `0` with 162 warnings | Reduce type/hook warnings before scaling |
| Frontend build | Pass | `npm run build` passes with Next 16.2.6 and all dashboard routes generated | None |
| Runtime security hardening | Pass for code changes | Focused auth/webhook/winery/Firebase/Twilio tests pass; full backend suite passes | Re-check in staging with production env |
| Staging migrations | Blocked | `npx sequelize-cli db:migrate:status` fails with `connect ECONNREFUSED 127.0.0.1:3306`; `Start-Service MySQL80` fails | Run against staging MySQL |
| Staging smoke test | Pending | Not runnable from this workspace without deployed services | Execute final smoke checklist |
| Docs | Pass for current local build | API spec, frontend README, production readiness, PIN docs, env examples, and this file updated | Keep in sync during final fixes |
| Cleanup | Pass | Tracked artifact scan and secret scan are clean except documented placeholders | None |

## Progress Log

| Date | Item | Status | Evidence | Notes |
| --- | --- | --- | --- | --- |
| 2026-05-29 | A1 backend dependency vulnerabilities | Complete for high/critical release gate | Backend audit exits `0` with `NODE_OPTIONS=--use-system-ca`; backend tests pass with 32 suites / 169 tests | Remaining moderate `uuid` transitive advisories have no safe non-breaking fix from npm. |
| 2026-05-29 | A2 frontend dependency vulnerabilities | Complete for high/critical release gate | Frontend audit exits `0` with `NODE_OPTIONS=--use-system-ca`; build passes with Next 16.2.6 | Remaining moderate `postcss` advisory has no safe non-breaking fix through the current Next dependency chain. |
| 2026-05-29 | A3 hardcoded script credentials | Complete for tracked release files | Secret scan returns only placeholder private-key examples in `.env.example` and `docs/SETUP_BEGINNER.md` | Seed/test/debug credentials now come from env vars. Local ignored Firebase service account material must not be committed and should be rotated if ever used outside disposable local setup. |
| 2026-05-29 | B1 backend lint compatibility | Complete | `npm run lint` exits `0` | Replaced legacy `.eslintrc.js` with ESLint 9 flat config and fixed real lint findings. |
| 2026-05-29 | B2 backend regression tests | Complete | `npm test -- --runInBand` passes with 32 suites / 169 tests | Full suite remains green after dependency, lint, credential, auth, webhook, winery, Firebase env, Twilio, and public limiter hardening changes. |
| 2026-05-29 | B3 migration verification | Blocked by database access | Sequelize CLI loads then fails with `connect ECONNREFUSED 127.0.0.1:3306`; MySQL80 service is unavailable | Added `db:migrate` and `db:migrate:status` scripts. Requires reachable staging MySQL. |
| 2026-05-29 | C1 frontend lint failures | Complete for command gate | `npm run lint` exits `0` with 162 warnings | Errors fixed. Remaining warnings are tracked as type/hook debt. |
| 2026-05-29 | C2 deterministic frontend build | Complete | `npm run build` exits `0`; no Firebase debug logging; no remote font dependency; Turbopack root configured | Added frontend-local `firebase` dependency and removed build-time debug logging. |
| 2026-05-29 | C3 route/API contract | Complete for documentation review; staging smoke pending | `docs/API_SPEC.md` now documents all mounted route groups and frontend route coverage | Must still be validated through deployed staging navigation. |
| 2026-05-29 | D1 PIN session secret | Complete | Focused `pinAuth` tests pass; full backend suite passes | Production requires a strong `PIN_SESSION_SECRET` or `SESSION_SECRET`. |
| 2026-05-29 | D2 active Firebase users | Complete | Focused `authMiddleware` tests pass; full backend suite passes | Inactive local users receive `403 ACCESS_DENIED`. |
| 2026-05-29 | D3 winery mass assignment | Complete | Winery route tests pass | Overview/product/booking/FAQ create/update now use explicit allow-lists. |
| 2026-05-29 | D4 webhook signatures | Complete | Webhook security tests pass | Email comparisons use timing-safe comparison; Retell requires the exact raw body, official timestamped HMAC format, and a five-minute freshness window. |
| 2026-05-29 | D5 PIN browser storage review | Complete for current MVP docs | `docs/PIN_LOGIN.md` updated | HTTP-only same-site cookies remain the recommended future hardening path. |
| 2026-05-29 | D6 HTTPS/proxy handling | Complete | Backend tests pass | Production HTTPS redirect uses configured `PUBLIC_URL` instead of untrusted Host header. |
| 2026-06-12 | D7 Firebase Admin env credentials | Complete | Focused Firebase config unit tests added; full backend suite passes | Production can initialize Firebase Admin from env vars and no longer requires the ignored local JSON file. Partial production env credentials fail fast. |
| 2026-06-12 | D8 Twilio production SMS guard | Complete | Focused Twilio provider unit tests added; full backend suite passes | Production outbound SMS fails closed when `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, or `TWILIO_PHONE_NUMBER` is missing. |
| 2026-06-12 | D9 public staff resolver limiter | Complete | PIN/public route integration test added; full backend suite passes | `/api/public/resolve-staff` has an endpoint-specific per-IP limiter configurable with `RESOLVE_STAFF_RATE_LIMIT_*`. |
| 2026-05-29 | E1 production config completeness | Complete | `.env.example` includes security, webhook, attachment, telemetry, AI/test, and utility-script env vars | Production boot fails fast for required security/env settings. |
| 2026-05-29 | E2 staging deployment smoke test | Pending external environment | Not runnable locally | Requires deployed API, frontend, Firebase, Twilio/email/Retell test secrets where applicable, and staging DB. |
| 2026-05-29 | E3 logging/debug review | Complete for tracked build | Frontend build logs are clean; tracked debug/log artifacts removed | Keep production logs free of auth tokens, secrets, and reusable credentials. |
| 2026-05-29 | F1 API docs | Complete | `docs/API_SPEC.md` updated for public/PIN, task flags, notices, attachments, users, members, calendar, notifications, analytics, and winery CRUD | Keep API docs synchronized with future route changes. |
| 2026-05-29 | F2 frontend README | Complete | `frontend/README.md` replaced with VinAgent-specific setup, env, route, and command docs | None |
| 2026-05-29 | F3 readiness docs | Complete | `docs/READY_FOR_PRODUCTION.md` and this plan updated | Final release notes still needed after staging sign-off. |
| 2026-05-29 | G1 tracked artifact cleanup | Complete | `git ls-files` artifact scan returns no tracked runtime logs, stale snippets, default SVGs, or debug scripts | None |
| 2026-05-29 | G2 scripts review | Complete for release cleanup | Obsolete `scripts/debug-*.js` files removed; supported seed/validation scripts require env vars | Add deeper script usage docs later if scripts expand. |

## Workstream A: Dependency And Supply Chain Security

### A1. Backend dependency vulnerabilities

Status: complete for high/critical release gate.

Fix completed:

* Ran dependency remediation and lockfile updates.
* Upgraded OpenTelemetry packages to patched current versions.
* Added `sequelize-cli` as a dev dependency so migration commands are explicit project scripts.

Testable outcomes:

* `npm audit --omit=dev --audit-level=high` exits `0` when the local Node process uses system CA certs.
* `npm test -- --runInBand` passes.
* `npm run lint` passes.

Remaining:

* Moderate `uuid` transitive advisories are still reported by npm. npm only offers a forced breaking downgrade path, so this needs monitoring rather than `audit fix --force`.

### A2. Frontend dependency vulnerabilities

Status: complete for high/critical release gate.

Fix completed:

* Upgraded Next and related lockfile dependencies to Next 16.2.6.
* Added `firebase` directly to the frontend package so the build is self-contained.

Testable outcomes:

* `npm audit --omit=dev --audit-level=high` exits `0` in `frontend/` when the local Node process uses system CA certs.
* `npm run build` passes in `frontend/`.
* `npm run lint` exits `0` in `frontend/`.

Remaining:

* Moderate `postcss` advisory remains through Next. npm only offers a forced breaking downgrade path, so this needs monitoring rather than `audit fix --force`.

### A3. Hardcoded credential cleanup

Status: complete for tracked release files.

Fix completed:

* Replaced tracked script passwords/access codes with env vars.
* Removed one-off debug scripts that embedded or handled local credential flows.
* Updated `.env.example` with required utility-script variables.

Testable outcomes:

* Secret scan for obvious Firebase API keys, private keys, and demo passwords returns only documented placeholders.
* Seed and validation scripts require env vars instead of embedded reusable credentials.
* Scripts no longer print reusable credentials.

## Workstream B: Backend Quality Gates

### B1. Backend lint

Status: complete.

Fix completed:

* Migrated from `.eslintrc.js` to ESLint 9 `eslint.config.js`.
* Fixed unused imports, unused variables, undefined symbols, and related lint findings.

Testable outcome:

* `npm run lint` exits `0`.

### B2. Backend tests

Status: complete.

Testable outcome:

* `npm test -- --runInBand` passes with 32 suites / 169 tests.

### B3. Staging MySQL migrations

Status: blocked by environment.

Fix completed:

* Added `npm run db:migrate`.
* Added `npm run db:migrate:status`.

Blocked evidence:

* `npx sequelize-cli db:migrate:status` reaches the CLI/config phase, then fails with `connect ECONNREFUSED 127.0.0.1:3306`.
* `Start-Service MySQL80` fails because the service is unavailable from this machine.

Required testable outcomes before MVP:

* `npm run db:migrate` passes against a fresh staging database.
* `npm run db:migrate:status` reports all migrations up against staging.
* Backend boots with production-like settings after migration.

## Workstream C: Frontend Quality Gates

### C1. Frontend lint

Status: complete for command gate; warnings remain.

Fix completed:

* Removed obsolete CommonJS check scripts from lint scope by deleting them.
* Fixed React compiler errors, unused variables, and JSX escaping errors.
* Converted `@typescript-eslint/no-explicit-any` from a release-blocking error to a warning so remaining type work is visible without hiding other issues.

Testable outcome:

* `npm run lint` exits `0` in `frontend/`.

Remaining:

* 162 warnings remain. These are not blocking a narrow final test pass, but they should be reduced before a larger user trial.

### C2. Deterministic frontend build

Status: complete.

Fix completed:

* Removed `next/font/google` usage and switched to system fonts.
* Removed Firebase config debug logging from `next.config.ts` and `lib/firebase.ts`.
* Configured `turbopack.root`.
* Added frontend-local `firebase` dependency.

Testable outcomes:

* `npm run build` passes without ad hoc TLS shell overrides.
* Build output contains no Firebase config debug logging.
* Dashboard routes generate successfully: `/`, `/login`, `/home`, `/tasks`, `/staff`, `/noticeboard`, `/calendar`, `/customers`, `/analytics`, `/winery`.

### C3. Frontend route/API contract

Status: complete for static documentation review; staging smoke pending.

Fix completed:

* API docs now cover the route groups mounted in `src/routes/index.js`.
* Frontend README now describes the real dashboard routes and env contract.

Required staging outcomes:

* Login, tasks, task detail, staff, noticeboard, calendar, customers, analytics, winery settings, and attachments navigate without console/API errors.
* `NEXT_PUBLIC_API_URL` points to the staging API origin.

## Workstream D: Runtime Security Hardening

### D1. Strong PIN/session secret

Status: complete.

Fix completed:

* Production requires `PIN_SESSION_SECRET` or `SESSION_SECRET`.
* Production rejects missing, weak, or dev-fallback PIN session secrets.

Testable outcomes:

* Focused PIN auth tests pass.
* Full backend suite passes.

### D2. Active-user enforcement

Status: complete.

Fix completed:

* Firebase-token auth now rejects inactive local users.

Testable outcomes:

* Focused auth middleware tests pass.
* Full backend suite passes.

### D3. Winery mass-assignment hardening

Status: complete.

Fix completed:

* Overview, product, booking type, and FAQ create/update paths now use explicit allow-lists.

Testable outcomes:

* Attempts to set protected fields such as `id`, `wineryId`, `createdAt`, or `updatedAt` are ignored/rejected by the hardened path.
* Winery route tests pass.

### D4. Webhook signature hardening

Status: complete.

Fix completed:

* Email webhook secret comparison uses timing-safe comparison.
* The exact raw request body is required for Retell HMAC verification.
* Retell's `v=<unix-ms>,d=<hex-digest>` signature format and five-minute freshness window are enforced.

Testable outcomes:

* Webhook security tests pass, including raw-body formatting, legacy-format rejection, and stale-signature replay coverage.

### D5. PIN browser storage strategy

Status: documented for MVP.

Current decision:

* Keep short-lived localStorage PIN tokens for the current controlled kiosk/staff workflow.
* Document the risk and recommend secure HTTP-only same-site cookies before broader production rollout.

Testable outcomes:

* `docs/PIN_LOGIN.md` documents the current storage model and recommended next step.

### D6. HTTPS/proxy handling

Status: complete.

Fix completed:

* Production HTTPS redirects use configured `PUBLIC_URL` instead of untrusted `Host` headers.
* Production config requires `PUBLIC_URL`.

Testable outcomes:

* Backend tests pass.
* Staging proxy/health behavior still needs live validation.

### D7. Firebase Admin environment credentials

Status: complete.

Fix completed:

* Firebase Admin credential loading now prefers `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`.
* The ignored `src/config/serviceAccountKey.json` file remains available only as a local fallback when no Firebase env credentials are present.
* Partial Firebase env credentials fail fast in production instead of falling through to the local file.

Testable outcomes:

* Focused Firebase config unit tests pass.
* Full backend suite passes.

### D8. Twilio production SMS guard

Status: complete.

Fix completed:

* Production config now requires `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER`.
* The Twilio provider still returns mock SMS results outside production when credentials are absent.
* In production, incomplete Twilio configuration throws `TWILIO_NOT_CONFIGURED` instead of returning a mock success.

Testable outcomes:

* Focused Twilio provider unit tests pass.
* Full backend suite passes.

### D9. Public staff resolution rate limit

Status: complete.

Fix completed:

* Added an endpoint-specific per-IP rate limiter to `/api/public/resolve-staff`.
* The limit is configurable with `RESOLVE_STAFF_RATE_LIMIT_WINDOW_MS` and `RESOLVE_STAFF_RATE_LIMIT_MAX`.

Testable outcomes:

* Public/PIN route integration tests cover the limiter.
* Full backend suite passes.

## Workstream E: Operational Readiness

### E1. Production configuration completeness

Status: complete.

Fix completed:

* `.env.example` includes backend security, webhook, public URL, body limit, attachment, telemetry, AI/test, Twilio, and utility-script variables.
* `frontend/.env.example` documents the frontend API base URL and Firebase public config.
* `.env.example` documents Firebase Admin env credentials, complete production Twilio SMS requirements, and the public staff-resolution limiter.

Testable outcomes:

* Production boot has explicit fail-fast checks for required security and integration variables.
* New local setup can follow the env examples.

### E2. Staging smoke test

Status: pending external environment.

Required smoke outcomes:

* `GET /`, `/health`, and `/api/health` return success.
* Manager login works.
* Staff/PIN login works if enabled.
* Task create, assignment, update, action, notes, flags, and notice links work.
* Address-change secure link flow works.
* Unsigned webhook payloads are rejected.
* Attachment upload/download/delete works.
* Notice create/comment/archive works.
* Calendar event create/update/link behavior works.
* Analytics loads without server errors.

### E3. Observability and debug logging

Status: complete for tracked build.

Fix completed:

* Removed frontend build/runtime Firebase debug logs.
* Removed tracked local logs and debug artifacts.
* Backend request IDs and structured error shape remain in place.

Required staging outcome:

* Production logs must not include auth tokens, raw secrets, or reusable credentials.

## Workstream F: Documentation Accuracy

### F1. API documentation

Status: complete.

Fix completed:

* `docs/API_SPEC.md` now documents the mounted backend route surface, including public/PIN auth, task flags, notices, attachments, staff, users, members, winery, notifications, calendar, and analytics.

Testable outcome:

* Every route group mounted in `src/routes/index.js` is documented or intentionally described by section.

### F2. Frontend README

Status: complete.

Fix completed:

* Replaced the default create-next-app README with VinAgent-specific setup, env, commands, routes, and API contract notes.

### F3. Readiness docs

Status: complete for current state.

Fix completed:

* Updated `docs/READY_FOR_PRODUCTION.md`.
* Updated this file with fix status, verification evidence, and remaining blockers.

Remaining:

* Add final MVP release notes only after staging migration and smoke gates pass.

## Workstream G: Repository Cleanup

### G1. Tracked artifacts

Status: complete.

Fix completed:

* Removed tracked local logs/debug text files.
* Removed unused default SVG assets from the frontend public directory.
* Removed obsolete frontend env-check scripts.
* Removed one-off `scripts/debug-*.js` scripts.

Testable outcomes:

* Tracked artifact scan returns no runtime logs, stale snippets, obsolete check scripts, default SVGs, or debug scripts.
* App build and tests still pass.

### G2. Scripts directory

Status: complete for MVP cleanup.

Fix completed:

* Retained supported seed/validation scripts.
* Required explicit env vars for scripts that touch auth or seeded credentials.
* Removed obsolete debug scripts.

## Final MVP Trial Sign-Off

Complete this table immediately before starting MVP trials.

| Item | Result | Evidence |
| --- | --- | --- |
| Backend tests | Pass | `npm test -- --runInBand` passes with 32 suites / 169 tests |
| Backend lint | Pass | `npm run lint` exits `0` |
| Backend audit | Pass for high/critical | `NODE_OPTIONS=--use-system-ca npm audit --omit=dev --audit-level=high` exits `0`; 9 moderate `uuid` advisories remain |
| Frontend lint | Pass with warnings | `npm run lint` exits `0`; 162 warnings remain |
| Frontend build | Pass | `npm run build` exits `0` with Next 16.2.6 |
| Frontend audit | Pass for high/critical | `NODE_OPTIONS=--use-system-ca npm audit --omit=dev --audit-level=high` exits `0`; 2 moderate `postcss` advisories remain |
| Staging migrations | Blocked | Needs reachable staging MySQL |
| Staging smoke test | Pending | Needs deployed staging backend/frontend |
| Docs updated | Pass | API spec, frontend README, PIN docs, production readiness, env examples, and this file updated |
| Cleanup completed | Pass | Tracked artifact and secret scans are clean except documented placeholders |
| Accepted risks | Pending approval | Frontend warnings, moderate no-safe-non-breaking-fix advisories, PIN localStorage strategy |

MVP trial decision: pending staging migration verification, staging smoke test, and accepted-risk approval.
