# VinAgent

VinAgent is an AI-assisted operations platform for winery teams. The current build centers on one core loop:

`inbound message -> triage -> task -> human action -> optional automation / secure member follow-up -> audit trail -> managed follow-up case when needed`

The product has four day-to-day operational objects: Tasks, Notices, Requests, and Notes (`OperationalRecord`). Projects now sit above those objects and Calendar Events as an optional coordination layer for outcomes that span several people, areas, decisions, or dates. The existing Task workflow remains the primary automation engine.

The repository now contains both:

* an Express backend in `src/`
* a Next.js dashboard in `frontend/`

The backend is the main source of truth for workflow behaviour.

## Current Product Shape

VinAgent ingests SMS, email, and voice events, turns them into structured tasks, drafts suggested replies/actions, and lets winery staff manage the work through a shared task system.

The current task model has two layers:

* coarse business outcome on `Task.status`
* structured operational progression through `TaskStep`
* task-centric communication timeline through linked inbound and outbound `Message` records

The task status enum is still intentionally coarse:

* `PENDING`
* `ACTIONED`
* `REJECTED`

More detailed workflow state is now represented through:

* `Task.workflowState` and related summary fields
* ordered `TaskStep` records inside the task
* structured closure fields such as `resolvedAs`, `resolutionType`, `customerOutcome`, and follow-up metadata
* `payload.manualIntake` for structured external-intake identity data
* `TaskAction` records for the immutable audit trail
* `MemberActionToken` records for secure self-service flows

Initial step plans are now sourced from a centralized workflow-template registry in `src/services/taskWorkflowTemplates.js`. AI can still propose steps, but the backend always has deterministic subtype/category templates to fall back on.

Manual external tasks and webhook-created external tasks now use the same conservative identity-resolution layer. High-confidence matches can auto-link to an existing member, weak matches are surfaced as `REVIEW_REQUIRED`, and booking/order/account intake can create a new contact record when no safe existing match is found.

That layer now supports ranked review candidates, winery-tunable matching thresholds, and customer merge tooling in the dashboard.

Tasks now also own a communication timeline. Webhook-ingested inbound messages and execution-triggered outbound notifications are linked back to the case so staff and AI can reason over the same thread.

Closed tasks now also carry a structured outcome taxonomy. Instead of relying only on freeform `resolutionSummary`, the live build records normalized closure semantics like `resolvedAs`, `resolutionType`, `customerOutcome`, `followUpRequired`, and `followUpDueAt`. That gives analytics and future automation a cleaner backbone.

That closure layer now drives deterministic follow-up automation too. When a closed case explicitly requires follow-up, ends in customer no response, or closes as an escalation, the backend can create or update a managed child follow-up task linked through `parentTaskId`. Reopening the parent task or clearing the follow-up need cancels the pending automated child task instead of leaving stale reminders behind.

The execution layer is now deeper too. Address changes still use secure member-confirmation links, booking tasks can write through the configured booking provider, order tasks can record CRM-backed writeback results, and outbound customer notifications now have email parity with SMS. Those external effects are persisted back onto the task through outbound `Message` rows, `payload.executionResults`, and task audit events.

When a managed follow-up task is created, the assignee can also receive a system notification so the next case does not depend on someone remembering to revisit the parent task manually.

Analytics now reads from the same operational case record instead of only counting tasks. The dashboard surfaces workflow state, waiting and blocked work, response latency, handoffs, identity-review load, and follow-up automation conversion alongside the older customer and booking charts.

Projects provide an outcome-first workspace under Work. A Project has one accountable owner, an optional Project Lead who reports to that owner, organisation or area visibility, participants, dates, status, separately derived health, files, and immutable Project activity. A governing manager may delegate day-to-day coordination to any active user from a participating area without promoting that user organisationally. The lead may coordinate the Project and create cross-area delegated Tasks, but cannot change the owner, lead appointment, area scope, completion, cancellation, or completion overrides. Linked records remain authoritative and keep their own permissions; only Tasks created through the dedicated Project delegation flow receive revocable, Project-scoped lead access. Required Task workflow completion drives Project progress; dependencies, blocked/overdue work, pending Requests, Events, and milestones drive the explainable attention and next-action summary. Home presents each person's current and upcoming Projects with their specific owner, lead, participant, stakeholder, or delegated-work relationship.

Example: an address-change task starts `PENDING`, triage proposes a step plan, a manager actions it, the system creates a secure token and sends the member a link, the task returns to `PENDING` while the workflow is `WAITING`, and becomes `ACTIONED` again once the member confirms.

Example: an external order call can capture requester details, suggest a likely existing customer without auto-linking if confidence is weak, and enrich the linked member record once the task is actioned.

## Repository Layout

```text
/
  docs/          Project docs and contracts
  frontend/      Dashboard and public flows
  scripts/       Local utilities
  src/           Express API, models, services, tests
```

Key backend areas:

* `src/routes` - route surface under `/api`
* `src/controllers` - HTTP orchestration
* `src/services` - business logic
* `src/models` - Sequelize models
* `src/tests` - unit and integration coverage

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables from `.env.example` to `.env` and fill in local values.

3. Create the database and run migrations:

```bash
npm run db:migrate
```

4. Run the test suite:

```bash
npm test
```

5. Start the API:

```bash
npm run dev
```

The integration worker is a separate, disabled-by-default process. It should only be deployed after its
environment gate is enabled and its reviewed connector handlers, credentials, and outbound allowlists are
configured. The Booking connector boundary is read-only, and its initial hydration stores non-actioning shadow
observations:

```bash
npm run start:worker
```

Hydration remains non-actioning. After explicit Booking authority activation, the separately gated durable
scheduler can queue incremental and reconciliation reads whose material canonical changes may reach active
manager-approved automations. See `docs/BOOKING_SYNC_SCHEDULER.md` before enabling that cadence.

Managers/admins also have provider-neutral operational controls for pausing and resuming individual sync
streams, cancelling queued jobs, replaying terminal jobs with immutable lineage, and requeuing failed canonical
event deliveries. These controls and their append-only audit trail can be deployed and tested before live
provider credentials are available. See `docs/INTEGRATION_OPERATIONAL_CONTROLS.md`.

The worker's scheduling phase is now domain-registered. Booking is the first configured scheduler, while
future Wine Club, commerce, inventory, fulfilment/postage, and workforce schedulers can use the same aggregate
worker lifecycle and transactional provider-rate permits. See `docs/INTEGRATION_SCHEDULER_REGISTRY.md`.

Canonical provider webhook intake is also available without live provider credentials. Managers can create an
opaque connection-scoped endpoint whose verification material is separately encrypted, use the strict signed
change-hint bridge for fixture testing, and rotate, disable, enable, or revoke it. Receipts are idempotent and
raw provider bodies are not retained; the worker dispatches them through a domain recovery registry so only a
normal provider read can create canonical facts. Booking is the first recovery registration. See
`docs/PROVIDER_NEUTRAL_WEBHOOK_INTAKE.md`.

Legacy winery/area integration JSON can now be inventoried without credentials through a manager-reviewed
dry-run/apply flow. The mapper uses explicit domain mappings, creates only `PENDING` credential-less canonical
connections, preserves weak identities as separate candidates, and records ambiguity or key collisions for
review. It does not switch runtime authority or alter legacy settings. See
`docs/LEGACY_INTEGRATION_BACKFILL.md`.

Projection issues now have a tenant-safe manager review lifecycle. Managers can acknowledge ownership,
record only registry-approved typed decisions, or explicitly ignore an issue; each transition is idempotent
and append-only audited. Legacy connection mapping decisions are the first registered resolvers and do not
silently mutate connections or authority. See `docs/PROJECTION_ISSUE_REVIEW.md`.

Per-winery/domain configuration authority is now explicit. Booking can be safely prepared without live
credentials, while activation remains gated on verified canonical readiness and a separate disabled-by-default
deployment flag. Canonical authority projects a sanitized legacy compatibility view, rejects a second writer,
and supports an audited rollback to the captured metadata baseline. See
`docs/INTEGRATION_CONFIGURATION_CUTOVER.md`.

The first canonical Customer slice keeps `Member` as the root and writer while adding normalized contact
points, address projections, append-only consent history, and lifecycle milestones. A stale-protected,
idempotent manager backfill never infers affirmative consent from the old boolean, a relationship endpoint
surfaces projection drift, and customer merges now transfer/deduplicate the new history. See
`docs/CANONICAL_CUSTOMER_PROFILE.md`.

The canonical Wine Club foundation now stores provider-neutral programs, memberships, immutable membership
events, allocation cycles, and complete allocation lines. Its strict fixture-ready projector requires explicit
customer/program mappings, records stale or competing-source issues, remains non-actioning, and preserves
memberships safely through customer merges. See `docs/CANONICAL_WINE_CLUB.md`.

The canonical Commerce foundation now stores provider-neutral Sales Orders, complete lines, immutable
payment-summary events, and ordered refund summaries. It accepts explicit unresolved identities, rejects
financial secrets and guessed links, remains non-actioning, and leaves legacy customer rollups unchanged. See
`docs/CANONICAL_COMMERCE.md`.

Optional cross-system relationships now use bounded Business Entity Links with append-only evidence and an
audited manager confirmation/rejection/invalidation lifecycle. Symmetric identity/order candidates converge
without merging records, and customer merges preserve or invalidate links safely. Links remain non-actioning.
See `docs/BUSINESS_ENTITY_RELATIONSHIPS.md`.

Canonical Customer Rollups can now be previewed and rebuilt from club, booking, commerce, and duplicate-order
facts with run-scoped contribution lineage. Monetary values remain separated by currency, ambiguity is
surfaced, merge invalidates stale current values, and legacy Member totals are never written. See
`docs/CANONICAL_CUSTOMER_ROLLUPS.md`.

The canonical Catalogue and Inventory foundation now adds exact Product Variants, Stock Locations,
freshness-bounded current positions, immutable snapshots, and typed demand commitments. Audited source-code
mappings can turn Booking requirements such as `truffle-pairing` into deterministic demand, while
available-to-promise fails closed for missing, stale, conflicting, future-dated, or unit-mismatched stock.
Legacy merchandising stock remains untouched and inventory is not live-actioning. See
`docs/CANONICAL_INVENTORY.md`.

The canonical Fulfilment foundation now stores one current Shipment graph with complete Packages/Items and
immutable Tracking Events. Full tracking values and restricted addresses are excluded from automation
context, future/stale observations fail closed, and a manager-installable draft rule defines reconciled
delivery-exception work without enabling live fulfilment. See `docs/CANONICAL_FULFILMENT.md`.

The canonical Workforce foundation now separates external staff identity from User authority, stores exact
roles/skills, shifts and bounded leave, and requires fresh complete roster-window evidence before reporting a
real Booking coverage gap. Manager mappings, a bounded coverage context, and draft managed-work template are
available without enabling live workforce action. See `docs/CANONICAL_WORKFORCE.md`.

Existing SMS, email, and voice-linked Message rows now support connection-scoped external references and an
immutable provider-neutral delivery timeline. Replays are idempotent, late history cannot regress current
status, mapping/event conflicts are surfaced, and manager delivery reads omit message content and contact
data. Communication projection remains non-actioning. See `docs/CANONICAL_COMMUNICATIONS.md`.

The registered Intelligence Fact layer now stores append-only, temporal, source-explainable conclusions for
Booking readiness, Shipment exceptions, and Message delivery. Privacy-bounded Customer relationship, Club
fulfilment, and Area capacity contexts combine the canonical domains without enabling action directly. See
`docs/INTELLIGENCE_FACTS_AND_CONTEXTS.md`.

Managers now have one aggregated integration-health view across all canonical domains. A default-off common
activation workflow proves scope, capability, credential, projection, authority, watermark, and issue
readiness for non-Booking domains; fixture conformance can run before real credentials exist. See
`docs/INTEGRATION_HEALTH_AND_ACTIVATION.md` and `docs/DOMAIN_CONNECTOR_CONFORMANCE.md`.

Health endpoints:

* `GET /`
* `GET /health`
* `GET /api/health`

## Useful Scripts

```bash
npm test
npm run test:unit
npm run test:int
npm run lint
npm run format
npm run start:worker
npm run seed:sidewood:projects
```

## Core Docs

Start here if you need the current backend contract:

* `docs/ARCHITECTURE.md`
* `docs/DOMAIN_MODEL.md`
* `docs/OPERATIONAL_AREAS.md`
* `docs/OPERATIONAL_INTELLIGENCE_IMPLEMENTATION.md`
* `docs/AUTOMATION_ENGINE.md`
* `docs/WINERY_INTELLIGENCE_DATA_ARCHITECTURE.md`
* `docs/BOOKING_SHADOW_CONNECTOR.md`
* `docs/CANONICAL_BOOKING_PROJECTION.md`
* `docs/BOOKING_LIVE_READINESS.md`
* `docs/BOOKING_ADAPTER_CONFORMANCE.md`
* `docs/OPENTABLE_BOOKING_SYNC.md`
* `docs/BOOKING_SYNC_SCHEDULER.md`
* `docs/PROJECTION_ISSUE_REVIEW.md`
* `docs/INTEGRATION_CONFIGURATION_CUTOVER.md`
* `docs/CANONICAL_CUSTOMER_PROFILE.md`
* `docs/CANONICAL_WINE_CLUB.md`
* `docs/CANONICAL_COMMERCE.md`
* `docs/BUSINESS_ENTITY_RELATIONSHIPS.md`
* `docs/CANONICAL_CUSTOMER_ROLLUPS.md`
* `docs/CANONICAL_INVENTORY.md`
* `docs/CANONICAL_FULFILMENT.md`
* `docs/CANONICAL_WORKFORCE.md`
* `docs/CANONICAL_COMMUNICATIONS.md`
* `docs/INTELLIGENCE_FACTS_AND_CONTEXTS.md`
* `docs/INTEGRATION_HEALTH_AND_ACTIVATION.md`
* `docs/DOMAIN_CONNECTOR_CONFORMANCE.md`
* `docs/AUTOMATION_RESOURCE_BINDINGS.md`
* `docs/PROJECTS_IMPLEMENTATION_PLAN.md`
* `docs/FRONTEND_UX_BUILD_PLAN.md`
* `docs/API_SPEC.md`
* `docs/TASK_WORKFLOW_PLAN.md`
* `docs/GOLDEN_PATH.md`
* `docs/TEST_PLAN.md`
* `docs/PRODUCTION_READINESS.md`
* `docs/COOLIFY_DEPLOYMENT.md`
* `docs/MYSQL_MIGRATION_REHEARSAL.md`
* `docs/FUTURE_PRODUCT_PASSES.md`

Supporting references:

* `docs/COMPONENTS.md`
* `docs/AUDIT_LOGGING.md`
* `docs/SETUP_BEGINNER.md`
* `docs/ROADMAP.md`

## Development Notes

The implementation now uses a simplified task status model plus a structured workflow-step layer. In tests, the AI service defaults to a deterministic mock adapter even if `OPENAI_API_KEY` is present. Only opt into live AI during tests when `AI_ALLOW_LIVE_TESTS=true`.

When in doubt, prefer the live backend implementation over older wording in historical docs, and keep docs/tests aligned to the running code.
