# READY_FOR_PRODUCTION.md

This file is the production-readiness snapshot for the current build. The detailed MVP remediation checklist and evidence log live in `MVP_READINESS_FIX_PLAN.md`.

## Current Position

The backend has a coherent core workflow:

* inbound webhooks create tasks
* staff can review and action tasks
* the secure member confirmation API and single-use token flow work for address updates
* the public `/confirm-address` page lets members securely review, correct, and confirm those updates without staff authentication
* task history is tracked through `TaskAction`
* operational analytics now reflect workflow, response, identity, and follow-up signals
* provider-independent usage metering records seats, engagement, API volume, operational activity, AI tokens, attachments, and automation without enabling payment or plan enforcement

The current contract is based on:

* task statuses: `PENDING`, `ACTIONED`, `REJECTED`
* detailed workflow state: `TaskStep`, `TaskAction`, linked `Message` rows, outcome fields, and `MemberActionToken`

## Current Verdict

The repository is ready for a controlled Coolify staging deployment. It is not yet signed off for an unattended production launch or real-user pilot until the environment-specific acceptance gates below pass.

Remaining staging gates (not unresolved repository implementation defects):

* build both Docker images on the Coolify host, then run migration, bootstrap/import, and `preflight:deployment` using the final secrets and domains
* verify backup/restore and attachment-volume ownership, durability, and redeploy survival
* complete the populated authenticated browser matrix with real Firebase manager/admin, area-manager, staff, and PIN sessions
* perform controlled real SMS/email/webhook delivery using approved test recipients and verify logs/audit trails
* keep booking, Wine Club, and Orders modules disabled because live booking and CRM adapters are not implemented
* capture initial usage gauges and verify the admin reconciliation report before treating pilot measurements as a commercial baseline

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
* `PUBLIC_APP_URL` is set to the deployed public frontend origin
* `DEPLOYMENT_WINERY_ID` is set by the operator and matches the sole winery served by this deployment
* HTTPS / proxy handling is configured correctly
* public staff username resolution is protected by the endpoint-specific rate limiter

### Testing

* full backend test suite passes
* golden path address-change flow passes
* webhook security tests pass
* public address-flow helper smoke tests pass
* real local headless-browser smoke passes for confirmation, fixed-winery login, manager/staff navigation, and mobile shells
* frontend lint and production build pass
* staging migrations and migration status pass
* staging smoke checklist passes

### Product Coherence

* dashboard status filters use `PENDING`, `ACTIONED`, `REJECTED`
* audit views explain secure-link flows correctly
* public address-update flow is reachable, mobile-friendly, non-indexed, and does not require staff authentication

### Observability

* request logging is active
* error responses include request IDs
* automation failures are visible in logs/analytics
* aggregate winery usage is visible to managers/admins at `/usage`; reconciliation compares task/message source records with the usage ledger

## Authoritative References

Use these docs as the current production contract:

* `ARCHITECTURE.md`
* `DOMAIN_MODEL.md`
* `API_SPEC.md`
* `GOLDEN_PATH.md`
* `TEST_PLAN.md`
* `PRODUCTION_READINESS.md`
* `FRONTEND_QA_RUNBOOK.md`
* `COOLIFY_DEPLOYMENT.md`
* `USAGE_METERING.md`

`MVP_READINESS_FIX_PLAN.md` and `AUDIT_REPORT.md` are historical evidence logs. Older production-readiness assumptions based on `APPROVED`, `EXECUTED`, or `AWAITING_MEMBER_ACTION` should be treated as historical, not current.
