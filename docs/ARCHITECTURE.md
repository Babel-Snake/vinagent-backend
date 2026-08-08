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
