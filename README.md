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
npm run seed:sidewood:projects
```

## Core Docs

Start here if you need the current backend contract:

* `docs/ARCHITECTURE.md`
* `docs/DOMAIN_MODEL.md`
* `docs/OPERATIONAL_AREAS.md`
* `docs/OPERATIONAL_INTELLIGENCE_IMPLEMENTATION.md`
* `docs/PROJECTS_IMPLEMENTATION_PLAN.md`
* `docs/FRONTEND_UX_BUILD_PLAN.md`
* `docs/API_SPEC.md`
* `docs/TASK_WORKFLOW_PLAN.md`
* `docs/GOLDEN_PATH.md`
* `docs/TEST_PLAN.md`
* `docs/PRODUCTION_READINESS.md`
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
