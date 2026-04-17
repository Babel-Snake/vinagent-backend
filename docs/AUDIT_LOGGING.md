# AUDIT_LOGGING.md

This document describes the current task audit trail used by the live VinAgent backend.

## 1. Storage Model

Audit events are stored in the `TaskActions` table through the `TaskAction` Sequelize model.

Primary code paths:

* `src/services/audit.service.js`
* `src/services/taskService.js`
* `src/services/execution.service.js`
* `src/services/addressUpdateService.js`

## 2. Schema

| Field | Type | Purpose |
| --- | --- | --- |
| `id` | integer | primary key |
| `taskId` | integer | linked task |
| `userId` | integer nullable | actor, or `null` for system/member-driven actions |
| `actionType` | enum | audit event type |
| `details` | json nullable | event metadata |
| `createdAt` | timestamp | event time |

## 3. Current Enum

The model currently allows these `actionType` values:

* `CREATED`
* `ACTIONED`
* `REJECTED`
* `EXECUTION_TRIGGERED`
* `UPDATED_PAYLOAD`
* `NOTE_ADDED`
* `MANUAL_CREATED`
* `MANUAL_UPDATE`
* `ASSIGNED`
* `LINKED_TASK`
* `STEP_CREATED`
* `STEP_UPDATED`
* `STEP_COMPLETED`
* `STEP_DELETED`

## 4. What the Live App Actually Emits

The current implementation most commonly emits:

* `CREATED`
* `MANUAL_CREATED`
* `MANUAL_UPDATE`
* `ACTIONED`
* `REJECTED`
* `EXECUTION_TRIGGERED`
* `NOTE_ADDED`
* `ASSIGNED`
* `LINKED_TASK`
* `STEP_CREATED`
* `STEP_UPDATED`
* `STEP_COMPLETED`
* `STEP_DELETED`

Important nuance:

* webhook-created tasks now emit `CREATED` through the shared task service path
* `MANUAL_CREATED` is reserved for dashboard-created tasks

## 5. Event Semantics

### `MANUAL_CREATED`

Used when a staff user creates a task manually via `POST /api/tasks`.

### `CREATED`

Used when a system/webhook path creates a task through the shared task service.

Typical details:

```json
{
  "notes": "Customer is upset",
  "originalText": "Call from Emma about delivery"
}
```

### `MANUAL_UPDATE`

Used for non-status task edits such as payload, priority, sentiment, or suggestion changes.

Typical details:

```json
{
  "changes": {
    "priority": "high"
  },
  "oldValues": {
    "priority": "normal"
  }
}
```

### `ACTIONED`

Used for several successful workflow steps.

Examples:

* a staff user actioning a task
* booking creation success
* order-stub execution success
* member-confirmed address update

To tell these apart, inspect `details`.

Examples:

```json
{
  "changes": {
    "status": "ACTIONED"
  },
  "oldValues": {
    "status": "PENDING"
  }
}
```

```json
{
  "action": "ORDER_UPDATE_STUB",
  "note": "Simulated execution"
}
```

```json
{
  "action": "MEMBER_CONFIRMED_ADDRESS",
  "tokenId": 8001
}
```

### `REJECTED`

Used when a task is explicitly rejected.

### `EXECUTION_TRIGGERED`

Used when actioning a task launches a deferred or token-based execution path.

Common current example:

```json
{
  "tokenId": 8001,
  "channel": "sms"
}
```

### `NOTE_ADDED`

Used for task notes. Notes may also carry:

* `isPrivate: true`

### `ASSIGNED`

Used when the assignee changes.

Typical details:

```json
{
  "from": 12,
  "to": 45
}
```

### `LINKED_TASK`

Used when parent/child task relationships change.

### `STEP_CREATED`

Used when a structured workflow step is added to a task.

### `STEP_UPDATED`

Used when a workflow step changes without being completed or deleted.

### `STEP_COMPLETED`

Used when a workflow step is completed.

### `STEP_DELETED`

Used when a workflow step is removed from a task.

## 6. Why Audit Matters More Than Status

The current task status model is coarse:

* `PENDING`
* `ACTIONED`
* `REJECTED`

Because of that, you should treat `TaskAction` as the detailed workflow history.

Example:

An address-change task can be:

* actioned by staff
* moved back to `PENDING`
* sent to the member for confirmation
* later marked `ACTIONED` again by member confirmation

Without the audit trail, those steps are ambiguous.

That same rule now applies to structured workflow planning:

* `TaskStep` shows the current plan
* `TaskAction` shows how the plan changed over time

## 7. Usage Guidance

When adding new workflow behaviour:

* prefer adding or enriching audit events rather than exploding the task status enum
* prefer structured step events over burying workflow changes in notes alone
* keep `details` structured and machine-readable
* do not store raw tokens in `details`
* avoid storing unnecessary PII such as full message bodies

If a UI, report, or test needs to know what really happened, read the task plus its `TaskAction` history together.
