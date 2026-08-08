# Production readiness

## Automated release gates

Run these from a clean checkout with the deployment dependency lockfiles:

```text
npm ci
npm test -- --runInBand
npm run lint
npm audit --omit=dev

cd frontend
npm ci
npm run lint:ci
npm run build
npm audit --omit=dev
```

As of 8 August 2026:

- backend: 75 suites and 426 tests pass; lint passes; the production dependency audit reports zero vulnerabilities
- frontend: lint passes with zero errors and zero warnings; six public-flow helper tests and the real headless-browser smoke pass; the 20-page production build, including the aggregate Usage dashboard, passes; the production dependency audit reports zero vulnerabilities
- MySQL: the complete migration chain is current; the usage-metering migration was applied successfully against local MySQL, while migration up/down and existing-winery billing-profile backfill are also covered by a real SQLite migration test
- Sidewood: database permissions, area scoping, Firebase identity existence/enabled state, secret serialization, and unsupported integration fallback pass

To repeat the Sidewood checks:

```text
npm run smoke:sidewood
npm run smoke:sidewood:firebase
```

The Firebase variant performs read-only Admin API lookups. On managed Windows networks, Node may also need `NODE_OPTIONS=--use-system-ca` so the corporate/system trust store is used.

## Deployment secrets and external services

The repository contains no tracked `.env`, frontend local environment, or Firebase service-account file. Supply secrets through the deployment platform; never copy the ignored development service-account JSON into an image.

Before deployment, verify:

- `FIREBASE_PRIVATE_KEY` is the full PEM value with newlines preserved, and the backend and frontend Firebase project IDs match
- `PIN_SESSION_SECRET` or `SESSION_SECRET` is high entropy and at least 32 characters
- `DEPLOYMENT_WINERY_ID` identifies the one winery this deployment serves; changing it is an operator-only action
- the deployment winery has a non-charging `WineryBillingProfile`; bootstrap creates it and deployment preflight verifies it
- `PUBLIC_URL` uses the final HTTPS backend domain, while `PUBLIC_APP_URL` and allowed frontend origins use the final HTTPS frontend domain
- database credentials point at the intended production database
- Twilio credentials/number, the email webhook secret, and the Retell webhook-authentication API key are present
- the selected outbound email provider has its required SendGrid or Outlook credentials and sender/mailbox configuration
- `ALLOW_TEST_AUTH_BYPASS` is absent or `false`, and database-only Sidewood seeding is not enabled

Twilio and SendGrid fail closed in production when credentials are missing. Mock booking/CRM execution is limited to explicit local development and tests; unsupported live providers fail without marking the task as actioned. POS and delivery adapters remain configuration-only, and the frontend labels unavailable live actions.

Member action links store only a SHA-256 digest of the bearer token. Deploy the `20260807002000-hash-member-action-tokens-at-rest` migration and the matching application build together. Rolling that migration back cannot reconstruct the original bearer values, so previously issued links must be treated as invalid after a rollback.

## Human staging gates

These checks intentionally require the real staging/deployment environment and should not be simulated against customer channels:

1. Sign in as Owen, Serena, and representative area staff.
2. Confirm Owen has winery-wide management, Serena manages Cellar Door but not Restaurant, and ordinary staff cannot manage either area.
3. Send one approved SMS and one approved email to controlled test recipients, then verify provider delivery and the outbound audit trail.
4. Submit correctly and incorrectly signed Twilio, email, Retell, and generic integration webhooks; also confirm stale Retell signatures and unmapped/ambiguous Retell agents fail closed.
5. Upload/download/delete an attachment using the production storage mount and size limits.
6. Exercise backup restoration and the application rollback procedure.
7. Complete the authenticated browser matrix in `FRONTEND_QA_RUNBOOK.md`, including manager, area-manager, staff/PIN, and public member-confirmation paths.
8. Capture the initial usage gauges and run admin reconciliation as described in `USAGE_METERING.md`; review discrepancies before relying on a pilot report.

Do not call the release fully deployed until these environment-specific gates and the production database migration have passed.

## Maintainability work

Seventeen behaviour-preserving decomposition passes are complete. Shared TaskCard support utilities and customer/files/outcome views, dedicated overview/navigation and workflow coordination/step/suggestion components, conversation/activity timelines, note composition and recommended-action editing, isolated activity diagnostics, workflow/communication/outcome/assignment and notice/customer-identity controllers, task intake, preview, response and workflow components, analytics charts/types/dashboard orchestration plus operational-intelligence control and review panels, authenticated API infrastructure, domain API clients and type modules, and backend task creation, update/outcome orchestration, member outcome enrichment, note privacy, assignment, follow-up automation, workflow persistence, task-step mutation and suggestion commands, task list/detail reads, follow-up planning, workflow policy and query-policy logic now live in focused modules. Frontend lint has no remaining `any` warnings.

Current hotspot sizes after the latest pass (physical lines, including blanks):

- `frontend/lib/api.ts`: 100 lines, down from 3,027 after the initial cleanup baseline; it is now only a compatibility barrel
- `frontend/app/(dashboard)/analytics/page.tsx`: 438 lines, down from 1,225; presentation metadata, dashboard state, intelligence controls and signal review now live in focused files of 267 lines or fewer
- `frontend/components/CreateTaskModal.tsx`: 631 lines, down from 1,320; input, preview basics, response drafting, classification metadata and workflow editing now live in focused files of 241 lines or fewer
- `frontend/components/TaskCard.tsx`: 757 lines, down from 3,118; overview, navigation, workflow, communication, diagnostics and domain controllers now live in focused files of 392 lines or fewer
- `src/services/taskService.js`: 29 lines, down from 2,992; it is now a compatibility facade over focused creation, update/outcome, note, assignment, follow-up, workflow, step-command, suggestion, and read services of 407 lines or fewer

The original oversized-file risk centres are now decomposed into bounded orchestrators and focused modules. Further extraction is optional polish rather than a release blocker; favour small, behaviour-preserving changes backed by lint, build, and relevant tests.
