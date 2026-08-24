# ARCHITECTURE.md

This document describes the current VinAgent architecture as implemented in the repository today.

## 1. System Overview

VinAgent is a winery operations platform built around a task workflow. It receives inbound communications, classifies them, stores them as tasks, lets staff act on them, and performs safe follow-up actions such as secure self-service links, outbound notifications, or managed child follow-up cases.

The main subsystems are:

* HTTP API layer (`Express`)
* Authentication and role checks (`Firebase Auth` + local `User` records)
* Webhook ingestion (`sms`, `email`, `voice`, `retell`)
* Triage and AI suggestion services
* Task management and audit trail
* Execution layer for safe automations
* Winery knowledge/configuration services
* Public token-based self-service flows
* Operational analytics over workflow, response, identity, and follow-up data
* Billing-ready usage metering over immutable events, counters, gauges, and engagement aggregates
* Provider-neutral integration projections for canonical Booking, Customer profile, Wine Club, Commerce,
  Inventory, Fulfilment, Workforce, and Communication facts
* Dashboard frontend (`frontend/`)
* MySQL persistence via `Sequelize`

## 2. Current End-to-End Flow

The canonical backend flow is:

1. A member or system sends a message.
2. A webhook route validates the request and normalizes it into a `Message`.
3. `triage.service` classifies intent and proposes task metadata.
4. The backend creates a `Task` and, where available, an initial `TaskStep` plan.
5. The inbound `Message` is linked onto the task communication timeline.
6. Staff review, annotate, assign, action, or reject the task through `/api/tasks`.
7. If a task is actioned, `execution.service` performs the supported automation. Execution failures roll the task transition back; unsupported live providers fail closed.
8. Outbound notifications are logged back onto the same task as outbound `Message` records.
9. If the case closes with explicit follow-up, customer no response, or escalation semantics, `taskService` can create or update a managed child follow-up task.
10. All staff actions and automation linkage events are written to `TaskAction`.
11. If the task requires secure member confirmation, a hashed-at-rest `MemberActionToken` is created and the member completes the action through the public `/confirm-address` page and `/api/public/...` API.

## 3. Routing Surface

The app mounts business API routes under `/api`. Container probes are exposed separately as `/health/live` and `/health/ready` so readiness can check the database, migrations, storage, and production configuration without dashboard authentication.

Current route groups:

* `/api/webhooks/*` - inbound provider traffic
* `/api/public/*` - token-based member self-service
* `/api/tasks/*` - task list/detail/update flows
* `/api/tasks/flags/*` - per-user task flags
* `/api/notices/*` - noticeboard, acknowledgement, comments, and task links
* `/api/integration-events/*` - review queue for imported provider events
* `/api/operational-areas/*` - operational-area membership and configuration
* `/api/requests/*` - operational requests and decisions
* `/api/operational-records/*` - operational notes/records
* `/api/operations/*` - cross-record search and classification
* `/api/projects/*` - projects, items, dependencies, participants, and audit events
* `/api/attachments/*` - scoped upload/download/delete flows
* `/api/members/*`
* `/api/staff/*`
* `/api/users/*`
* `/api/winery/*`
* `/api/notifications/*`
* `/api/calendar/*`
* `/api/analytics/*`
* `/api/usage/*` - aggregate usage reporting, activity heartbeat, snapshots, and reconciliation
* `/api/integration-management/*` - manager-scoped canonical integration configuration, review, and shadow data

Global middleware currently handles:

* request IDs
* structured request logging
* Helmet
* CORS
* rate limiting
* centralized error responses
* authenticated API request counter bucketing without raw paths or query data

## 4. Layering

### 4.1 Controllers

Controllers handle request validation, auth context, and response formatting. They should stay thin.

Examples:

* `task.controller.js`
* `webhook.controller.js`
* `addressUpdateController.js`
* `winery.controller.js`

### 4.2 Services

Services hold the business logic.

Important current services:

* `triage.service.js` - classify messages or staff notes
* `taskService.js` - create/update/list/get tasks
* `execution.service.js` - run follow-up logic after actioning
* `addressUpdateService.js` - apply confirmed member address updates
* `memberActionTokenService.js` - secure token lifecycle
* `aiSuggestion.service.js` - regenerate suggested replies/actions
* `winery.service.js` - aggregate winery context for AI

### 4.3 Models

Sequelize models define persistence and associations. The central workflow models are:

* `Message`
* `Task`
* `TaskStep`
* `TaskAction`
* `MemberActionToken`
* `Member`
* `User`
* `Winery`
* `WinerySettings`

## 5. Current Task Model

The current implementation deliberately uses a coarse task status enum:

* `PENDING`
* `ACTIONED`
* `REJECTED`

Important consequence:

Task status alone does not describe every stage of work. Fine-grained state now lives in:

* task workflow summary fields on `Task`
* linked `Message` records on the case communication timeline
* ordered `TaskStep` rows
* parent/child task links for managed follow-up cases
* `TaskAction`
* token tables for secure member actions

### 5.1 Status Meaning

* `PENDING` means the task still requires attention, or is waiting on an external/member step.
* `ACTIONED` means a human or automation has completed the next intended action.
* `REJECTED` means the task was explicitly declined or closed without action.

### 5.2 Status Transition Rules

Current allowed transitions:

* `PENDING -> ACTIONED`
* `PENDING -> REJECTED`
* `ACTIONED -> PENDING`
* `REJECTED -> PENDING`

Role rules:

* staff can action tasks
* staff cannot reject tasks
* staff cannot reassign tasks

### 5.3 Workflow Layer

Each task can now carry a structured step list through `TaskStep`.

The task also stores a derived workflow summary:

* `workflowState`
* `waitingOn`
* `nextStepSummary`
* `blockedReason`
* `dueAt`
* structured closure fields such as `resolvedAs`, `resolutionType`, `customerOutcome`, `followUpRequired`, `followUpDueAt`, and `resolutionSummary`

This gives the system a way to represent staged work without exploding the coarse task status enum.

Managed follow-up tasks are intentionally represented as child `Task` records instead of extra status values. That keeps post-closure work as a real queue item with its own assignee, due date, steps, and audit trail.

## 6. Execution Model

Actioning a task is not the same as finishing all downstream work.

`taskService.updateTask()`:

1. persists the task update
2. writes a `TaskAction`
3. records normalized closure outcome fields when the task ends in `ACTIONED` or `REJECTED`
4. if the new status is `ACTIONED`, calls `execution.service.executeTask(...)`
5. syncs managed follow-up automation based on closure semantics
6. re-derives the task workflow summary from its steps

Execution is best-effort. If execution fails validation or the provider logic throws, the status change is not rolled back.

When execution sends a customer-facing message, that message is persisted back onto the task timeline so the case record remains complete.
Provider results are also captured structurally through `payload.executionResults` and `EXECUTION_RECORDED` audit events.

### 6.0 Follow-Up Automation

Closed tasks can now create or manage a child follow-up case when:

* `followUpRequired = true`
* `resolutionType = CUSTOMER_NO_RESPONSE`
* `resolvedAs = ESCALATED` or the resolution type is an escalation variant

The managed child task:

* links back to the parent through `parentTaskId`
* stores automation metadata in `payload.followUpAutomation`
* receives its own `TaskStep` plan and due date
* can notify the assigned staff member through a `SYSTEM` notification

If the parent task is reopened or its follow-up semantics change, the backend updates or cancels the managed child task instead of creating duplicates.

### 6.1 Address Change Flow

For `ACCOUNT_ADDRESS_CHANGE` / legacy `ADDRESS_CHANGE` tasks:

1. staff action the task (`ACTIONED`)
2. `execution.service` validates payload
3. a `MemberActionToken` is created
4. the task is set back to `PENDING`
5. `EXECUTION_TRIGGERED` is logged
6. a secure link is sent through the selected channel
7. when the member confirms, `addressUpdateService` updates the member, marks the task `ACTIONED`, and records a normalized completion outcome

This is why a secure-link task can look `PENDING` after a manager has already actioned it.

### 6.2 Order and Booking Flows

Current execution paths:

* order tasks can write back into the configured CRM provider, persist `payload.orderWriteback`, and remain `ACTIONED` on success
* booking tasks call the configured booking provider and record structured reservation results
* outbound notifications now support both SMS and email, and are logged back into the task timeline as outbound `Message` rows
* unsupported task types are logged and left without automatic side effects

### 6.3 Feature Flags

`WinerySettings` controls whether some categories can be auto-triaged or auto-executed.

Important examples:

* `enableWineClubModule`
* `enableOrdersModule`
* `enableBookingModule`
* `enableSecureLinks`

Execution gating is now feature-specific:

* secure-link flows depend on `enableSecureLinks`
* booking execution depends on `enableBookingModule`
* order writeback depends on `enableOrdersModule`

### 6.4 Tool-Agnostic Automation

Manager-approved automation rules sit above provider adapters and normalized `IntegrationEvent` records. Rules bind to canonical event and capability names rather than vendors. The engine may call schema-validated read capabilities, evaluates an allowlisted deterministic condition tree, and creates an authoritative Task or Notice through the existing domain services.

`AutomationRuleVersion` preserves every executable definition. `AutomationRun` provides rule/source idempotency and records the trigger, context, decision, and generated item. `AutomationRunStep` records each capability invocation. New integration events automatically evaluate matching active rules; previews perform the same enrichment and decision work without creating an action.

The provider-neutral data foundation now adds first-class connections/scopes, sync and external-reference
ledgers, versioned data-authority policies, lease-based integration jobs, and a transactional canonical-event
outbox. Its worker runs as a separate process, is disabled by default, never overlaps poll cycles, and only
executes explicitly registered job kinds. Manager/admin configuration and bounded queue visibility are exposed
under `/api/integration-management`.

The first registered connector slice adds protected per-connection credentials and the read-only
`vinagent-booking-feed` contract. A manager can verify access, request bounded booking hydration, approve an
authority/activation watermark, and then queue guarded incremental or completeness-checked reconciliation
runs. The worker schema-validates and data-minimizes each page, stores connection-scoped source evidence, and
projects typed Bookings, Items, Requirements, Area Links, and Status Events. Hydration remains non-actioning;
only material post-activation changes can become eligible canonical events. A versioned native read-adapter
boundary now validates every adapter page again at the worker, and a shared corpus proves equivalent facts
through cursor/named-status and offset/numeric-status reference translators. The credential-gated OpenTable
Sync implementation passes the corpus and is registered for reviewed onboarding, but real partner/pilot
verification, a native OpenTable webhook adapter, and compatibility cutover remain pending. A conservative
legacy compatibility inventory/backfill now creates only credential-less `PENDING` connection candidates,
uses exact identity evidence for merges, and records ambiguity without changing runtime authority. A separate
provider-neutral webhook boundary now accepts strict signed change hints through opaque, connection-scoped
endpoints, stores no raw provider body, and durably dispatches Booking recovery through the normal incremental
read path. The disabled-by-default Booking sync
scheduler now discovers only connected, hydrated, polling-capable, manager-activated streams; transactionally
queues incremental or reconciliation jobs; advances durable stream cadence; and uses a global provider permit
row with minimum-spacing and fixed-window policy to bound provider traffic. See
`docs/BOOKING_SYNC_SCHEDULER.md`.

Worker scheduling is now domain-registered rather than Booking-wired. `IntegrationSchedulerRegistry` loads
strict per-domain configuration, invokes schedulers in deterministic order, aggregates results, and isolates a
runtime failure in one domain so other schedulers and the durable job/outbox paths still run. The shared
provider schedule service owns transactional `(domain, providerKey)` spacing and fixed-window permits. Booking
is the first registration; later canonical domains use the same orchestration contract. See
`docs/INTEGRATION_SCHEDULER_REGISTRY.md`.

Webhook verification is adapter-owned and verification material is encrypted separately from outbound
connection credentials. `IntegrationWebhookEndpoint` provides rotation and lifecycle state;
`IntegrationWebhookAdapterRegistry` normalizes provider notifications; and
`IntegrationWebhookRecoveryRegistry` converts verified hints into canonical-domain recovery jobs. The hint
itself is never automation-eligible. See `docs/PROVIDER_NEUTRAL_WEBHOOK_INTAKE.md`.

The compatibility inventory is exposed as a manager dry-run/apply operation. Deterministic candidate keys and
scopes make it idempotent; append-only operation history records apply commands; and `ProjectionIssue` rows
surface weak identity or key collisions. Legacy JSON and derived `WinerySettings` remain the active
compatibility source until the later per-winery/domain one-writer cutover. See
`docs/LEGACY_INTEGRATION_BACKFILL.md`.

Projection issues now expose a tenant-scoped manager review lifecycle with `OPEN`, `ACKNOWLEDGED`, `RESOLVED`,
and `IGNORED` states. Resolution fails closed unless an issue-type handler is registered. The first handlers
validate legacy connection mapping decisions and candidate ownership, record the decision transactionally,
and deliberately leave connection/authority mutation to a later explicit operation. Every transition is
request-idempotent and append-only audited without copying source evidence into audit snapshots. See
`docs/PROJECTION_ISSUE_REVIEW.md`.

Configuration writer ownership is now explicit in `IntegrationConfigurationAuthority`. A manager can prepare
a sanitized rollback baseline before credentials exist, but canonical activation uses a fresh hashed preview
and fails closed unless the domain's registered readiness contract passes. Booking is first: it requires live
canonical activation, connected authority sources, no blocking issues, a winery default, a deployment gate,
and the old reservation-write path disabled. Activation projects one-way compatibility metadata; legacy edits
and canonical mutations that would invalidate the selected source are rejected until audited rollback. See
`docs/INTEGRATION_CONFIGURATION_CUTOVER.md`.

The Customer graph now starts from the existing canonical `Member` rather than a parallel customer table.
Additive `CustomerContactPoint`, `CustomerAddress`, append-only `CustomerConsent`, and
`CustomerLifecycleMilestone` rows support normalized identity and explainable history. A preview-hashed,
idempotent manager backfill keeps Member authoritative, maps legacy contact/address fields, records marketing
consent only as `UNKNOWN`, and emits a PII-free audit. Relationship reads expose drift and customer merge
transfers/deduplicates the children transactionally. See `docs/CANONICAL_CUSTOMER_PROFILE.md`.

The generic integration control plane now persists stream-level `ACTIVE`/`PAUSED` state, explicit terminal
dead-letter timestamps, immutable job replay lineage, and append-only operator audit events. Manager/admin
routes can pause or resume one stream, cancel queued work, create a new replay job from a terminal job, or
requeue a failed canonical outbox delivery. Paused streams are excluded by scheduler queries and by the final
transactional scheduling check; provider cursors, credentials, raw events, and copied job payloads are omitted
from operational responses and audit snapshots. See `docs/INTEGRATION_OPERATIONAL_CONTROLS.md`.

`booking.readiness.v1` is the first bounded context pack. It combines canonical booking preparation facts,
privacy-safe requirement counts, primary operational scope, freshness, linked open work, exact
freshness-safe canonical inventory commitments, and freshness-safe workforce coverage. Inventory and
workforce return `UNKNOWN` unless their explicit mappings and complete current evidence exist. A manager-installable truffle template
creates a draft rule that must be activated before it can create one designated human stock-check Task.
An `AutomationResourceBinding` then owns the longer lifecycle: later Booking changes update declared fields on
untouched work, cancellation cancels untouched work, and staff-edited/progressed Tasks are preserved and
annotated. The binding is generic; the truffle Booking Task is the first registered lifecycle handler.

See `docs/AUTOMATION_ENGINE.md` for the rule contract, APIs, safety model, and connector rollout plan.

See `docs/WINERY_INTELLIGENCE_DATA_ARCHITECTURE.md` for the target connection control plane, canonical winery projections, cross-domain facts, synchronization rules, and phased provider-agnostic data build.

See `docs/BOOKING_SHADOW_CONNECTOR.md` for the feed contract, credential controls, manager flow, persisted
shadow state, and deployment gates.

See `docs/CANONICAL_BOOKING_PROJECTION.md` for the typed projection, authority rules, sensitive-requirement
handling, activation prerequisites, and non-retroactive eligibility contract.

See `docs/BOOKING_LIVE_READINESS.md` for guarded polling, the readiness context contract, and the first
manager-installed canonical booking rule.

See `docs/AUTOMATION_RESOURCE_BINDINGS.md` for managed generated-work snapshots, human-override detection,
and update/cancel/annotate policy.

See `docs/CANONICAL_INVENTORY.md` for Product Variant and Stock Location mappings, strict shadow inventory
projection, immutable snapshots, typed commitments, conservative available-to-promise, and the Booking demand
bridge.

See `docs/CANONICAL_FULFILMENT.md` for the privacy-safe Shipment/Package/Item graph, immutable Tracking
Events, delivery-exception context, managed Task lifecycle, and deliberate shadow/activation boundary.

See `docs/CANONICAL_WORKFORCE.md` for safe Staff Identity/User reconciliation, manager-owned role/skill
mappings, strict roster/availability projection, complete-window coverage evidence, and managed Booking gap
work.

See `docs/CANONICAL_COMMUNICATIONS.md` for connection-scoped Message lineage, immutable delivery events,
privacy-bounded manager history, deterministic current status, and the deliberate non-actioning boundary.

The semantic layer now has registered append-only `IntelligenceFact` versions and audited materialization
runs. Bounded Customer relationship, Club fulfilment, and Area capacity context packs join canonical domains
without copying provider payloads or becoming actions. Temporal regression, expired consent, truncation,
missing mappings, and stale evidence fail closed. See `docs/INTELLIGENCE_FACTS_AND_CONTEXTS.md`.

Manager integration health aggregates mapping, freshness, issue, stream, activation, and fact quality by
canonical domain. Non-Booking domains share a default-off activation contract; real providers require
verified protected credentials while fixtures can exercise the same readiness and non-retroactive lifecycle
in tests. A reusable connector conformance contract keeps provider pagination and payload differences behind
the adapter boundary. See `docs/INTEGRATION_HEALTH_AND_ACTIVATION.md` and
`docs/DOMAIN_CONNECTOR_CONFORMANCE.md`.

## 7. Project Coordination Layer

Projects are an optional container above Tasks, Requests, Notices, Notes, and Calendar Events. They do not replace those source domains or create a second workflow engine.

Project authority has two tiers. Governance belongs to global managers and area managers who manage every participating area; governance controls accountability, leadership, scope, and terminal lifecycle changes. An explicitly appointed Project Lead receives delivery-management authority only for that open Project. Cross-area Task delegation uses one transaction to validate the Project area and assignee membership, create the authoritative Task, mark its Project link as `DELEGATED_WORK`, write Task and Project audits, and enqueue assignee/manager notifications. Existing `REFERENCE` links remain permission-neutral.

The Project implementation is split across:

* `projectVisibility.service.js` for tenant, organisation, area, owner/creator, and participant visibility plus manage authority
* `projectItemResolver.service.js` for permission-safe typed source resolution and compact link serialization
* `projectSummary.service.js` for pure progress, health, attention, milestone, dependency, and next-action derivation
* `project.service.js` for lifecycle transactions, memberships, dependencies, audit, attachments, and notifications
* `project.controller.js` and `project.routes.js` for the HTTP boundary under `/api/projects`

Project membership is polymorphic through `ProjectItem(itemType, itemId)`. Because this edge cannot use one conventional foreign key, the service validates that the target exists in the same winery and that the actor can see it before linking. Project participation never grants access to a restricted child item; detail responses omit hidden child metadata and expose only a restricted count.

Progress is `completed required Tasks / required Tasks` and is null when no required Task exists. Health is derived separately from lifecycle status so an Active Project can be On Track, At Risk, Blocked, or Overdue. Project completion is guarded while required Tasks remain incomplete unless an authorised human records an explicit reasoned override.

## 8. AI Architecture

There are two AI-related paths in the current build:

### 8.1 Triage

`triage.service` prefers AI classification unless `AI_SKIP=true`. If AI is unavailable, it falls back to deterministic heuristics. Initial step plans are normalized through the centralized workflow-template registry in `taskWorkflowTemplates.js`, so subtype/category defaults stay consistent even when AI output varies.

The triage output includes:

* `category`
* `subType`
* `customerType`
* `priority`
* `sentiment`
* `payload`
* `suggestedReplyBody`
* `suggestedChannel`
* optional assignee/action hints
* `suggestedSteps`

In `NODE_ENV=test`, the AI service now forces the deterministic mock adapter unless `AI_ALLOW_LIVE_TESTS=true`. That keeps integration tests stable even when developer machines have live API keys configured.

Webhook intake now also shares the same customer identity-resolution engine used by manual external task creation. That keeps auto-link, review-required, and conservative auto-create behavior materially consistent across inbound channels.

### 8.2 Reply/Action Suggestions

`aiSuggestion.service` can regenerate suggested replies/actions using task context, winery context, task history, member context, the current ordered step plan, the task communication timeline, and any already-recorded structured task outcome.

## 9. Analytics Model

`analytics.controller.js` now reports both classic counts and operational flow metrics.

Classic analytics still include:

* task status/category/sentiment/priority
* outcome breakdowns
* customer source, loyalty, and spend
* booking task/event counts
* communication channel and direction counts

The richer operational layer is returned under `operations` and is derived from:

* `Task.workflowState`, `waitingOn`, `dueAt`, and closure fields
* `TaskStep.status` for period step progress
* `TaskAction` assignment and step-owner changes for handoff count
* linked inbound/outbound `Message` rows for first-response latency
* `payload.manualIntake.identityResolutionStatus` for identity-review workload
* child tasks with `payload.followUpAutomation` for follow-up automation conversion

This makes analytics a management surface for where work is slowing, not just a volume dashboard.

## 10. Winery Context

The current backend models winery context as a core winery record plus modular profiles:

* brand profile
* bookings config
* policy profile
* integration config
* products
* FAQs
* SOPs
* winery contacts

This data is used both by the dashboard and by the AI layer.

### 10.1 Usage Metering

`usageTracking.service.js` owns the provider-independent measurement contract. Durable business facts use tenant-scoped idempotent `UsageEvent` rows; authenticated HTTP volume uses hourly `UsageCounterBucket` rows; seats, members, and attachment bytes use winery-local daily `UsageGaugeSnapshot` rows. The dashboard activity heartbeat produces only bounded engaged seconds and daily aggregate activity.

The `/usage` dashboard and `/api/usage/summary` expose winery aggregates to managers/admins. Payment-provider identifiers are not returned. OpenTelemetry remains operational observability and is not the commercial ledger. See `USAGE_METERING.md` for exact definitions and reconciliation gates.

## 11. Security Model

Current security controls include:

* Firebase-backed auth for dashboard routes
* role-based checks in middleware and services
* provider signature validation for webhooks
* token-based security for member self-service
* request correlation IDs and centralized error responses
* redaction/scrubbing in parts of the ingestion path

## 12. Observed Constraints

A few design realities matter when changing the system:

* `Task.type` still exists for backward compatibility, but `category` + `subType` are the preferred classification fields.
* `Task.status` is not the workflow engine. `TaskStep` + workflow summary fields now carry staged progression.
* post-closure automation now uses child tasks rather than hidden reminder state; preserve that shape when extending follow-up logic.
* analytics currently approximates waiting/blocked age from the current task update timestamp; if exact state-duration reporting becomes critical, add explicit state-transition timestamps.
* The audit trail is richer than the status model; do not try to reintroduce old fine-grained statuses without checking current services first.
* Several user-facing behaviours depend on feature flags in `WinerySettings`.
* Project status is persisted, but Project health/progress/attention are derived from current authoritative child state and are not independently editable.
* A Project link never widens the visibility of its source Task, Request, Notice, Note, or Calendar Event.

## 13. Summary

The current VinAgent architecture is best understood as a task-centric workflow engine for winery operations. The simplified status model is intentional, and structured workflow progression now lives in `TaskStep`. If you need exact behaviour, read `taskService`, `execution.service`, and `addressUpdateService` together; that is the live contract the docs and tests should follow.
