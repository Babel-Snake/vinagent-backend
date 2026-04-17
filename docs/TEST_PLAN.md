# TEST_PLAN.md

This document describes the current testing strategy for the live VinAgent backend.

It is aligned to the current implementation, which uses:

* task statuses: `PENDING`, `ACTIONED`, `REJECTED`
* task workflow summary fields on `Task`
* `TaskStep` for structured progress
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

### 4.2a `services/ai`

Cover:

* test mode uses deterministic mock AI even when `OPENAI_API_KEY` is present
* live adapter is only used in tests when `AI_ALLOW_LIVE_TESTS=true`
* mock AI returns stable classification, reply, and workflow-step suggestions

### 4.3 `execution.service`

Cover:

* address-change tasks create `MemberActionToken`
* address-change tasks are reset to `PENDING` after token creation
* order tasks remain `ACTIONED` and log `ORDER_UPDATE_STUB`
* secure-links-disabled paths skip token creation
* invalid payloads fail safely

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

## 5. High-Value Integration Tests

### 5.1 Webhook Intake

For SMS, email, and voice:

* valid webhook creates inbound `Message`
* valid webhook creates `Task`
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
* `DELETE /api/tasks/:id/steps/:stepId`
* `PATCH /api/tasks/:id/notes/:actionId`

Important assertions:

* winery scoping is enforced
* staff queue scoping is enforced
* assignment writes `ASSIGNED`
* notes write `NOTE_ADDED`
* actioning writes `ACTIONED`
* rejecting writes `REJECTED`
* step edits write `STEP_*` audit events

### 5.4 Public Address Update

Cover:

* validate token success
* validate token error cases
* confirm token success
* replay protection
* linked task/member updates

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
