# READY_FOR_PRODUCTION.md

This file is the production-readiness snapshot for the current build. The detailed MVP remediation checklist and evidence log live in `MVP_READINESS_FIX_PLAN.md`.

## Current Position

The backend has a coherent core workflow:

* inbound webhooks create tasks
* staff can review and action tasks
* secure member confirmation flows work for address updates
* task history is tracked through `TaskAction`
* operational analytics now reflect workflow, response, identity, and follow-up signals

The current contract is based on:

* task statuses: `PENDING`, `ACTIONED`, `REJECTED`
* detailed workflow state: `TaskStep`, `TaskAction`, linked `Message` rows, outcome fields, and `MemberActionToken`

## Current Verdict

The build is suitable for controlled final testing, but it is not yet signed off for MVP trials with real users.

Open release blockers:

* staging MySQL migration verification is blocked until a reachable staging database is available
* staging smoke testing still needs to exercise the deployed backend and frontend together
* frontend lint passes, but type-hardening warnings remain and should be reduced before scaling beyond a narrow trial

## What "Production Ready" Means for This Build

Before treating this build as production-ready, verify:

* docs, tests, and implementation all agree on the simplified task lifecycle
* webhook signature validation is enforced in production
* Firebase auth bypass is disabled outside test/dev
* Firebase Admin initializes from production environment variables, not a local service-account file
* production boot fails without required security secrets
* outbound SMS cannot silently use mock mode in production
* no debug-file writes remain on hot request paths
* analytics and dashboard routes do not rely on retired statuses
* operational analytics use the current task workflow fields and not stale status assumptions
* frontend API calls match the backend route surface

## Operational Checklist

### Security

* secrets live in environment variables
* `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` are set for Firebase Admin
* webhook secrets are configured
* `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER` are set before enabling outbound SMS
* `ALLOW_TEST_AUTH_BYPASS` is off in production
* `PIN_SESSION_SECRET` or `SESSION_SECRET` is strong and set in production
* `PUBLIC_URL` is set to the deployed public backend origin
* HTTPS / proxy handling is configured correctly
* public staff username resolution is protected by the endpoint-specific rate limiter

### Testing

* full backend test suite passes
* golden path address-change flow passes
* webhook security tests pass
* frontend lint and production build pass
* staging migrations and migration status pass
* staging smoke checklist passes

### Product Coherence

* dashboard status filters use `PENDING`, `ACTIONED`, `REJECTED`
* audit views explain secure-link flows correctly
* public address-update flow is reachable and branded correctly

### Observability

* request logging is active
* error responses include request IDs
* automation failures are visible in logs/analytics

## Authoritative References

Use these docs as the current production contract:

* `ARCHITECTURE.md`
* `DOMAIN_MODEL.md`
* `API_SPEC.md`
* `GOLDEN_PATH.md`
* `TEST_PLAN.md`
* `MVP_READINESS_FIX_PLAN.md`

Older production-readiness assumptions based on `APPROVED`, `EXECUTED`, or `AWAITING_MEMBER_ACTION` should be treated as historical, not current.
