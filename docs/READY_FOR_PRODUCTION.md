# READY_FOR_PRODUCTION.md

This file is now a short production-readiness snapshot for the current build.

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

## What "Production Ready" Means for This Build

Before treating this build as production-ready, verify:

* docs, tests, and implementation all agree on the simplified task lifecycle
* webhook signature validation is enforced in production
* Firebase auth bypass is disabled outside test/dev
* no debug-file writes remain on hot request paths
* analytics and dashboard routes do not rely on retired statuses
* operational analytics use the current task workflow fields and not stale status assumptions
* frontend API calls match the backend route surface

## Operational Checklist

### Security

* secrets live in environment variables
* webhook secrets are configured
* `ALLOW_TEST_AUTH_BYPASS` is off in production
* HTTPS / proxy handling is configured correctly

### Testing

* full backend test suite passes
* golden path address-change flow passes
* webhook security tests pass

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

Older production-readiness assumptions based on `APPROVED`, `EXECUTED`, or `AWAITING_MEMBER_ACTION` should be treated as historical, not current.
