# DOMAIN_MODEL.md

This document describes the current backend domain model and the workflow semantics that matter most in the live build.

## 1. User

Represents an authenticated human user of the platform.

Key fields:

* `id`
* `firebaseUid`
* `email`
* `displayName`
* `isActive`
* `role`: `admin | manager | staff`
* `responsibilities`
* `wineryId`

Relationships:

* belongs to `Winery`
* can create/update/assignee tasks
* can author `TaskAction`
* receives `Notification`

## 2. Winery and Winery Settings

### 2.1 Winery

Represents the winery's core identity and contact details.

Current ecosystem around a winery:

* `Winery`
* `WinerySettings`
* `WineryBrandProfile`
* `WineryBookingsConfig`
* `WineryPolicyProfile`
* `WineryIntegrationConfig`
* `WineryProduct`
* `WineryFAQItem`
* `WinerySop`
* `WineryContact`

### 2.2 WinerySettings

Controls feature gating and provider selection.

Key fields:

* `tier`: `BASIC | ADVANCED`
* `enableBookingModule`
* `enableWineClubModule`
* `enableOrdersModule`
* `enableSecureLinks`
* `enableInsights`
* `enableVoice`
* `bookingProvider`
* `bookingConfig`
* `crmProvider`
* `crmConfig`
* `identityMatchingConfig`

## 3. Member

Represents a winery customer/member.

Important fields:

* `id`
* `wineryId`
* `firstName`
* `lastName`
* `email`
* `phone`
* address fields
* profile/preference fields used by the dashboard and AI context

Operationally, `Member` is also the canonical surviving record for customer merges.

Relationships:

* belongs to `Winery`
* has many `Message`
* has many `Task`
* can be targeted by `MemberActionToken`

When duplicates are merged:

* downstream `Task`, `Message`, and `MemberActionToken` relations are reassigned
* engagement metrics are consolidated
* tags are unioned
* notes retain merge context

## 4. Message

Normalized inbound or outbound communication.

Important fields:

* `id`
* `wineryId`
* `memberId`
* `taskId`
* `source`: `sms | email | voice`
* `direction`: `inbound | outbound`
* `subject`
* `body`
* `rawPayload`
* `externalId`
* `receivedAt`

Relationships:

* belongs to `Winery`
* may belong to `Member`
* may belong to a `Task`

Operationally, `Message` is now the communication record for the case timeline, not just an ingestion artifact.

## 5. Task

The central workflow record in the current build.

### 5.1 Core Classification Fields

Preferred fields:

* `category`
* `subType`
* `customerType`

Legacy compatibility field:

* `type`

The implementation still reads `type` in some execution paths, but new logic should prefer `category` and `subType`.

### 5.2 Status

Current enum:

* `PENDING`
* `ACTIONED`
* `REJECTED`

This enum is intentionally coarse. Fine-grained progress is represented through task workflow summary fields, linked `Message` rows, `TaskStep` rows, `TaskAction` rows, and, for secure workflows, `MemberActionToken`.

### 5.3 Workflow Summary Fields

Current task-level workflow fields:

* `workflowState`: `NOT_STARTED | IN_PROGRESS | WAITING | BLOCKED | COMPLETED | CANCELLED`
* `waitingOn`: `NONE | STAFF | CUSTOMER | MANAGER | EXTERNAL`
* `nextStepSummary`
* `blockedReason`
* `payload.manualIntake` may hold structured external-intake identity state
* `payload.executionResults` holds the structured external effects recorded during execution
* `payload.orderWriteback` stores the latest order CRM-writeback snapshot when applicable
* `payload.followUpAutomation` marks an auto-managed child follow-up case when the task was generated from parent closure logic
* `dueAt`
* `resolvedAs`: `COMPLETED | WORKAROUND | ESCALATED | DECLINED | DUPLICATE | NO_ACTION`
* `resolutionType`: normalized operational closure reason
* `customerOutcome`: normalized customer-facing result
* `resolutionSummary`
* `followUpRequired`
* `followUpDueAt`
* `followUpSummary`
* `resolvedAt`

These fields are the high-level progress view for list/detail surfaces. They do not replace the step list.

### 5.4 Other Important Fields

* `payload`
* `suggestedChannel`
* `suggestedReplySubject`
* `suggestedReplyBody`
* `suggestedAction`
* `suggestedRecipientEmail`
* `suggestedCc`
* `requiresApproval`
* `priority`: `low | normal | high`
* `sentiment`: `POSITIVE | NEUTRAL | NEGATIVE`
* `memberId`
* `messageId`
* `createdBy`
* `updatedBy`
* `assigneeId`
* `parentTaskId`

### 5.5 Relationships

* belongs to `Winery`
* may belong to `Member`
* may belong to `Message`
* may belong to creator/updater/assignee `User`
* may belong to a parent `Task`
* may have many child `Task` records
* has many `Message`
* has many `TaskStep`
* has many `TaskAction`

### 5.6 Current Workflow Interpretation

Status is not a full workflow state machine.

Examples:

* a new triaged task is `PENDING`
* the same task can also have `workflowState = NOT_STARTED` or `WAITING`
* ordered `TaskStep` rows describe the work required inside the task
* linked inbound and outbound `Message` rows describe the communication thread inside the case
* external tasks can carry identity states such as `AUTO_LINKED`, `AUTO_CREATED`, or `REVIEW_REQUIRED`
* review-required tasks can also carry multiple ranked candidate customers inside `payload.manualIntake.suggestedCandidates`
* a manager can mark it `ACTIONED`
* once a task is closed, normalized outcome fields describe what actually happened
* those closure fields can also spawn a managed child follow-up task when more work is explicitly needed
* an address-change task may then be set back to `PENDING` while waiting for member confirmation
* after the member confirms, the task returns to `ACTIONED`

## 6. TaskStep

Structured workflow unit inside a task.

### 6.1 Core Fields

* `title`
* `description`
* `stepType`: `INTERNAL | CUSTOMER_MESSAGE | CUSTOMER_WAIT | APPROVAL | EXTERNAL | EXECUTION | FOLLOW_UP | OTHER`
* `status`: `PENDING | IN_PROGRESS | BLOCKED | COMPLETED | SKIPPED | CANCELLED`
* `waitingOn`
* `sortOrder`
* `ownerUserId`
* `dueAt`
* `blockedReason`
* `completionNotes`
* `completedAt`
* `metadata`
* `createdBy`
* `updatedBy`

### 6.2 Relationships

* belongs to `Task`
* may belong to an owner `User`

### 6.3 Usage Rule

Use `TaskStep` for staged work inside one case.

Use parent/child tasks when the work becomes a separate case with its own lifecycle.

The main live example is managed post-closure follow-up automation. Those follow-up cases are created as child tasks so they can be assigned, delayed, actioned, or cancelled independently without overloading the parent case status.

## 7. TaskAction

Immutable audit trail for changes made to a task.

Current enum in the model:

* `CREATED`
* `ACTIONED`
* `REJECTED`
* `EXECUTION_TRIGGERED`
* `UPDATED_PAYLOAD`
* `NOTE_ADDED`
* `MANUAL_CREATED`
* `MANUAL_UPDATE`
* `OUTCOME_RECORDED`
* `EXECUTION_RECORDED`
* `MEMBER_ENRICHED`
* `ASSIGNED`
* `LINKED_TASK`
* `STEP_CREATED`
* `STEP_UPDATED`
* `STEP_COMPLETED`
* `STEP_DELETED`

Important notes:

* the enum is broader than the currently emitted set
* most live workflows emit `MANUAL_CREATED`, `MANUAL_UPDATE`, `ACTIONED`, `REJECTED`, `EXECUTION_TRIGGERED`, `NOTE_ADDED`, `ASSIGNED`, and `LINKED_TASK`
* `ACTIONED` is still used for operator closure and some execution-specific success markers; inspect `details.action` when you need finer meaning
* provider-level execution details now live in `EXECUTION_RECORDED` audit entries and `payload.executionResults`
* normalized closure semantics now live on the `Task` itself and are captured in `OUTCOME_RECORDED` audit entries when they change
* managed follow-up creation, update, and cancellation are represented through `LINKED_TASK` entries on the parent plus normal lifecycle entries on the child task

Examples of `details.action` values used today:

* `ORDER_WRITEBACK`
* `BOOKING_CREATED`
* `MEMBER_CONFIRMED_ADDRESS`

## 8. MemberActionToken

Secure single-use token used for member self-service.

Current main use case:

* address confirmation / update

Key fields:

* `id`
* `memberId`
* `wineryId`
* `taskId`
* `type`
* `channel`
* `token`
* `target`
* `payload`
* `expiresAt`
* `usedAt`

Relationships:

* belongs to `Member`
* belongs to `Winery`
* may belong to `Task`

## 9. Classification Vocabulary

Current category enum:

* `BOOKING`
* `ORDER`
* `ACCOUNT`
* `GENERAL`
* `INTERNAL`
* `SYSTEM`
* `OPERATIONS`

Current customer type enum:

* `MEMBER`
* `VISITOR`
* `UNKNOWN`

`subType` is intentionally string-based so the classification vocabulary can expand without a schema change.

Common current examples:

* `ACCOUNT_ADDRESS_CHANGE`
* `ACCOUNT_PAYMENT_ISSUE`
* `BOOKING_NEW`
* `ORDER_SHIPPING_DELAY`
* `OPERATIONS_SUPPLY_REQUEST`
* `GENERAL_ENQUIRY`

## 10. Practical Source of Truth

For schema-level truth, use the Sequelize models under `src/models`.

For workflow truth, read these together:

* `src/services/taskService.js`
* `src/services/execution.service.js`
* `src/services/addressUpdateService.js`
* `docs/TASK_WORKFLOW_PLAN.md`

That combination defines how the current backend really behaves.

## 11. Analytics Semantics

Operational analytics are derived from the same case records rather than a separate reporting schema.

Current analytics sources:

* `Task` for workflow state, waiting owner, due dates, outcomes, identity metadata, and parent/child follow-up cases
* `TaskStep` for period step-status progress
* `TaskAction` for assignment and step-owner handoff counts
* `Message` for first-response latency across task communication timelines
* `Member` for customer source, loyalty, spend, and lifecycle counts

Waiting and blocked age are currently approximated from the open task's latest update timestamp. That is useful for MVP management visibility, but exact state-duration analytics would require explicit workflow-state transition timestamps.
