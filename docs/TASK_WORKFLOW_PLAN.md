# TASK_WORKFLOW_PLAN.md

This document defines the current task workflow model that now ships in the live build.

The goal is to make tasks usable as durable operational cases, not just classified inbox items.

## 1. Problem Statement

The previous task model was strong at classification and coarse outcome tracking, but weaker at showing:

* what still needs to happen
* who owns the current stage of work
* what the next actionable step is
* whether the task is waiting, blocked, or actively progressing
* how AI should reason about a multi-step case over time

Internal notes and `@mentions` remain useful, but they are discussion tools. They are not a reliable workflow model.

## 2. Design Goals

The workflow layer should let any staff member open a task and immediately understand:

1. what this task is
2. what stage it is in
3. what should happen next
4. who owns that next step
5. what is blocking progress, if anything
6. what communications or automation should happen next

## 3. Domain Shape

The system now separates four concerns:

### 3.1 Task

The `Task` remains the overall case record.

It holds:

* classification: `category`, `subType`, `customerType`
* coarse business outcome: `status`
* workflow summary: `workflowState`, `waitingOn`, `nextStepSummary`, `blockedReason`, `dueAt`
* structured closure outcome: `resolvedAs`, `resolutionType`, `customerOutcome`, `resolutionSummary`, `followUpRequired`, `followUpDueAt`
* suggested comms/action data
* assignment and message/member links

### 3.2 TaskStep

`TaskStep` is the structured workflow record inside a task.

Each step can track:

* `title`
* `description`
* `stepType`
* `status`
* `waitingOn`
* `ownerUserId`
* `dueAt`
* `blockedReason`
* `completionNotes`
* `completedAt`
* `sortOrder`
* per-step suggestion fields: `suggestedAction`, `suggestedChannel`, `suggestedRecipientEmail`, `suggestedCc`, `suggestedReplySubject`, `suggestedReplyBody`, `suggestionStatus`, `suggestionGeneratedAt`, and `suggestionError`

Use steps for staged work inside one case.

Use child tasks only when work branches into a distinct deliverable with its own lifecycle.

### 3.2a Managed Follow-Up Child Tasks

The live build now uses child `Task` records for deterministic post-closure follow-up.

This is used when:

* a case closes with `followUpRequired = true`
* the closure reason is `CUSTOMER_NO_RESPONSE`
* the case closes as an escalation that needs review

These child tasks are not ad hoc duplicates. They are managed queue items linked by `parentTaskId`, stamped with `payload.followUpAutomation`, and kept in sync when the parent case is reopened or its closure semantics change.

### 3.3 TaskAction

`TaskAction` remains the immutable audit trail.

It records:

* task creation
* notes
* task updates
* assignment changes
* execution triggers
* execution results
* member enrichment side effects
* step creation/update/completion/deletion

### 3.4 Message Timeline

`Message` records now form the case communication timeline.

They capture:

* inbound webhook communications that originated the case
* outbound notifications or replies sent during execution
* the chronological customer-facing thread associated with the task

Notes and audit actions remain important, but they are not a replacement for the actual communication history.

## 4. Two State Systems

The design intentionally keeps two separate state layers:

### 4.1 Task Status

`Task.status` is still the coarse business outcome:

* `PENDING`
* `ACTIONED`
* `REJECTED`

This remains important for execution logic, queue semantics, and compatibility with the existing product.

### 4.2 Workflow State

`Task.workflowState` describes operational progress:

* `NOT_STARTED`
* `IN_PROGRESS`
* `WAITING`
* `BLOCKED`
* `COMPLETED`
* `CANCELLED`

`Task.waitingOn` adds the reason for passive states:

* `NONE`
* `STAFF`
* `CUSTOMER`
* `MANAGER`
* `EXTERNAL`

The workflow summary is derived from the active `TaskStep` set.

### 4.3 Outcome Taxonomy

Closed tasks now also carry a normalized outcome layer.

Important fields:

* `resolvedAs`: coarse closure meaning such as `COMPLETED`, `WORKAROUND`, `ESCALATED`, `DECLINED`, `DUPLICATE`, or `NO_ACTION`
* `resolutionType`: more specific operational reason such as `EXECUTED`, `REPLIED`, `POLICY_DECLINE`, `MERGED_DUPLICATE`, or `CUSTOMER_NO_RESPONSE`
* `customerOutcome`: the customer-facing result such as `BOOKING_CONFIRMED`, `ORDER_UPDATED`, `ACCOUNT_UPDATED`, `INFO_PROVIDED`, or `NO_CHANGE`
* `resolutionSummary`: freeform operator context
* `followUpRequired`, `followUpDueAt`, `followUpSummary`: structured post-closure intent captured on the same case record

This keeps closure semantics out of note text and makes the case record more useful for reporting, AI context, and future automation.

The first production automation driven from this layer is managed follow-up generation. Closure fields are no longer just descriptive; they can now create the next operational case automatically when the system can do so safely and deterministically.

## 5. Step Lifecycle

`TaskStep.status` values:

* `PENDING`
* `IN_PROGRESS`
* `BLOCKED`
* `COMPLETED`
* `SKIPPED`
* `CANCELLED`

Typical meaning:

* `PENDING`: not started yet
* `IN_PROGRESS`: actively being worked
* `BLOCKED`: cannot proceed without intervention
* `COMPLETED`: finished and recorded
* `SKIPPED`: no longer needed
* `CANCELLED`: intentionally dropped

## 6. Workflow Summary Rules

The backend now derives task-level workflow summary from its steps:

* any blocked active step -> task workflow becomes `BLOCKED`
* current in-progress step -> task workflow becomes `IN_PROGRESS` or `WAITING` depending on `waitingOn`
* next pending step waiting on customer/manager/external -> task workflow becomes `WAITING`
* no active steps left -> task workflow becomes `COMPLETED`
* rejected task -> workflow becomes `CANCELLED`

The task summary fields are meant for list views and high-level reporting.

The step list is the detailed operational source of truth.

## 7. AI Role in Workflow

AI should not own the workflow blindly. It should propose a workflow that humans can review.

### 7.1 On Classification / Task Creation

The strategist model now proposes:

* category and subtype
* routing suggestions
* reply guidance
* an initial `suggestedSteps` plan

If AI does not provide a plan, the backend generates a default step template based on task type.

Those defaults are now centralized in `src/services/taskWorkflowTemplates.js`, so subtype and category fallbacks stay consistent across triage, mock AI, and integration tests.

### 7.2 On Ongoing Drafting

When regenerating suggested replies, the AI now receives:

* task communication timeline
* task workflow state
* waiting-on state
* next-step summary
* current ordered task steps
* recent task actions

That makes the draft more aware of what stage the case is actually in.

### 7.3 On Step-Level Drafting

Each workflow step can now generate and store its own AI suggestion. This is useful when a task has multiple stages, for example an internal approval step, a customer reply step, and a follow-up step.

Step-level suggestions can be edited by the user before actioning. Actioning can send an email/SMS through the notification layer or mark an internal step actioned when the channel is `none`.

## 8. API Surface

Task APIs now support structured workflow operations:

* `POST /api/tasks` can include `steps`
* `GET /api/tasks/:id` returns `TaskSteps`
* `GET /api/tasks/:id` also returns `ParentTask` and `SubTasks`
* `POST /api/tasks/:id/steps`
* `PATCH /api/tasks/:id/steps/:stepId`
* `POST /api/tasks/:id/steps/:stepId/suggestion`
* `POST /api/tasks/:id/steps/:stepId/action`
* `DELETE /api/tasks/:id/steps/:stepId`

External manual intake also writes structured identity metadata into `payload.manualIntake`:

* `taskOrigin`
* `inboundMethod`
* `requesterName`
* `requesterEmail`
* `requesterPhone`
* `identityResolutionStatus`
* `identityConfidence`
* `memberAutoLinked`
* optional ranked `suggestedCandidates`
* optional review fields like `suggestedMemberId`, `suggestedMemberLabel`, and `suggestedMemberReason`

This is what lets the UI distinguish a safe auto-link from a suggested-but-unconfirmed match.

The review state is now richer than a single best guess. The backend can store multiple ranked candidate customers so staff can confirm the right identity without leaving the task.

Webhook-created external tasks now use the same identity model too. They can arrive as auto-linked, auto-created, unresolved, or review-required cases depending on contact confidence and task category.

Closed-task follow-up automation now uses the same task surface rather than a separate reminder system. That means automated follow-up work shows up through normal task detail and list queries as linked child cases.

## 9. UI Expectations

The dashboard should show:

* task workflow summary at a glance
* linked communication timeline inside task detail
* recorded execution results inside task detail
* linked parent/child follow-up cases inside task detail
* ordered step list inside task detail
* recorded task outcome and follow-up metadata on closed tasks
* external intake identity state at a glance
* review controls when a customer match is plausible but not strong enough to auto-link
* owner handoff on a per-step basis
* visible blockers and wait states
* ability to add/remove steps
* ability to mark steps started, blocked, completed, or reopened
* ability to generate, edit, save, and action suggestions at the individual step level

Notes remain for collaboration, but the structured step list is now the primary progress mechanism.

## 10. Current Constraints

This is intentionally not a full generic BPM/workflow engine.

The current build does not yet include:

* branching dependency graphs between steps
* reusable workflow templates stored as first-class records
* versioned AI plan records

The implementation does now have reusable workflow templates in code and deterministic post-closure follow-up automation. What it still does not have is workflow templates as user-managed database records, a broader SLA engine, or arbitrary scheduled reminder orchestration.

The intake identity layer is also deliberately conservative. When a candidate match is plausible but weak, the task stays unlinked and moves into a review-required state instead of silently merging customer records.

Customer cleanup is also now part of the operational surface:

* managers can merge duplicate customer records
* linked tasks, messages, and secure member-action tokens are reassigned to the surviving record
* member engagement fields and tags are consolidated rather than discarded

Those can be added later if the product proves the need.

## 11. Current Outcome

The current implementation now supports the core MVP workflow capability that was missing:

* structured multi-step task progression
* task-centric communication timeline across inbound and outbound messages
* handoffs by step owner
* explicit blocking and waiting states
* structured outcome taxonomy for closed tasks
* structured execution results for provider-backed actions and outbound notifications
* managed child follow-up tasks driven by closure semantics
* operational analytics over wait states, blockers, response latency, handoffs, identity review, and follow-up automation
* task-level workflow summaries for list/detail views
* AI-generated initial workflow plans
* AI-generated per-step draft actions and replies
* explicit intake identity tracking and review-required matching for external tasks
* ranked candidate suggestions for customer review
* winery-configurable matching thresholds
* member enrichment when actioned outcomes confirm a stronger customer/contact relationship
* merge tooling to consolidate duplicate customer records safely
* audit events for workflow edits

That gives the product a much stronger operational backbone while preserving the current task/execution model.
