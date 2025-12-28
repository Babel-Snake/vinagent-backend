# Audit Logging Schema

This document describes the Audit Trail logic used to track state changes and actor operations within the VinAgent backend.

## Architecture

The system uses a dedicated `TaskAction` model (Table: `TaskActions`) to record immutable history of operations on Tasks.

- **Service**: `src/services/audit.service.js`
- **Database Model**: `src/models/TaskAction.js`
- **Primary Consumers**: `src/services/taskService.js`, `src/services/execution.service.js`

## Schema

| Field        | Type        | Description                                                                 |
|--------------|-------------|-----------------------------------------------------------------------------|
| `id`         | Integer     | Primary Key                                                                 |
| `taskId`     | Integer     | FK to Task                                                                  |
| `userId`     | Integer     | FK to User (Actor). Null for System/AI actions.                             |
| `actionType` | ENUM        | The type of event (see below).                                              |
| `details`    | JSON        | Variable payload containing diffs, snapshots, or metadata.                  |
| `createdAt`  | Timestamp   | When the action occurred.                                                   |

### Action Types

| Action Type           | Description                                      | `details` Structure Example                                |
|-----------------------|--------------------------------------------------|------------------------------------------------------------|
| `MANUAL_CREATED`      | User manually created a task.                    | `{ "notes": "...", "originalText": "..." }`                |
| `MANUAL_UPDATE`       | User updated fields (except status approval).    | `{ "changes": { "priority": "high" }, "oldValues": {...} }`|
| `APPROVED`            | User approved the task for execution.            | `{ "changes": { "status": "APPROVED" }, "oldValues": ... }`|
| `REJECTED`            | User rejected the task.                          | `{ "changes": { "status": "REJECTED" }, "oldValues": ... }`|
| `EXECUTION_TRIGGERED` | System started execution (e.g. DB update).       | `{ "service": "MemberService" }`                           |
| `EXECUTED`            | Execution completed successfully.                | `{ "result": "Members updated: 1" }`                       |
| `NOTE_ADDED`          | User added a note without changing fields.       | `{ "note": "Called member to confirm." }`                  |
| `ASSIGNED`            | Task assignee changed.                           | `{ "from": 12, "to": 45 }`                                 |
| `LINKED_TASK`         | Task linked to a parent/child.                   | `{ "parentTaskId": 101, "childTaskId": 105 }`              |

## Usage

### Recording an Action

Use the `auditService` to ensure consistent logging.

```javascript
const auditService = require('../services/audit.service');

await auditService.logTaskAction({
    transaction: t,
    taskId: 123,
    userId: req.user.id,
    actionType: 'MANUAL_UPDATE',
    details: { changes: { status: 'IN_PROGRESS' } }
});
```

### Viewing Audit Logs

Audit logs are generally viewed via the Task Detail API (`GET /api/tasks/:id`), which includes `TaskActions`.
