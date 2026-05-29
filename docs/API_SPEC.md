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

Webhook endpoints use provider-specific signature validation. Retell HMAC verification uses the raw request body captured by the Express parser.

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

### 4.2 `GET /api/tasks/:id`

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

### 5.2 `GET /api/public/pin-config?wineryId=...`

Returns the public PIN-login configuration for the requested winery when PIN login is enabled.

### 5.3 `POST /api/public/pin-login`

Authenticates a staff PIN/access code and returns a short-lived PIN session token.

Request:

```json
{
  "wineryId": 1,
  "username": "cellardoor",
  "accessCode": "123456"
}
```

Response includes the authenticated user context, token expiry, and idle timeout.

### 5.4 `GET /api/public/address-update/validate?token=...`

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
* `POST /api/winery/integration-config/test`
* `POST /api/winery/integration-config/email/sync`
* `PUT /api/winery/settings`

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

## 7. Staff APIs

Mounted under `/api/staff`.

All staff management endpoints require manager/admin auth and are scoped to the authenticated user's winery.

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

Returns authenticated-winery users for assignment dropdowns and staff-selection UI.

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

## 11. Attachment APIs

Mounted under `/api/attachments`.

All attachment routes require dashboard authentication and are scoped by winery plus linked entity permissions.

Currently exposed:

* `GET /api/attachments`
* `POST /api/attachments`
* `GET /api/attachments/:id/download`
* `DELETE /api/attachments/:id`

Attachments can be linked to task, task-step, task-outcome, task-follow-up, and notice entities.

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
