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

The backend also accepts valid PIN session bearer tokens for supported staff/PIN flows. Firebase-backed users must exist in the local VinAgent database and must be active; inactive users receive `403 ACCESS_DENIED`.

Public self-service APIs use `MemberActionToken` instead of Firebase auth.

Webhook endpoints use provider-specific signature validation. Retell HMAC verification uses the exact raw request body captured by the Express parser, the signed millisecond timestamp, and a five-minute freshness window.

### 1.2 Current User Profile

These endpoints are mounted under `/api/public` but require Firebase dashboard authentication.

#### `GET /api/public/me`

Returns the authenticated user's VinAgent profile context, including role, display name, email, winery scope, and winery name where available.

#### `PATCH /api/public/me`

Updates the authenticated user's display name in both the VinAgent database and Firebase.

Request:

```json
{
  "displayName": "Alex Manager"
}
```

Response:

```json
{
  "user": {
    "id": 7,
    "email": "alex@example.com",
    "displayName": "Alex Manager",
    "role": "manager",
    "wineryId": 1,
    "wineryName": "Sunrise Ridge Winery"
  }
}
```

Password reset behaviour:

* standard email-backed users reset passwords through Firebase password reset email from the frontend profile settings modal
* internal staff accounts ending in `@vinagent.internal` do not use email reset; manager/admin users reset their access codes through the Staff API

### 1.3 Error Shape

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

### 2.2 `GET /health/live` (`GET /health` compatibility alias)

Returns a dependency-free process heartbeat. A successful response does not
mean that the database, migrations, or attachment storage are ready.

### 2.3 `GET /health/ready`

Returns HTTP `200` only when all production readiness checks pass. It returns
HTTP `503` with bounded check codes while the database is unavailable,
migrations are not current, attachment storage is unsafe, configuration is
invalid, or the server is draining. This is the authoritative container and
load-balancer readiness endpoint.

### 2.4 `GET /api/health`

Legacy liveness compatibility alias. It is not a readiness check. Returns:

```json
{
  "status": "ok",
  "type": "liveness",
  "readiness": "/health/ready"
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
* links the inbound `Message` onto the task communication timeline
* runs shared external identity resolution before and during task creation
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

Identity notes for SMS, email, and voice webhook intake:

* exact or strong matches can auto-link to an existing member
* weak matches can persist `payload.manualIntake.identityResolutionStatus = REVIEW_REQUIRED` plus ranked `suggestedCandidates`
* unresolved order, booking, and account webhook tasks may auto-create a member during final task creation when enough contact identity exists

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

Retell signatures are validated with `x-retell-signature` in Retell's current `v=<unix-ms>,d=<hex-digest>` format. The digest is HMAC-SHA256 over the exact raw request body concatenated with `v`, using `RETELL_API_KEY` (or the legacy `RETELL_WEBHOOK_SECRET` fallback). Timestamps outside five minutes of server time are rejected.

```text
POST /api/webhooks/retell
```

The client does not select a winery. Route parameters, query values, body-level winery IDs, Retell metadata, and dynamic variables are not tenant-routing inputs. The server matches the signed Retell `call.agent_id` to an operations-managed `providerConnections.retell` entry in a winery or area integration config. No match or a match spanning multiple wineries is rejected.

`call_analyzed` callbacks are stored as reviewable `IntegrationEvent` records:

* `provider`: `retell`
* `intakeMethod`: `webhook`
* `eventType`: `call.intake`
* `status`: `PENDING_REVIEW`

Transient callbacks such as `call_started` are acknowledged but skipped so the manager review queue is not flooded.

Response:

```json
{
  "success": true,
  "received": true,
  "duplicate": false,
  "event": {
    "id": 42,
    "provider": "retell",
    "eventType": "call.intake",
    "status": "PENDING_REVIEW"
  }
}
```

### 3.5 Authenticated Integration Event Intake

Generic integration intake and review endpoints are mounted under `/api/integration-events`. These routes require dashboard authentication and manager/admin role.

Currently exposed:

* `GET /api/integration-events`
* `POST /api/integration-events`
* `GET /api/integration-events/:id`
* `POST /api/integration-events/:id/review`

`POST /api/integration-events` stores a redacted raw payload, creates a normalized payload, and deduplicates by `wineryId + provider + externalEventId` when an external ID is supplied.

Supported MVP `eventType` values:

* `call.intake`
* `notice.imported`
* `task.suggested`
* `message.imported`
* `file.imported`
* `unknown.received`

Review actions:

* `publish_notice`: creates a normal VinAgent notice with external source metadata and optional `taskIds` links
* `create_task`: creates a draft task from a call intake or generic event
* `link_task`: links the event to an existing task by `taskId`
* `create_items`: atomically creates or links up to 10 typed `TASK`, `NOTICE`, `REQUEST`, or `NOTE` items
* `ignore`
* `archive`

`create_items` accepts an `items` array. Each entry has a unique optional `key`, a `type`, `mode: CREATE | LINK`, an `itemId` for link mode, and type-specific `data` for create mode. If any entry fails, the entire batch rolls back. Repeating a successfully processed batch returns its existing links with `duplicate: true` rather than creating more records.

Integration-event responses expose all results as `linkedItems` / `LinkedItems`. The legacy singular related-record fields remain populated with the first result for older clients.

See `docs/INTEGRATION_INTAKE.md` for normalized payload examples and rollout guidance.

### 3.6 Signed Generic Integration Webhook

`POST /api/webhooks/integration/:wineryId/:domain`

Accepts signed third-party handoff payloads and creates reviewable `IntegrationEvent` records. The `domain` must match one configured integration domain: `crm`, `booking`, `pos`, `delivery`, `sms`, or `email`.

Required headers:

* `x-vinagent-webhook-secret`: the shared secret configured for that winery/domain
* `x-vinagent-webhook-timestamp`: the current Unix timestamp in seconds; the allowed clock skew is five minutes
* `x-vinagent-webhook-signature`: HMAC-SHA256 of `<timestamp>.<exact raw request body>` using the same shared secret. The value may be either `<hex>` or `sha256=<hex>`.

The API stores only a SHA-256 hash of the shared secret in `WineryIntegrationConfig.providerConnections.<domain>.webhookSecretHash`; the hash and raw secret are never returned by dashboard APIs.

Signed webhook payloads must include a stable `externalEventId`. The timestamp window limits captured-request replay, while the unique `wineryId + provider + externalEventId` key makes accepted retries idempotent.

Example payload:

```json
{
  "provider": "zapier",
  "eventType": "notice.imported",
  "externalEventId": "zapier-notice-1",
  "rawPayload": {
    "title": "Distributor pickup changed",
    "body": "Pickup moved to Friday morning.",
    "posted_by": "Ops automation"
  }
}
```

New event response:

```json
{
  "success": true,
  "duplicate": false,
  "event": {
    "id": 42,
    "provider": "zapier",
    "eventType": "notice.imported",
    "status": "PENDING_REVIEW"
  }
}
```

Duplicate external IDs return `200` with `duplicate: true`.

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

Search semantics:

* `search` matches task classification fields
* `search` also matches linked member fields, note text, payload text, and linked message subject/body

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
      "resolvedAs": null,
      "resolutionType": null,
      "customerOutcome": null,
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

### 4.2 `GET /api/tasks/summary`

Returns exact queue-wide counts for the same visibility scope and filters accepted by `GET /api/tasks`, excluding pagination controls. This allows list surfaces to display totals without treating a capped page of results as a complete queue.

Response:

```json
{
  "summary": {
    "matching": 42,
    "highPriority": 7,
    "waiting": 4,
    "blocked": 2,
    "unassigned": 5,
    "overdue": 3,
    "dueSoon": 6,
    "identityReview": 1,
    "followUps": 8
  }
}
```

### 4.3 `GET /api/tasks/:id`

Returns a single task with its related member, primary originating message, full linked `Messages` timeline, assignee, creator, ordered `TaskStep` list, recent `TaskAction` history, optional `ParentTask`, and linked `SubTasks`.

Response:

```json
{
  "task": {
    "id": 5001,
    "status": "PENDING",
    "workflowState": "WAITING",
    "waitingOn": "CUSTOMER",
    "nextStepSummary": "Await member confirmation",
    "resolvedAs": null,
    "resolutionType": null,
    "customerOutcome": null,
    "followUpRequired": false,
    "category": "ACCOUNT",
    "subType": "ACCOUNT_ADDRESS_CHANGE",
    "Member": {
      "id": 42,
      "firstName": "Emma",
      "lastName": "Clarke"
    },
    "Messages": [
      {
        "id": 7001,
        "source": "sms",
        "direction": "inbound",
        "body": "I need to update my address",
        "receivedAt": "2026-04-16T07:00:00.000Z"
      },
      {
        "id": 7002,
        "source": "sms",
        "direction": "outbound",
        "body": "Hi Emma, please confirm your address update using this secure link: ...",
        "receivedAt": "2026-04-16T07:04:01.000Z"
      }
    ],
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
    ],
    "ParentTask": null,
    "SubTasks": [
      {
        "id": 5002,
        "status": "PENDING",
        "workflowState": "NOT_STARTED",
        "subType": "GENERAL_FOLLOW_UP",
        "dueAt": "2026-04-17T07:00:00.000Z",
        "payload": {
          "summary": "Call Emma back if she has not confirmed the address update.",
          "followUpAutomation": {
            "isAutoGenerated": true,
            "sourceTaskId": 5001,
            "automationType": "EXPLICIT_FOLLOW_UP"
          }
        }
      }
    ]
  }
}
```

Notes:

* `Messages` is the chronological case communication timeline used by the UI and AI drafting path
* outbound notifications generated during execution are persisted as outbound `Message` rows on the same task
* `ParentTask` and `SubTasks` let the UI render managed follow-up chains without separate lookup calls

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
* `taskOrigin`
* `inboundMethod`
* `requesterName`
* `requesterEmail`
* `requesterPhone`
* `priority`
* `sentiment`
* `payload`
* `notes`
* `memberId`
* `messageId`
* `assigneeId`
* `parentTaskId`
* `dueAt`
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
    "category": "ORDER",
    "subType": "ORDER_STATUS",
    "status": "PENDING",
    "memberId": null,
    "payload": {
      "manualIntake": {
        "taskOrigin": "EXTERNAL",
        "inboundMethod": "phone",
        "requesterName": "Chris Prospect",
        "requesterPhone": "+61411122333",
        "identityResolutionStatus": "REVIEW_REQUIRED",
        "identityConfidence": "LOW",
        "memberAutoLinked": false,
        "suggestedCandidates": [
          {
            "memberId": 42,
            "label": "Chris Prospect",
            "confidence": "LOW",
            "reason": "review:phone_suffix+first_name_exact",
            "score": 150,
            "email": "chris@example.com",
            "phone": "+61411122333"
          }
        ],
        "suggestedMemberId": 42,
        "suggestedMemberLabel": "Chris Prospect",
        "suggestedMemberReason": "review:phone_suffix+first_name_exact"
      }
    }
  }
}
```

Side effects:

* logs `MANUAL_CREATED`
* optionally creates `TaskStep` rows and syncs task workflow summary
* optionally logs `NOTE_ADDED`
* optionally logs `LINKED_TASK`
* for external tasks, normalizes intake identity data into `payload.manualIntake`
* may auto-link a member on high-confidence match
* may leave the task unlinked with `identityResolutionStatus = REVIEW_REQUIRED`
* may include multiple ranked `suggestedCandidates` for staff review
* may create a new member for booking/order/account intake when no safe match exists

### 4.5 `PATCH /api/tasks/:id`

Updates a task.

Supported fields:

* `status`
* `priority`
* `category`
* `subType`
* `sentiment`
* `memberId`
* `payload`
* `notes`
* `suggestedReplyBody`
* `suggestedChannel`
* `suggestedReplySubject`
* `assigneeId`
* `parentTaskId`
* `dueAt`
* `resolvedAs`
* `resolutionType`
* `customerOutcome`
* `resolutionSummary`
* `followUpRequired`
* `followUpDueAt`
* `followUpSummary`
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

Outcome rule:

* structured outcome fields can only be recorded on tasks that end in `ACTIONED` or `REJECTED`
* reopening a task back to `PENDING` clears the structured closure fields

Example request:

```json
{
  "status": "ACTIONED",
  "resolvedAs": "COMPLETED",
  "resolutionType": "REPLIED",
  "customerOutcome": "INFO_PROVIDED",
  "resolutionSummary": "Answered the enquiry and confirmed the next order window.",
  "followUpRequired": true,
  "followUpDueAt": "2026-04-21T09:00:00.000Z",
  "followUpSummary": "Call if the member has not replied by tomorrow afternoon.",
  "notes": "Reviewed and sent to member for confirmation",
  "suggestedReplyBody": "Hi Emma, please confirm your address using this secure link."
}
```

Response:

```json
{
  "task": {
    "id": 5001,
    "status": "ACTIONED",
    "resolvedAs": "COMPLETED",
    "resolutionType": "REPLIED",
    "customerOutcome": "INFO_PROVIDED",
    "followUpRequired": true
  }
}
```

Important execution behaviour:

* actioning may trigger `execution.service`
* address-change tasks typically come back as `PENDING` because a secure member action is now outstanding
* order tasks generally stay `ACTIONED` and can persist `payload.orderWriteback` plus structured `payload.executionResults`
* tasks that end closed now also record normalized closure fields and emit `OUTCOME_RECORDED` audit entries when those fields change
* if execution fails validation, the status change is not rolled back
* actioning external booking/order/account/general tasks may enrich the linked member record with stronger tags and contact history
* successful or skipped provider-side execution outcomes are captured through `EXECUTION_RECORDED` audit events
* when a closed task explicitly requires follow-up, closes on customer no response, or closes as an escalation, the backend may create or update a managed child follow-up task
* reopening the parent task, or clearing the follow-up need, cancels the pending managed child follow-up task instead of leaving stale queue items behind
* newly created managed follow-up tasks can emit a `SYSTEM` notification to the assignee

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
* `suggestedAction`
* `suggestedChannel`
* `suggestedRecipientEmail`
* `suggestedCc`
* `suggestedReplySubject`
* `suggestedReplyBody`
* `suggestionStatus`

### 4.7 `PATCH /api/tasks/:id/steps/:stepId`

Updates a workflow step.

Common use cases:

* hand off a step by changing `ownerUserId`
* mark a step `IN_PROGRESS`
* mark a step `BLOCKED` with `blockedReason`
* mark a step `COMPLETED` with `completionNotes`

Role rule:

* staff cannot reassign task steps to a different owner

### 4.8 `POST /api/tasks/:id/steps/:stepId/suggestion`

Generates and saves an AI draft for one workflow step.

Request:

```json
{
  "force": true
}
```

Response:

```json
{
  "step": {
    "id": 42,
    "suggestedChannel": "email",
    "suggestedRecipientEmail": "guest@example.com",
    "suggestedReplySubject": "Update: Reply to customer",
    "suggestedReplyBody": "Thanks for reaching out...",
    "suggestedAction": "Review and send the suggested email response, then complete the workflow step: Reply to customer.",
    "suggestionStatus": "DRAFT"
  }
}
```

### 4.9 `POST /api/tasks/:id/steps/:stepId/action`

Actions the current edited suggestion for a workflow step.

Request:

```json
{
  "suggestedChannel": "email",
  "suggestedRecipientEmail": "guest@example.com",
  "suggestedCc": "manager@example.com",
  "suggestedReplySubject": "Update from the winery",
  "suggestedReplyBody": "Thanks for your note. We are looking into this now.",
  "completeStep": true
}
```

Behaviour:

* `email` and `sms` send through the notification service and record an outbound `Message`
* `none` records the step as internally actioned without sending externally
* `voice` can be saved as a draft but cannot be directly actioned yet
* when `completeStep` is true, the step is marked `COMPLETED`

### 4.10 `DELETE /api/tasks/:id/steps/:stepId`

Deletes a workflow step and re-syncs task workflow summary.

### 4.11 `PATCH /api/tasks/:id/notes/:actionId`

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

### 4.12 Notice links

Manager/admin only:

* `POST /api/tasks/:id/notices`
* `DELETE /api/tasks/:id/notices/:noticeId`

`POST /api/tasks/:id/notices` accepts:

```json
{
  "noticeId": 10
}
```

These endpoints create or remove the task-to-notice relationship used by task detail and noticeboard views.

### 4.13 Task flags

Mounted under `/api/tasks/flags`.

* `GET /api/tasks/flags`
* `POST /api/tasks/flags/:taskId/toggle`

Flags are scoped to the authenticated user and winery.

## 5. Public And PIN APIs

Mounted under `/api/public`.

### 5.1 `GET /api/public/resolve-staff?username=...`

Resolves a staff login username for the PIN/staff login flow.

The username is immutable and resolved only within the server-controlled deployment winery. The response contains the managed Firebase login identity used by the browser; callers cannot supply or change the winery scope.

This route is public by design and has an endpoint-specific per-IP limiter
(`RESOLVE_STAFF_RATE_LIMIT_MAX`, default `20` per 15 minutes) in addition to
the global API limiter.

### 5.2 `GET /api/public/pin-config`

Returns the public PIN-login configuration for the server-controlled deployment winery. `DEPLOYMENT_WINERY_ID` is required in production and constrains every Firebase, access-code, and PIN login to that winery. The exactly-one-winery fallback is for local development only.

### 5.3 `POST /api/public/pin-login`

Authenticates a staff PIN/access code and returns a short-lived PIN session token.

Request:

```json
{
  "pin": "4821"
}
```

Client-supplied winery IDs are not used. Response includes the authenticated user context, token expiry, and idle timeout.

### 5.4 `POST /api/public/address-update/validate`

Validates a member action token and returns the context needed by the public
confirmation page. `POST` is preferred so the bearer value does not appear in
reverse-proxy URLs or access logs.

Request:

```json
{
  "token": "<opaque-token>"
}
```

`GET /api/public/address-update/validate?token=...` remains available only for
compatibility with previously issued clients. New clients should not use it.
Successful validation and confirmation responses set `Cache-Control: no-store,
private` because they contain or act on member data.

Response:

```json
{
  "member": {
    "firstName": "Emma"
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

### 5.5 `POST /api/public/address-update/confirm`

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
  "message": "Address updated successfully"
}
```

The response intentionally omits member identifiers and address data. The
customer has already reviewed those fields, and returning them after the token
is consumed would add no value.

Side effects:

* updates `Member`
* sets `MemberActionToken.usedAt`
* sets linked `Task.status` to `ACTIONED`
* writes `TaskAction(ACTIONED)` with `details.action = MEMBER_CONFIRMED_ADDRESS`

## 6. Winery APIs

Mounted under `/api/winery`.

Winery-wide writes require winery `manager/admin` authority. Area managers may read the full non-secret configuration and update profiles, booking rules, and booking types only for areas where their membership role is `MANAGER`.

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
    "contacts": [],
    "OperationalAreas": [],
    "configurationAccess": {
      "isGlobalManager": false,
      "managedAreaIds": [3]
    }
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
* `POST /api/winery/integration-config/test`
* `POST /api/winery/integration-config/email/sync`
* `PUT /api/winery/settings`

Area-owned updates:

* `PUT /api/winery/areas/:areaId/profile`
* `PUT /api/winery/areas/:areaId/bookings-config`
* `PUT /api/winery/areas/:areaId/products/:productId`
* `DELETE /api/winery/areas/:areaId/products/:productId`
* `PUT /api/winery/areas/:areaId/integration-config`
* `DELETE /api/winery/areas/:areaId/integration-config/:domain`
* `POST /api/winery/areas/:areaId/integration-config/test`

An area profile accepts `publicEmail`, `publicPhone`, `openingHoursText`, `guestDirections`, and `serviceNotes`. Area booking configuration uses the existing booking-rule fields. Area managers may update only managed areas; winery managers may update any active area.

Area product listings reference the shared winery catalogue and accept `isAvailable`, nullable `priceOverride`, nullable `stockStatusOverride`, `isFeatured`, and `salesNotes`. Removing a listing does not delete the canonical winery product.

FAQs and SOPs use the existing `/api/winery/faqs` and `/api/winery/sops` CRUD endpoints. Creation accepts nullable `areaId`: `null` creates shared winery knowledge, while an area ID creates area-owned knowledge. Existing records remain shared after migration. Ownership is immutable through update endpoints. Area managers may manage records owned by their areas; shared records require a winery manager.

Area integration configuration supports `booking`, `pos`, `crm`, and `delivery` connections. Each supplied connection uses the existing provider-connection fields. Missing domains inherit the winery-level connection. Deleting a domain removes only its area override. Area managers may change/test only managed areas; winery managers may manage every area. Responses and `GET /api/winery/full` never expose webhook secret hashes.

An area-specific signed intake endpoint is available at `POST /api/webhooks/integration/:wineryId/:domain/:areaId`. It uses that area's connection secret and creates an integration event with the area as a rule-based suggestion. The existing endpoint without `:areaId` remains the winery-level fallback.

All return:

```json
{
  "success": true,
  "data": {}
}
```

`PUT /api/winery/settings` currently supports:

```json
{
  "identityMatchingConfig": {
    "autoLinkThreshold": 180,
    "reviewThreshold": 120,
    "maxReviewCandidates": 3,
    "allowPhoneSuffixNameAutoLink": true,
    "allowNameOnlyReview": true
  }
}
```

These values control how aggressively the backend links inbound contacts to existing customers versus surfacing them for review.

`POST /api/winery/integration-config/email/sync` manually syncs the configured Outlook inbox for the winery.

Request:

```json
{
  "limit": 25
}
```

Response:

```json
{
  "success": true,
  "data": {
    "provider": "outlook",
    "mailboxAddress": "cellardoor@example.com",
    "folderId": "inbox",
    "fetched": 10,
    "imported": 8,
    "duplicates": 2,
    "createdTasks": 8,
    "syncedAt": "2026-05-01T07:00:00.000Z",
    "lastMessageReceivedAt": "2026-05-01T06:55:00.000Z"
  }
}
```

Current limitations:

* only Outlook / Microsoft 365 inbox sync is implemented
* `providerConnections.email.externalAccountId` should contain the mailbox address
* `providerConnections.email.externalLocationId` can override the folder and defaults to `inbox`

### 6.3 CRUD sub-resources

Currently exposed:

* `POST /api/winery/products`
* `PUT /api/winery/products/:id`
* `DELETE /api/winery/products/:id`
* `POST /api/winery/bookings/types`
* `PUT /api/winery/bookings/types/:id`
* `DELETE /api/winery/bookings/types/:id`
* `POST /api/winery/faqs`
* `PUT /api/winery/faqs/:id`
* `DELETE /api/winery/faqs/:id`
* `POST /api/winery/sops`
* `PUT /api/winery/sops/:id`
* `DELETE /api/winery/sops/:id`
* `POST /api/winery/contacts`
* `PUT /api/winery/contacts/:id`
* `DELETE /api/winery/contacts/:id`

Contact create/update payloads support `primaryAreaId` and `linkedAreaIds`. No primary area means an organisation-wide contact and requires a winery manager. Area managers may create contacts only within areas they manage and may edit/delete contacts whose primary area they manage. Existing cross-area links do not prevent the primary-area manager from updating contact details; changing placement requires authority over every new target area. Reporting lines remain winery-wide, reporting targets must belong to the same winery, and cycles are rejected.

## 7. Staff APIs

Mounted under `/api/staff`.

All staff management endpoints require manager/admin auth and are scoped to the authenticated user's winery.

The authenticated user's winery supplies every staff assignment. `wineryId`, immutable `username`, and the managed Firebase login email cannot be changed through these endpoints; any future cross-winery reassignment requires a separate platform-administrator workflow.

### 7.1 `POST /api/staff/:id/reset-password`

Resets the Firebase password for an internal staff account. The UI refers to this as an access code because staff log in through the Staff Login path.

Request:

```json
{
  "password": "newcode123"
}
```

Validation and role rules:

* password must be at least 8 characters
* password must include at least one number
* target user must belong to the requester's winery
* admin credentials cannot be reset through this endpoint

Response:

```json
{
  "message": "Staff access code reset successfully.",
  "staff": {
    "id": 12,
    "displayName": "Sarah Cellar Door",
    "email": "sarah.w1@vinagent.internal",
    "role": "staff",
    "isActive": true
  }
}
```

## 8. Member APIs

Mounted under `/api/members`.

### 8.1 Search and CRUD

All member routes require dashboard authentication. `GET /api/members/search` is available to all authenticated users. Full member CRUD is manager/admin only.

Currently exposed:

* `GET /api/members/search?q=...`
* `GET /api/members`
* `GET /api/members/:id`
* `POST /api/members`
* `PUT /api/members/:id`
* `DELETE /api/members/:id`

### 8.2 `POST /api/members/:id/merge`

Merges another customer record into the target customer `:id`.

Request:

```json
{
  "sourceMemberId": 84,
  "fieldOverrides": {
    "email": "source",
    "phone": "target",
    "notes": "combine"
  }
}
```

Effects:

* the source member record is deleted
* linked `Task`, `Message`, and `MemberActionToken` rows are reassigned to the target member
* tags, notes, loyalty, spend, orders, visits, and recent-contact fields are consolidated

Response:

```json
{
  "success": true,
  "member": {
    "id": 42,
    "email": "preferred@example.com"
  },
  "mergeSummary": {
    "targetMemberId": 42,
    "sourceMemberId": 84,
    "reassignedTasks": 3,
    "reassignedMessages": 5,
    "reassignedTokens": 1
  }
}
```

## 9. User APIs

Mounted under `/api/users`.

### 9.1 `GET /api/users`

Returns authenticated-winery users for assignment dropdowns and staff-selection UI. Each compact row includes `id`, `displayName`, `email`, `role`, `isActive`, and `managedAreaIds`; the last field lets area-aware owner selectors identify people authorised across every selected area without exposing full membership records.

## 10. Noticeboard APIs

Mounted under `/api/notices`.

All noticeboard routes require dashboard authentication. Staff can read visible notices and create comments. Manager/admin roles can create, update, archive, delete comments, and manage task links.

Currently exposed:

* `GET /api/notices`
* `GET /api/notices/:id`
* `POST /api/notices`
* `PATCH /api/notices/:id`
* `DELETE /api/notices/:id`
* `GET /api/notices/:id/comments`
* `POST /api/notices/:id/comments`
* `DELETE /api/notices/:id/comments/:commentId`
* `POST /api/notices/:id/tasks`
* `DELETE /api/notices/:id/tasks/:taskId`

### Notice list pagination

`GET /api/notices` accepts the existing notice filters together with optional `page` (default `1`) and `pageSize` (default `50`, maximum `100`). The response is:

```json
{
  "notices": [],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "total": 0,
    "totalPages": 1
  }
}
```

Clients must use `pagination.total` for any total displayed to staff and provide a route to later pages when `totalPages` is greater than one.

## 11. Attachment APIs

Mounted under `/api/attachments`.

All attachment routes require dashboard authentication and are scoped by winery plus linked entity permissions.

Currently exposed:

* `GET /api/attachments`
* `POST /api/attachments`
* `GET /api/attachments/:id/download`
* `DELETE /api/attachments/:id`

Attachments can be linked to task, task-step, task-outcome, task-follow-up, notice, Request, Note, and Project entities. Each parent domain supplies its own visibility and mutation policy.

## 12. Calendar And Notification APIs

### 12.1 Calendar

Mounted under `/api/calendar`.

Staff can read events. Manager/admin roles can create, update, and delete events.

Currently exposed:

* `GET /api/calendar`
* `POST /api/calendar`
* `PUT /api/calendar/:id`
* `DELETE /api/calendar/:id`

Calendar events can link to tasks and notices where the UI supports those relationships.

`GET /api/calendar` accepts `eventId` for a permission-filtered exact lookup used by Project deep links. It can also accept date-range or search parameters. Events whose only linked records are invisible to the caller remain omitted.

### 12.2 Notifications

Mounted under `/api/notifications`.

Currently exposed:

* `GET /api/notifications`
* `PATCH /api/notifications/:id/read`
* `DELETE /api/notifications/:id`

Notifications are scoped to the authenticated user.

## 13. Analytics APIs

Mounted under `/api/analytics`.

All analytics endpoints require manager/admin auth.

### 13.1 `GET /api/analytics`

Returns period-scoped dashboard analytics plus current operational-flow metrics.

Supported query params:

* `period`: `day | week | month | year`
* `offset`: number of periods back from the current period

Response includes the existing count sections plus `operations`:

```json
{
  "period": {
    "type": "day",
    "offset": 0,
    "label": "Tue, 21 Apr 2026"
  },
  "kpis": {
    "openTasks": 8,
    "resolvedInPeriod": 5,
    "followUpsMarked": 2,
    "inboundMessages": 12
  },
  "tasks": {
    "byStatus": [],
    "byCategory": [],
    "outcomes": {
      "byResolvedAs": [],
      "byResolutionType": [],
      "byCustomerOutcome": []
    }
  },
  "operations": {
    "workflow": {
      "currentWaiting": 3,
      "currentBlocked": 1,
      "overdueTasks": 2,
      "dueSoonTasks": 4,
      "currentByState": [
        { "workflowState": "WAITING", "count": 3 }
      ],
      "currentByWaitingOn": [
        { "waitingOn": "CUSTOMER", "count": 2 }
      ],
      "stepStatus": [
        { "status": "COMPLETED", "count": 6 }
      ]
    },
    "timing": {
      "avgResolutionHours": 4.5,
      "medianResolutionHours": 3,
      "avgWaitingAgeHours": 6.2,
      "avgBlockedAgeHours": 2.1,
      "reopenedTasks": 1
    },
    "response": {
      "inboundThreads": 10,
      "respondedThreads": 8,
      "awaitingResponseThreads": 2,
      "responseCoverageRate": 80,
      "avgFirstResponseMinutes": 31.5
    },
    "handoffs": {
      "total": 4,
      "tasksWithHandoffs": 3,
      "averagePerCreatedTask": 0.4,
      "byRecipient": [
        { "name": "Cellar Door Staff", "count": 3 }
      ]
    },
    "identity": {
      "totalExternal": 9,
      "reviewRequired": 2,
      "autoLinked": 4,
      "autoCreated": 1,
      "reviewRate": 22,
      "byStatus": [
        { "status": "REVIEW_REQUIRED", "count": 2 }
      ]
    },
    "followUps": {
      "generated": 3,
      "pending": 1,
      "completed": 1,
      "cancelled": 1,
      "completionRate": 33,
      "byAutomationType": [
        { "automationType": "CUSTOMER_NO_RESPONSE_CALLBACK", "count": 2 }
      ]
    }
  }
}
```

Notes:

* waiting and blocked age are currently approximate and use the open task's latest update timestamp
* first-response latency uses linked inbound/outbound `Message` rows on the same task timeline
* follow-up automation metrics count managed child tasks stamped with `payload.followUpAutomation`

## 14. Notes on Truth

The task lifecycle in the current implementation is not the older `APPROVED / EXECUTED / AWAITING_MEMBER_ACTION` model. If you are updating clients, tests, or docs, use the current `PENDING / ACTIONED / REJECTED` contract plus audit events and tokens as the authoritative model.
## 15. Operational Areas

Operational-area endpoints and placement payloads are documented in `docs/OPERATIONAL_AREAS.md`.

- `GET /api/operational-areas`
- `POST /api/operational-areas`
- `PATCH /api/operational-areas/:id`
- `PUT /api/operational-areas/memberships/:userId`

Tasks, notices, and integration events accept and return operational placement fields. Existing records default to `areaScope: ORGANISATION`.
## Operational intelligence endpoints

All endpoints require normal dashboard authentication and derive `wineryId`, user ID, and role from the authenticated server context.

### `POST /api/operations/classify`

Returns a suggestion only; it does not create an object.

```json
{
  "text": "We need more takeaway bags",
  "taskOrigin": "INTERNAL",
  "inboundMethod": "internal",
  "suggestedChannel": "none"
}
```

The response includes `originalText`, `suggestedType`, `suggestedSubtype`, `confidence`, `classificationSource`, suggested title/body, and the existing structured triage fields.

### `GET /api/operations`

Returns a normalized feed across Tasks, Notices, Requests, and Notes after applying source-domain visibility rules.

Query parameters:

- `types`: comma-separated `TASK,NOTICE,REQUEST,NOTE` values.
- `search`: searches domain text, comments, customer identity where available, and attachment filenames.
- `areaId`: an area ID, `organisation`, or `all`.
- `status`: a source status such as `PENDING`, `ACTIONED`, `APPROVED`, `ACTIVE`, `ARCHIVED`, or `RECORDED`.
- `sortBy`: `newest` or `oldest`.
- `page`: 1–20.
- `pageSize`: 1–50.

The response contains `operations`, per-type `counts`, normalized `filters`, and pagination. Status filters only include object types supporting that status. Counts and pagination never include objects hidden from the authenticated user.

### Requests

- `GET /api/requests` supports `status`, `areaId`, `search`, `page`, and `pageSize`.
- `POST /api/requests` creates a human-confirmed Request.
- `GET /api/requests/:id` returns the Request and audit history.
- `PATCH /api/requests/:id` edits a pending Request.
- `POST /api/requests/:id/decision` accepts `APPROVED`, `REJECTED`, or `CANCELLED` plus an optional response.

Create payloads accept title, body, original text, subtype, priority, due date, requested user, area placement, source event, and optional AI suggestion metadata. The backend always sets `humanConfirmedType = REQUEST`, `confirmedBy`, and `confirmedAt` from authenticated context.

### Operational records / Notes

- `GET /api/operational-records` supports `areaId`, `search`, `directedToMe`, `page`, and `pageSize`.
- `POST /api/operational-records` creates a human-confirmed Note.
- `GET /api/operational-records/:id` returns the Note and audit history.
- `PATCH /api/operational-records/:id` edits a Note.

Create payloads accept title, body, original text, record type, occurrence time, customer, source/reference, structured metadata, area placement, source event, optional `recipientUserIds`, and optional AI suggestion metadata. `recipientUserIds` is a unique array of up to 100 active users in the same winery; an area-scoped recipient must be able to view at least one selected area. Responses expose both `recipientUserIds` and the corresponding `Recipients` summaries.

`directedToMe=true` returns the visible Notes directed to the authenticated user explicitly or through one of their operational-area memberships. Direction is an attention mechanism rather than a separate privacy boundary; normal winery and area visibility rules still apply first. The backend always sets `humanConfirmedType = NOTE`, `confirmedBy`, and `confirmedAt` from authenticated context.

List and detail routes apply winery isolation first, then operational-area visibility. Cross-tenant and out-of-area direct reads return not-found responses.

### Request and Note collaboration

Both `/api/requests/:id` and `/api/operational-records/:id` expose:

- `GET /comments`
- `POST /comments`
- `DELETE /comments/:commentId`
- `GET /relations`
- `POST /relations`
- `DELETE /relations/:relationId`
- `POST /create-task`

Comment bodies are required and may optionally reference a top-level `parentCommentId`.

Relation creation accepts `targetType`, `targetId`, `relationType`, and optional metadata. The backend verifies visibility of both endpoints and never returns relations whose opposite endpoint is hidden from the caller.

Request-to-Task conversion requires `APPROVED` state. Note-to-Task conversion requires the Note author or a relevant manager. Conversion accepts optional task classification, priority, assignee, and due date fields. The source item is preserved, a `GENERATED_TASK` relationship is created, and repeated requests return the existing Task.

### Notice acknowledgement tracking

Notice create and update payloads accept `requiresAcknowledgement` and nullable `acknowledgementDueAt`. The deadline is ignored when acknowledgement tracking is disabled.

- `PUT /api/notices/:id/acknowledgement` idempotently records that the authenticated eligible recipient has read the notice.
- `GET /api/notices/:id/acknowledgements` returns the audience-aware recipient completion summary to a manager who can manage that notice.

Notice list and detail responses include `acknowledgement` state with expected, completed, outstanding, completion-rate, overdue, and current-user fields. Eligibility composes directed audience rules with operational-area visibility.

Manager analytics expose `operations.acknowledgements`, including required and fully acknowledged notices, overdue notices, expected/completed/outstanding assignments, completion rate, and acknowledgements recorded in the selected period.

### Cross-object operational intelligence

Manager `GET /api/analytics` responses expose `operations.intelligence`:

- `requestAging`: current pending/overdue totals, average age, four age buckets, and the five oldest Requests with source links.
- `classification`: evaluated, accepted, and corrected human-confirmed classifications plus suggested-to-confirmed transitions. Current coverage is Requests and Notes, where both fields are durably stored.
- `conversions`: Tasks generated from Requests or Notes during the selected period, grouped by source type and target Task state.
- `recurrence`: advisory cross-object clusters with significant keywords, count, object types, area IDs, first/last occurrence, and up to five source examples.
- `trends`: current-vs-previous-period counts by object type and operational area, with `current`, `previous`, `delta`, and `changePercent`.
- `suggestedSignals`: thresholded, non-persisted advisory signal payloads that managers can save into the review queue.

Recurrence uses deterministic significant-term overlap and does not mutate records, create work, or claim causal equivalence. Conversion-generated Tasks are excluded from recurrence input so the source item and its generated Task are not counted as separate incidents.
Recurrence evaluation is bounded to the latest 250 records of each object type in the selected period; the response reports `inputCount` and `maximumItemsPerType`. Classification rates are calculated from the complete stored Request/Note classification cohort for the period rather than that bounded recurrence sample.

### Operational intelligence signal review

Manager/admin-only routes under `/api/operations/intelligence/signals` persist advisory analytics findings for review. Saved signals do not create operational work until a manager explicitly actions them.

- `GET /api/operations/intelligence/config` returns the winery's operational-intelligence scheduler, threshold, and review-reminder controls after applying defaults, plus recommended `presets`, `fieldMetadata`, and recent `auditEvents`.
- `POST /api/operations/intelligence/config/preview` compares the current saved config with a proposed `preset` and/or config patch over a supplied `period`/`offset` or explicit `start`/`end`. It is read-only and returns `currentConfig`, `previewConfig`, `changedKeys`, structured `changedFields` with before/after values and field descriptions, and signal-count impact including added, removed, and severity-changed suggested signals. Optional `historyPeriods` accepts `1` to `6` and adds a `history` block with per-window comparisons plus aggregate current/preview totals across recent equivalent windows.
- `PATCH /api/operations/intelligence/config` updates those controls. Payload sections are `scheduler`, `thresholds`, `reminders`, and optional `preset: default | sensitive | conservative`; omitted values keep their current/default setting. The response includes `changedKeys` and recent audit events.
- `GET /api/operations/intelligence/signals` accepts `status`, `signalType`, `areaId`, `page`, and `pageSize`.
- `POST /api/operations/intelligence/signals` creates or updates an idempotent signal using winery/fingerprint and suppresses adjacent-window duplicates using `dedupeKey`.
- `POST /api/operations/intelligence/signals/materialize` calculates current thresholded intelligence for a supplied `period`/`offset` or explicit `start`/`end`, then creates, updates, or suppresses matching saved signals.
- `POST /api/operations/intelligence/signals/scheduled-run` runs the same materialization path through the scheduler service for the current winery context.
- `PATCH /api/operations/intelligence/signals/:id` sets `OPEN`, `ACKNOWLEDGED`, or `DISMISSED`.
- `PATCH /api/operations/intelligence/signals/:id/workflow` updates review workflow fields without closing or actioning the signal.
- `POST /api/operations/intelligence/signals/:id/create-task` creates one manager-approved Operations Task and marks the signal `ACTION_CREATED`; repeated calls return the existing Task.

Create fields: `signalType`, `severity`, `title`, optional `summary`, optional `fingerprint`, optional `dedupeKey`, optional `evidence`, optional `periodStart` / `periodEnd`, optional `areaId`, optional `suggestedAction`, optional `reviewOwnerUserId`, and optional `reviewDueAt`.

Workflow update fields: `reviewOwnerUserId`, `reviewDueAt`, `suggestedAction`, and `reviewNote`. At least one is required. `reviewOwnerUserId` must belong to the same winery.

Materialization responses include `suggestedCount`, `createdCount`, `updatedCount`, `suppressedDuplicateCount`, and the materialized `signals`. Scheduled-run responses include those aggregate counts plus per-winery `results`.

Supported signal types: `REQUEST_AGING`, `RECURRENCE`, `CLASSIFICATION_CORRECTION`, `CONVERSION_OUTCOME`, `NOTICE_ACKNOWLEDGEMENT`, `TREND`.

Signal-to-Task creation accepts optional `priority`, `assigneeId`, `dueAt`, `suggestedAction`, `reviewNote`, `payload`, and structured `steps`. Missing `assigneeId`, `dueAt`, and `suggestedAction` default from the saved signal's review owner, review due date, and suggested action. These fields affect only the manager-approved action Task; they do not alter the source evidence or underlying operational records.

Persisted signals expose `dedupeKey`, `suggestedAction`, `reviewOwnerUserId`, `ReviewOwner`, `reviewDueAt`, `lastMaterializedAt`, and `materializationCount`. Dedupe suppression targets open or acknowledged signals with the same `dedupeKey` created within the configured adjacent-window suppression period.

The production scheduler is opt-in with `OPERATIONAL_INTELLIGENCE_SCHEDULER_ENABLED=true`. When enabled, the server periodically materializes thresholded suggestions and creates de-duplicated `SYSTEM` notifications for open/acknowledged signals whose `reviewDueAt` is due soon or overdue. Scheduler cadence, reporting period, due-soon window, overdue repeat bucket, and reminder batch size are controlled by the `OPERATIONAL_INTELLIGENCE_*` environment variables in `.env.example`.

Per-winery controls are stored in `WinerySettings.operationalIntelligenceConfig`. Env flags control whether the server-level scheduler loop runs at all; winery config controls whether each winery participates and which thresholds/reminder windows are used.

Config updates create immutable `OperationalIntelligenceConfigAuditEvent` rows with the actor, optional preset, before/after snapshots, and changed field paths. Preview calls are deliberately not audited because they do not mutate settings. `fieldMetadata` explains how each tunable value affects suggested signals or reminders.

Attachment APIs accept `entityType: REQUEST | NOTE` and apply the parent operational item's tenant and area visibility rules.

## Projects

Projects are mounted under `/api/projects` and require normal dashboard authentication. They coordinate existing operational objects but do not replace the source domain's workflow or permissions.

### Project lifecycle

* `GET /api/projects`
* `POST /api/projects`
* `GET /api/projects/:id`
* `PATCH /api/projects/:id`

List filters are `status`, `health`, `ownerUserId`, `involvement`, `areaId`, `search`, `targetFrom`, `targetTo`, `sortBy`, `page`, and `pageSize`. `status=open` selects `PLANNED`, `ACTIVE`, and `ON_HOLD`; `involvement=me` selects only Projects where the caller is owner, lead, participant/stakeholder, or assignee of a `DELEGATED_WORK` Task.

Create and update fields include `title`, `intendedOutcome`, `businessContext`, `status`, `ownerUserId`, `plannedStartAt`, `targetEndAt`, `riskReason`, `riskReviewAt`, `areaScope`, `primaryAreaId`, `linkedAreaIds`, `participantUserIds`, and `notifyParticipants` where applicable. Create also accepts nullable `leadUserId`; later leadership changes use the dedicated governance endpoints below.

Activating a Project requires an eligible owner and target date. Completing with unresolved required work requires `completionOverride: true` and a non-empty `completionReason`. Projects are cancelled rather than hard deleted.

Responses include `Owner`, nullable `Lead`, nullable `LeadGrantor`, `leadGrantedAt`, and authoritative `permissions`: `canView`, `canManage`, `canGovern`, `isLead`, `canDelegateTasks`, `canChangeLeadership`, `canChangeScope`, `canComplete`, and `canCancel`.

Responses also include caller-specific `involvement` with ordered `roles`, `primaryRole`, and `delegatedTaskCount`. Roles are `LEAD`, `OWNER`, `PARTICIPANT`, `STAKEHOLDER`, and `DELEGATED_TASK_ASSIGNEE`. Project visibility is checked before involvement is calculated, so this read model does not broaden access.

### Project leadership and delegation

* `PUT /api/projects/:id/lead` with `{ "leadUserId": 123 }`
* `DELETE /api/projects/:id/lead`
* `POST /api/projects/:id/tasks`

Only a user with Project governance authority may appoint, replace, or revoke a lead. A lead must be active, belong to the same winery, differ from the accountable owner, and—for an area-scoped Project—belong to at least one participating area. A Project must have an accountable owner before a lead can be appointed. Closed Projects cannot receive a new lead.

The Project Lead may edit open delivery fields, participants, linked-item metadata, dependencies, and files. The lead cannot change the accountable owner, lead appointment, Project area scope, complete or cancel the Project, authorise a completion override, or reopen a closed Project.

`POST /api/projects/:id/tasks` atomically creates and links delegated Project work. The request is:

```json
{
  "title": "Prepare Festival tasting roster",
  "body": "Coordinate staffing and guest flow with Restaurant.",
  "dueAt": "2026-08-20T02:00:00.000Z",
  "priority": "high",
  "areaId": 4,
  "assigneeId": 27,
  "isRequired": true,
  "isMilestone": false
}
```

The selected area must be an active participating Project area (or any active winery area for an organisation-wide Project), and the active assignee must be a member of that area. The operation creates the Task, its Task-area placement, a `ProjectItem` with `linkType = DELEGATED_WORK`, Task audits, a `TASK_DELEGATED` Project audit, and notifications in one transaction. The accountable Project owner is persisted as `Task.createdBy`; the acting lead remains the audit and delegation actor. This prevents a former lead from retaining creator-based access after revocation.

### Participants

* `POST /api/projects/:id/participants`
* `PATCH /api/projects/:id/participants/:userId`
* `DELETE /api/projects/:id/participants/:userId`

Participant fields are `userId`, `participationRole: PARTICIPANT | STAKEHOLDER`, and `notificationsEnabled`.

### Linked items

* `GET /api/projects/:id/items`
* `POST /api/projects/:id/items`
* `PATCH /api/projects/:id/items/:projectItemId`
* `DELETE /api/projects/:id/items/:projectItemId`
* `GET /api/projects/for-item?itemType=TASK&itemId=123`

Supported item types are `TASK`, `REQUEST`, `NOTICE`, `NOTE`, and `CALENDAR_EVENT`. Link fields are `itemType`, `itemId`, `isRequired`, `isMilestone`, and `sortOrder`. Ordinary links have `linkType = REFERENCE` and never grant child-record access; only the dedicated delegated-Task endpoint creates `DELEGATED_WORK` links.

Project participation and ordinary reference linking never grant access to a restricted linked object. Detail responses omit hidden object metadata and return a `restrictedItemCount`. The current lead receives scoped access only to `DELEGATED_WORK` Tasks belonging to that Project; revocation removes that access immediately unless another Task rule independently permits it.

### Dependencies and activity

* `GET /api/projects/:id/dependencies`
* `POST /api/projects/:id/dependencies`
* `DELETE /api/projects/:id/dependencies/:dependencyId`
* `GET /api/projects/:id/activity`

Dependency creation accepts `blockingTaskId` and `blockedTaskId`. Both Tasks must be linked to the Project. Self-dependencies and cycles are rejected.

### Project summaries

List and detail responses expose derived `summary` fields including `health`, nullable `progressPercent`, required/completed Task counts, blocked and overdue counts, pending decision count, past-target state, upcoming milestone, and the next meaningful action.

Progress counts only required Tasks with `workflowState = COMPLETED`; coarse `Task.status = ACTIONED` does not by itself count as completion.

### Project attachments

The existing attachment APIs accept `entityType: PROJECT`. Project visibility is required for reads and Project manage authority is required for upload or deletion.

## Usage metering

Mounted under `/api/usage`; all routes require dashboard authentication.

### `POST /api/usage/activity`

Accepts a session UUID, monotonically increasing sequence, engaged seconds, and general route group. The authenticated user and winery are always server-derived. Intervals are clamped to 60 seconds, unknown route groups become `other`, and repeated user/session/sequence submissions return `duplicate: true` without incrementing activity.

### `GET /api/usage/summary`

Manager/admin only. Optional ISO `start` and `end` query parameters select a positive window of no more than 366 days; the default is 30 days. The response contains safe commercial status/plan/provider names, current seats/storage/members, aggregate activity, authoritative Task/Message counts, event/counter totals, and daily gauge history.

Responses are `Cache-Control: no-store` and contain no external payment customer/subscription identifiers, customer content, or individual staff activity rows.

### `POST /api/usage/snapshot`

Manager/admin only. Idempotently captures the current winery-local daily active-seat, storage-byte, and member gauges.

### `POST /api/usage/reconcile`

Admin only. Optional `start`/`end` body fields follow the summary window rules. The effective start cannot precede the winery's `meteringStartedAt`. The response compares Task/Message source totals with ledger totals, refreshes gauges, and returns `409` when a discrepancy exists.

## Canonical integration intelligence

Mounted under `/api/integration-management`; all routes require manager/admin authority and derive the
winery from authentication.

Fact and bounded-context routes:

- `GET /intelligence-fact-definitions`
- `GET /intelligence-facts`
- `POST /intelligence-facts/materialize`
- `GET /intelligence-fact-runs`
- `GET /customers/:memberId/relationship-context`
- `GET /wine-club-allocations/:allocationId/fulfilment-context`
- `GET /areas/:areaId/capacity-context`

`POST /intelligence-facts/materialize` accepts a registered `materializerKey`, canonical `subjectId`,
`maxAgeSeconds`, UUID `requestId`, and manager reason. Area capacity additionally requires ISO `from`
and `to`, with bounded `maxBookings`.

Health and activation routes:

- `GET /integration-health`
- `GET /connections/:id/domain-activations/:domain/preview`
- `POST /connections/:id/domain-activations/:domain`
- `POST /connections/:id/domain-activations/:domain/disable`

Health filters are `domain`, `connectionId`, `maxAgeSeconds`, and `recentRunHours`. Activation accepts
`scopeKey`, UUID `requestId`, fresh `previewToken`, reason, and
`acknowledgeNonRetroactive: true`. Disable accepts `scopeKey` and reason. Booking continues to use its
specialised `booking-activation-preview` and `booking-activation` endpoints.
