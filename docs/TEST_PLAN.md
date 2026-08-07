# TEST_PLAN.md

This document describes the current testing strategy for the live VinAgent backend.

It is aligned to the current implementation, which uses:

* task statuses: `PENDING`, `ACTIONED`, `REJECTED`
* task workflow summary fields on `Task`
* task communication timeline through linked `Message` records
* `TaskStep` for structured progress
* structured task outcome taxonomy on closed tasks
* managed child follow-up tasks driven from structured closure semantics
* structured manual intake and identity-resolution states
* webhook-created task identity-resolution states
* ranked review candidates for uncertain customer matches
* `TaskAction` for detailed audit history
* `MemberActionToken` for secure member self-service

## 1. Testing Goals

The backend test suite should prove that:

1. inbound messages become tasks correctly
2. task operations follow the current status model
3. structured task steps correctly drive workflow summary
4. execution side effects are safe and predictable
5. public token-based flows work end to end
6. auth, permissions, and webhook signatures are enforced
7. task communication history remains attached to the case across inbound and outbound events
8. analytics reports operational flow from workflow, action, identity, message, and follow-up data

## 2. Test Layers

### 2.1 Unit Tests

Use unit tests for:

* classification heuristics and AI fallbacks
* centralized workflow template selection
* status transition guards
* role restrictions
* workflow summary derivation from task steps
* token creation/validation rules
* address-confirmation behaviour
* execution branching by task type

### 2.2 Integration Tests

Use integration tests for:

* webhook ingestion
* task list/detail/update APIs
* address-update public APIs
* execution side effects with a real test DB
* task communication timeline retrieval
* security middleware

### 2.3 Golden Path

Maintain at least one end-to-end integration test for the full address-change flow:

`SMS -> task -> manager action -> secure token -> member confirm -> member updated`

## 3. Current Contract to Test

### 3.1 Task Lifecycle

Tests should assume:

* new tasks start as `PENDING`
* managers/staff can move `PENDING -> ACTIONED`
* managers/admins can move `PENDING -> REJECTED`
* actioned or rejected tasks can be reopened to `PENDING`

Do not write tests against the retired status set:

* `PENDING_REVIEW`
* `APPROVED`
* `AWAITING_MEMBER_ACTION`
* `EXECUTED`

### 3.2 Address-Change Semantics

Tests should reflect the actual flow:

1. task starts `PENDING`
2. staff action it
3. execution creates `MemberActionToken`
4. task returns to `PENDING` while waiting for member confirmation
5. member confirms
6. task becomes `ACTIONED`

### 3.3 Execution Semantics

Tests should reflect the current best-effort execution model:

* actioning a task may trigger execution
* if execution validation fails, the status change is not rolled back
* if secure links are disabled, address automation is skipped and the task stays `ACTIONED`
* order execution can record structured CRM writeback results when usable customer identity exists
* outbound notifications generated during execution are logged back onto the task as outbound `Message` rows for both SMS and email

## 4. High-Value Unit Tests

### 4.1 `triage.service`

Cover:

* address-change classification
* order / booking / operations classification
* feature-flag downgrades through `WinerySettings`
* fallback heuristic behaviour when AI is skipped/unavailable

### 4.1a `taskWorkflowTemplates`

Cover:

* subtype-specific step templates
* category fallback templates
* explicit wait-state ownership like customer wait steps with no owner
* inferred step metadata defaults

### 4.2 `taskService`

Cover:

* manual task creation logs `MANUAL_CREATED`
* valid status transitions
* invalid status transitions are rejected
* staff cannot reject tasks
* staff cannot reassign tasks
* step creation/update/delete sync workflow summary correctly
* actioning triggers execution
* execution failures do not roll back the saved status change
* closed tasks record normalized outcome fields and reopen clears them
* closed tasks create, update, or cancel managed follow-up child tasks when automation rules apply

### 4.2a `services/ai`

Cover:

* test mode uses deterministic mock AI even when `OPENAI_API_KEY` is present
* live adapter is only used in tests when `AI_ALLOW_LIVE_TESTS=true`
* mock AI returns stable classification, reply, and workflow-step suggestions

### 4.3 `execution.service`

Cover:

* address-change tasks create `MemberActionToken`
* address-change tasks are reset to `PENDING` after token creation
* order tasks remain `ACTIONED` and can log `ORDER_WRITEBACK` plus `EXECUTION_RECORDED`
* secure-links-disabled paths skip token creation without blocking unrelated order/booking execution paths
* invalid payloads fail safely
* outbound SMS and email attempts are attached to the task timeline

### 4.4 `memberActionTokenService`

Cover:

* token creation
* token expiry
* not-found handling
* already-used handling
* mark-used semantics

### 4.5 `addressUpdateService`

Cover:

* valid token updates member data
* token is marked used
* linked task becomes `ACTIONED`
* audit entry contains `MEMBER_CONFIRMED_ADDRESS`
* missing address / missing member errors
* external task intake either links, creates, or flags a review-required candidate safely
* winery matching thresholds alter auto-link vs review behavior
* staff can confirm a suggested customer match on an existing task
* actioned external task outcomes enrich the linked member record conservatively
* duplicate customer records can be merged while preserving linked task/message/token history

## 5. High-Value Integration Tests

### 5.1 Webhook Intake

For SMS, email, and voice:

* valid webhook creates inbound `Message`
* valid webhook creates `Task`
* inbound webhook `Message` is linked back to the created task timeline
* webhook-created external tasks follow the shared identity-resolution rules
* valid webhook creates initial workflow steps from AI or template planning
* duplicate provider ID returns a duplicate acknowledgement
* unknown destination errors cleanly

### 5.2 Webhook Security

Cover:

* SMS rejected without Twilio signature
* voice rejected without Twilio signature
* email rejected without signature
* Retell rejected without valid HMAC

### 5.3 Task API

Cover:

* `GET /api/tasks`
* `GET /api/tasks/:id`
* `POST /api/tasks/autoclassify`
* `POST /api/tasks`
* `PATCH /api/tasks/:id`
* `POST /api/tasks/:id/steps`
* `PATCH /api/tasks/:id/steps/:stepId`
* `POST /api/tasks/:id/steps/:stepId/suggestion`
* `POST /api/tasks/:id/steps/:stepId/action`
* `DELETE /api/tasks/:id/steps/:stepId`
* `PATCH /api/tasks/:id/notes/:actionId`

Important assertions:

* winery scoping is enforced
* staff queue scoping is enforced
* `GET /api/tasks/:id` returns linked communication timeline messages
* webhook-created external tasks can land as `AUTO_LINKED`, `AUTO_CREATED`, or `REVIEW_REQUIRED`
* assignment writes `ASSIGNED`
* notes write `NOTE_ADDED`
* actioning writes `ACTIONED`
* rejecting writes `REJECTED`
* outcome changes write `OUTCOME_RECORDED`
* managed follow-up creation and cancellation are visible through `LINKED_TASK` history and child task state
* step edits write `STEP_*` audit events
* step suggestion generation persists draft fields and writes a generated-source step audit event
* step suggestion actioning can send an outbound email message and complete the step

### 5.4 Public Address Update

Cover:

* validate token success
* validate token error cases
* confirm token success
* replay protection
* linked task/member updates

### 5.5 Analytics API

Cover:

* `GET /api/analytics` requires manager/admin auth
* current waiting, blocked, overdue, and due-soon task counts
* average/median resolution timing for closed tasks
* first-response latency from linked inbound/outbound messages
* handoff counts from assignment and step-owner audit actions
* identity-review workload from `payload.manualIntake.identityResolutionStatus`
* follow-up automation generation/completion/cancellation from child tasks

## 6. Golden Path Test

The golden path test should assert:

1. inbound SMS creates a `PENDING` address-change task
2. manager actioning creates a token and leaves the task `PENDING`
3. the public validate endpoint returns current/proposed address state
4. member confirmation updates the member
5. the token is marked used
6. the task ends `ACTIONED`

Recommended audit assertions:

* one staff `ACTIONED`
* one `EXECUTION_TRIGGERED`
* one member-confirmation `ACTIONED`
* final task carries normalized completion outcome fields such as `resolvedAs = COMPLETED`

## 7. Non-Functional Checks

### 7.1 Logging and PII

Where practical, tests should verify that:

* raw tokens are not logged
* logs prefer IDs over full addresses or full message bodies

### 7.2 Pagination and Search

Cover:

* `page` / `pageSize`
* `search`
* `mentionedMe`
* `showOnlyFlagged`
* `actionedById`

### 7.3 Role and Winery Boundaries

Cover:

* missing auth -> `401`
* wrong winery access blocked
* staff restrictions on reject/reassign

## 8. Current Suite Layout

The current repo already contains a mix of unit and integration suites under:

```text
src/tests/unit
src/tests/integration
```

When adding new coverage, keep file names aligned with the existing pattern:

* unit: `*.test.js`
* integration: `*.int.test.js` or existing `*.test.js` under `integration`

## 9. Maintenance Rule

If implementation, docs, and tests disagree, first verify the live backend behaviour in code. Then update docs and tests together so they continue to describe the same contract.

For normal CI and local test runs, prefer deterministic mock AI. Treat live-AI test runs as an explicit opt-in diagnostic path, not the default contract.

### 9.1 Directed Notes

Operational-record integration coverage must verify:

* a Note can target zero, one, or multiple active same-winery users
* cross-winery and inactive recipients are rejected
* area-scoped recipients can view at least one selected area
* `directedToMe=true` includes direct recipients and the authenticated user's department Notes
* the targeted filter never bypasses normal winery or operational-area visibility

## 10. Projects

Projects are a coordination layer over Tasks, Requests, Notices, Notes, and Calendar Events. Project tests must preserve each linked domain's source-of-truth and permission rules.

### 10.1 Project lifecycle and permissions

Cover:

* manager/admin creation, editing, activation, hold, completion, reopening, and cancellation
* activation requiring an eligible owner and target date
* area managers managing only Projects wholly within areas they manage
* staff visibility through organisation scope, area membership, ownership, creation, or explicit participation
* cross-tenant direct reads returning not found
* same-winery active owner and participant validation
* incomplete required work preventing completion unless an explicit override reason is recorded

### 10.2 Linked operational items

Cover all supported Project item types:

* `TASK`
* `REQUEST`
* `NOTICE`
* `NOTE`
* `CALENDAR_EVENT`

Assertions:

* the target belongs to the same winery
* the linking actor can manage the Project and view the target
* required state is accepted only for Tasks
* milestone state is accepted only for Tasks and Calendar Events
* unlinking preserves the source record
* hidden linked items never expose source metadata
* reverse item lookup returns only visible Projects

### 10.3 Progress, health, and attention

Cover:

* only required Tasks contribute to progress
* `Task.workflowState = COMPLETED` counts as complete
* `Task.status = ACTIONED` without completed workflow does not count as complete
* no required Tasks returns null progress
* blocked Task and unresolved dependency detection
* overdue required Tasks and past-target Projects
* pending linked Requests as pending decisions
* upcoming Calendar Events and milestone Tasks
* deterministic next-meaningful-action priority
* health precedence: blocked, overdue, at risk, on track

### 10.4 Dependencies, audit, attachments, and notifications

Cover:

* dependencies require two Tasks linked to the same Project
* self-dependencies and direct/indirect cycles are rejected
* removing Task membership removes affected dependency edges
* every Project mutation writes an immutable ordered Project audit event
* Project attachments inherit Project view/manage authority
* new owners and opted-in participants receive scoped in-app notifications
* routine edits do not broadcast indiscriminately

### 10.5 Scoped Project Lead delegation

Cover:

* only Project governors can appoint, replace, or revoke a lead
* a lead is active, same-winery, different from the accountable owner, and belongs to at least one participating area
* the lead can view and coordinate the open Project across all participating departments
* the lead can edit delivery fields, participants, item roles, dependencies, and files
* the lead cannot change owner, leadership, participating areas, completion, cancellation, reopening, or completion overrides
* closed Projects do not expose delivery-management or Task-delegation actions to their lead
* delegated Task creation rejects non-participating areas, cross-winery/inactive users, and assignees without membership in the receiving area
* successful delegation atomically creates the Task, area placement, `DELEGATED_WORK` Project link, Task audit, Project audit, and notifications
* the Task persists the accountable owner as creator while retaining the lead as audit/delegation actor
* the current lead can view delegated cross-area Tasks but ordinary `REFERENCE` links do not grant child access
* revoking the lead removes cross-area delegated-Task access unless assignee, area, mention, or another existing Task rule independently grants access
* migration up/down covers leadership columns, delegated-link type, indexes, and audit enum rollback cleanup

### 10.6 Personal Project dashboard

Cover:

* `status=open` includes planned, active, and on-hold Projects while excluding completed and cancelled Projects
* `involvement=me` includes ownership, leadership, participant, stakeholder, and delegated-Task assignment relationships
* a Project that is merely visible through manager or area access is not treated as personal involvement
* responses explain the relationship with ordered involvement roles and a delegated Task count
* Home separates active/on-hold Projects from planned Projects and links every card to its permission-checked Project detail
