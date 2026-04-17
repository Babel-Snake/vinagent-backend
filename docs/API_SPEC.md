# API_SPEC.md

This document describes the current HTTP contract exposed by the VinAgent backend. It reflects the live implementation in `src/routes`, `src/controllers`, and `src/services`.

Base path:

* all application APIs are mounted under `/api`

## 1. Conventions

### 1.1 Authentication

Dashboard APIs require:

```http
Authorization: Bearer <firebase-id-token>
```

Public self-service APIs use `MemberActionToken` instead of Firebase auth.

Webhook endpoints use provider-specific signature validation.

### 1.2 Error Shape

Errors are returned as:

```json
{
  "error": {
    "code": "SOME_CODE",
    "message": "Human readable message",
    "details": null,
    "requestId": "req_123"
  }
}
```

## 2. Health

### 2.1 `GET /`

Returns a simple service heartbeat.

### 2.2 `GET /health`

Returns a simple service heartbeat.

### 2.3 `GET /api/health`

Returns:

```json
{
  "status": "ok",
  "timestamp": "2026-04-16T07:00:00.000Z"
}
```

## 3. Webhooks

### 3.1 `POST /api/webhooks/sms`

Consumes a Twilio-style inbound SMS payload.

Required fields:

* `From`
* `To`
* `MessageSid`
* `Body` may be empty

Success response:

```json
{
  "success": true,
  "taskId": 123
}
```

Duplicate webhook response:

```json
{
  "success": true,
  "taskId": null,
  "duplicate": true
}
```

Effects:

* creates an inbound `Message`
* classifies the message
* creates a `Task`
* may create initial `TaskStep` rows from AI/default workflow planning

### 3.2 `POST /api/webhooks/email`

Consumes an email webhook payload.

Required fields:

* `from`
* `to`
* `messageId`
* `subject` and `text` may be empty

Response shape matches SMS:

```json
{
  "success": true,
  "taskId": 123
}
```

### 3.3 `POST /api/webhooks/voice`

Consumes a voice/call webhook payload.

Required fields:

* `From`
* `To`
* `CallSid`
* optional `RecordingUrl`
* optional `TranscriptionText`

Success response:

```json
{
  "success": true,
  "taskId": 123
}
```

### 3.4 `POST /api/webhooks/retell`

Consumes Retell callbacks.

Current implementation acknowledges receipt but does not yet create tasks from Retell-specific events.

Response:

```json
{
  "success": true,
  "received": true
}
```

## 4. Task APIs

These endpoints are mounted at `/api/tasks`.

### 4.1 `GET /api/tasks`

Returns paginated task results for the authenticated winery.

Supported query params:

* `status`
* `type`
* `priority`
* `assignedToMe`
* `category`
* `sentiment`
* `assigneeId`
* `createdById`
* `search`
* `dateFrom`
* `dateTo`
* `sortBy`
* `showOnlyFlagged`
* `mentionedMe`
* `actionedById`
* `page`
* `pageSize`

Role behaviour:

* staff only see tasks assigned to them or unassigned tasks
* managers/admins can query the winery-wide queue

Response:

```json
{
  "tasks": [
    {
      "id": 5001,
      "type": "ACCOUNT_ADDRESS_CHANGE",
      "category": "ACCOUNT",
      "subType": "ACCOUNT_ADDRESS_CHANGE",
      "customerType": "MEMBER",
      "status": "PENDING",
      "workflowState": "WAITING",
      "waitingOn": "CUSTOMER",
      "nextStepSummary": "Await member confirmation",
      "priority": "normal",
      "sentiment": "NEUTRAL",
      "payload": {
        "newAddress": {
          "addressLine1": "12 Oak Street",
          "suburb": "Stirling",
          "state": "SA",
          "postcode": "5152",
          "country": "Australia"
        }
      },
      "suggestedChannel": "sms",
      "suggestedReplyBody": "Hi Emma, please confirm your address update using this secure link: ...",
      "Member": {
        "id": 42,
        "firstName": "Emma",
        "lastName": "Clarke",
        "email": "emma@example.com",
        "phone": "+61412345678"
      },
      "Creator": null,
      "Assignee": {
        "id": 7,
        "displayName": "Mike Manager",
        "email": "manager@example.com",
        "role": "manager"
      },
      "createdAt": "2026-04-16T07:00:00.000Z",
      "updatedAt": "2026-04-16T07:05:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### 4.2 `GET /api/tasks/:id`

Returns a single task with its related member, message, assignee, creator, ordered `TaskStep` list, and recent `TaskAction` history.

Response:

```json
{
  "task": {
    "id": 5001,
    "status": "PENDING",
    "workflowState": "WAITING",
    "waitingOn": "CUSTOMER",
    "nextStepSummary": "Await member confirmation",
    "category": "ACCOUNT",
    "subType": "ACCOUNT_ADDRESS_CHANGE",
    "Member": {
      "id": 42,
      "firstName": "Emma",
      "lastName": "Clarke"
    },
    "TaskSteps": [
      {
        "id": 3001,
        "title": "Await member confirmation",
        "stepType": "CUSTOMER_WAIT",
        "status": "PENDING",
        "waitingOn": "CUSTOMER",
        "sortOrder": 2,
        "ownerUserId": null
      }
    ],
    "TaskActions": [
      {
        "id": 1,
        "actionType": "ACTIONED",
        "details": {
          "changes": {
            "status": "ACTIONED"
          }
        },
        "createdAt": "2026-04-16T07:04:00.000Z"
      },
      {
        "id": 2,
        "actionType": "EXECUTION_TRIGGERED",
        "details": {
          "tokenId": 8001,
          "channel": "sms"
        },
        "createdAt": "2026-04-16T07:04:01.000Z"
      }
    ]
  }
}
```

### 4.3 `POST /api/tasks/autoclassify`

Classifies a free-text staff note into a suggested task structure.

Request:

```json
{
  "text": "The printer is out of ink",
  "memberId": 42
}
```

Response:

```json
{
  "type": "OPERATIONS_SUPPLY_REQUEST",
  "category": "OPERATIONS",
  "subType": "OPERATIONS_SUPPLY_REQUEST",
  "customerType": "MEMBER",
  "priority": "normal",
  "sentiment": "NEUTRAL",
  "status": "PENDING",
  "payload": {
    "summary": "OPERATIONS - OPERATIONS SUPPLY REQUEST",
    "originalText": "The printer is out of ink"
  },
  "suggestedTitle": "OPERATIONS - OPERATIONS SUPPLY REQUEST",
  "suggestedChannel": "sms",
  "suggestedSteps": [
    {
      "title": "Review the request",
      "description": "Confirm what needs to happen and who should own it.",
      "stepType": "INTERNAL",
      "waitingOn": "STAFF",
      "ownerUserId": 7,
      "sortOrder": 0
    }
  ],
  "suggestedAssigneeRole": "manager",
  "suggestedMember": {
    "id": 42,
    "firstName": "Emma",
    "lastName": "Clarke",
    "email": "emma@example.com",
    "phone": "+61412345678"
  }
}
```

### 4.4 `POST /api/tasks`

Manually creates a task.

Request body fields:

* `category` (required)
* `subType` (required)
* `customerType`
* `priority`
* `sentiment`
* `payload`
* `notes`
* `memberId`
* `messageId`
* `assigneeId`
* `parentTaskId`
* `dueAt`
* `resolutionSummary`
* `steps`
* `suggestedReplyBody`
* `suggestedChannel`
* `suggestedReplySubject`
* `suggestedAction`
* `suggestedRecipientEmail`
* `suggestedCc`
* `isPrivateNote`

Response:

```json
{
  "task": {
    "id": 5002,
    "category": "INTERNAL",
    "subType": "INTERNAL_TASK",
    "status": "PENDING"
  }
}
```

Side effects:

* logs `MANUAL_CREATED`
* optionally creates `TaskStep` rows and syncs task workflow summary
* optionally logs `NOTE_ADDED`
* optionally logs `LINKED_TASK`

### 4.5 `PATCH /api/tasks/:id`

Updates a task.

Supported fields:

* `status`
* `priority`
* `category`
* `subType`
* `sentiment`
* `payload`
* `notes`
* `suggestedReplyBody`
* `suggestedChannel`
* `suggestedReplySubject`
* `assigneeId`
* `parentTaskId`
* `dueAt`
* `resolutionSummary`
* `regenerateSuggestedReply`
* `isPrivateNote`

Current status rules:

* `PENDING -> ACTIONED`
* `PENDING -> REJECTED`
* `ACTIONED -> PENDING`
* `REJECTED -> PENDING`

Current role rules:

* staff cannot reject tasks
* staff cannot reassign tasks

Example request:

```json
{
  "status": "ACTIONED",
  "notes": "Reviewed and sent to member for confirmation",
  "suggestedReplyBody": "Hi Emma, please confirm your address using this secure link."
}
```

Response:

```json
{
  "task": {
    "id": 5001,
    "status": "PENDING"
  }
}
```

Important execution behaviour:

* actioning may trigger `execution.service`
* address-change tasks typically come back as `PENDING` because a secure member action is now outstanding
* order tasks generally stay `ACTIONED`
* if execution fails validation, the status change is not rolled back

### 4.6 `POST /api/tasks/:id/steps`

Creates a structured workflow step inside a task.

Supported fields:

* `title` (required)
* `description`
* `stepType`
* `status`
* `waitingOn`
* `ownerUserId`
* `dueAt`
* `sortOrder`
* `blockedReason`
* `completionNotes`
* `metadata`

### 4.7 `PATCH /api/tasks/:id/steps/:stepId`

Updates a workflow step.

Common use cases:

* hand off a step by changing `ownerUserId`
* mark a step `IN_PROGRESS`
* mark a step `BLOCKED` with `blockedReason`
* mark a step `COMPLETED` with `completionNotes`

Role rule:

* staff cannot reassign task steps to a different owner

### 4.8 `DELETE /api/tasks/:id/steps/:stepId`

Deletes a workflow step and re-syncs task workflow summary.

### 4.9 `PATCH /api/tasks/:id/notes/:actionId`

Toggles note privacy for a `NOTE_ADDED` audit entry.

Request:

```json
{
  "isPrivate": true
}
```

Response:

```json
{
  "action": {
    "id": 91,
    "actionType": "NOTE_ADDED",
    "details": {
      "note": "Call member again tomorrow",
      "isPrivate": true
    }
  }
}
```

## 5. Public Address Update APIs

Mounted under `/api/public`.

### 5.1 `GET /api/public/address-update/validate?token=...`

Validates a token and returns current/proposed address data.

Response:

```json
{
  "member": {
    "id": 42,
    "firstName": "Emma",
    "lastName": "Clarke"
  },
  "currentAddress": {
    "addressLine1": "5 River Road",
    "addressLine2": null,
    "suburb": "Crafers",
    "state": "SA",
    "postcode": "5152",
    "country": "Australia"
  },
  "proposedAddress": {
    "addressLine1": "12 Oak Street",
    "suburb": "Stirling",
    "state": "SA",
    "postcode": "5152",
    "country": "Australia"
  },
  "expiresAt": "2026-04-23T07:00:00.000Z"
}
```

Error cases:

* missing token -> `INVALID_TOKEN`
* unknown token -> `TOKEN_NOT_FOUND`
* expired token -> `TOKEN_EXPIRED`
* already used token -> `TOKEN_ALREADY_USED`

### 5.2 `POST /api/public/address-update/confirm`

Confirms and applies the address change.

Request:

```json
{
  "token": "opaque-token",
  "newAddress": {
    "addressLine1": "12 Oak Street",
    "suburb": "Stirling",
    "state": "SA",
    "postcode": "5152",
    "country": "Australia"
  }
}
```

Response:

```json
{
  "status": "ok",
  "message": "Address updated successfully",
  "member": {
    "id": 42,
    "firstName": "Emma",
    "lastName": "Clarke"
  },
  "newAddress": {
    "addressLine1": "12 Oak Street",
    "suburb": "Stirling",
    "state": "SA",
    "postcode": "5152",
    "country": "Australia"
  }
}
```

Side effects:

* updates `Member`
* sets `MemberActionToken.usedAt`
* sets linked `Task.status` to `ACTIONED`
* writes `TaskAction(ACTIONED)` with `details.action = MEMBER_CONFIRMED_ADDRESS`

## 6. Winery APIs

Mounted under `/api/winery`.

All current winery endpoints require manager/admin auth.

### 6.1 `GET /api/winery/full`

Returns:

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Sunrise Ridge Winery",
    "brandProfile": {},
    "bookingsConfig": {},
    "products": [],
    "policyProfile": {},
    "faqs": [],
    "sops": [],
    "integrationConfig": {},
    "contacts": []
  }
}
```

### 6.2 Section updates

Current update endpoints:

* `PUT /api/winery`
* `PUT /api/winery/brand`
* `PUT /api/winery/bookings-config`
* `PUT /api/winery/policy-profile`
* `PUT /api/winery/integration-config`

All return:

```json
{
  "success": true,
  "data": {}
}
```

### 6.3 CRUD sub-resources

Currently exposed:

* `POST /api/winery/products`
* `DELETE /api/winery/products/:id`
* `POST /api/winery/bookings/types`
* `DELETE /api/winery/bookings/types/:id`
* `POST /api/winery/faqs`
* `DELETE /api/winery/faqs/:id`
* `POST /api/winery/sops`
* `PUT /api/winery/sops/:id`
* `DELETE /api/winery/sops/:id`
* `POST /api/winery/contacts`
* `PUT /api/winery/contacts/:id`
* `DELETE /api/winery/contacts/:id`

## 7. Notes on Truth

The task lifecycle in the current implementation is not the older `APPROVED / EXECUTED / AWAITING_MEMBER_ACTION` model. If you are updating clients, tests, or docs, use the current `PENDING / ACTIONED / REJECTED` contract plus audit events and tokens as the authoritative model.
