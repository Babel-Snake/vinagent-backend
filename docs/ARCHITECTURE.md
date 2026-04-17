# ARCHITECTURE.md

This document describes the current VinAgent architecture as implemented in the repository today.

## 1. System Overview

VinAgent is a winery operations platform built around a task workflow. It receives inbound communications, classifies them, stores them as tasks, lets staff act on them, and performs safe follow-up actions such as secure self-service links or outbound notifications.

The main subsystems are:

* HTTP API layer (`Express`)
* Authentication and role checks (`Firebase Auth` + local `User` records)
* Webhook ingestion (`sms`, `email`, `voice`, `retell`)
* Triage and AI suggestion services
* Task management and audit trail
* Execution layer for safe automations
* Winery knowledge/configuration services
* Public token-based self-service flows
* Dashboard frontend (`frontend/`)
* MySQL persistence via `Sequelize`

## 2. Current End-to-End Flow

The canonical backend flow is:

1. A member or system sends a message.
2. A webhook route validates the request and normalizes it into a `Message`.
3. `triage.service` classifies intent and proposes task metadata.
4. The backend creates a `Task` and, where available, an initial `TaskStep` plan.
5. Staff review, annotate, assign, action, or reject the task through `/api/tasks`.
6. If a task is actioned, `execution.service` may perform best-effort automation.
7. All staff actions are written to `TaskAction`.
8. If the task requires a secure member confirmation, a `MemberActionToken` is created and the member completes the action through `/api/public/...`.

## 3. Routing Surface

The app mounts all API routes under `/api`.

Current route groups:

* `/api/webhooks/*` - inbound provider traffic
* `/api/public/*` - token-based member self-service
* `/api/tasks/*` - task list/detail/update flows
* `/api/tasks/flags/*` - per-user task flags
* `/api/members/*`
* `/api/staff/*`
* `/api/users/*`
* `/api/winery/*`
* `/api/notifications/*`
* `/api/calendar/*`
* `/api/analytics/*`

Global middleware currently handles:

* request IDs
* structured request logging
* Helmet
* CORS
* rate limiting
* centralized error responses

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
* ordered `TaskStep` rows
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

This gives the system a way to represent staged work without exploding the coarse task status enum.

## 6. Execution Model

Actioning a task is not the same as finishing all downstream work.

`taskService.updateTask()`:

1. persists the task update
2. writes a `TaskAction`
3. if the new status is `ACTIONED`, calls `execution.service.executeTask(...)`
4. re-derives the task workflow summary from its steps

Execution is best-effort. If execution fails validation or the provider logic throws, the status change is not rolled back.

### 6.1 Address Change Flow

For `ACCOUNT_ADDRESS_CHANGE` / legacy `ADDRESS_CHANGE` tasks:

1. staff action the task (`ACTIONED`)
2. `execution.service` validates payload
3. a `MemberActionToken` is created
4. the task is set back to `PENDING`
5. `EXECUTION_TRIGGERED` is logged
6. a secure link is sent through the selected channel
7. when the member confirms, `addressUpdateService` updates the member and marks the task `ACTIONED`

This is why a secure-link task can look `PENDING` after a manager has already actioned it.

### 6.2 Order and Booking Flows

Current execution paths:

* order tasks use a stub execution path and remain `ACTIONED`
* booking tasks call the configured booking provider and remain `ACTIONED` on success
* unsupported task types are logged and left without automatic side effects

### 6.3 Feature Flags

`WinerySettings` controls whether some categories can be auto-triaged or auto-executed.

Important examples:

* `enableWineClubModule`
* `enableOrdersModule`
* `enableBookingModule`
* `enableSecureLinks`

## 7. AI Architecture

There are two AI-related paths in the current build:

### 7.1 Triage

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

### 7.2 Reply/Action Suggestions

`aiSuggestion.service` can regenerate suggested replies/actions using task context, winery context, task history, member context, and the current ordered step plan.

## 8. Winery Context

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

## 9. Security Model

Current security controls include:

* Firebase-backed auth for dashboard routes
* role-based checks in middleware and services
* provider signature validation for webhooks
* token-based security for member self-service
* request correlation IDs and centralized error responses
* redaction/scrubbing in parts of the ingestion path

## 10. Observed Constraints

A few design realities matter when changing the system:

* `Task.type` still exists for backward compatibility, but `category` + `subType` are the preferred classification fields.
* `Task.status` is not the workflow engine. `TaskStep` + workflow summary fields now carry staged progression.
* The audit trail is richer than the status model; do not try to reintroduce old fine-grained statuses without checking current services first.
* Several user-facing behaviours depend on feature flags in `WinerySettings`.

## 11. Summary

The current VinAgent architecture is best understood as a task-centric workflow engine for winery operations. The simplified status model is intentional, and structured workflow progression now lives in `TaskStep`. If you need exact behaviour, read `taskService`, `execution.service`, and `addressUpdateService` together; that is the live contract the docs and tests should follow.
