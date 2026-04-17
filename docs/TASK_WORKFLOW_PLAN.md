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

The system now separates three concerns:

### 3.1 Task

The `Task` remains the overall case record.

It holds:

* classification: `category`, `subType`, `customerType`
* coarse business outcome: `status`
* workflow summary: `workflowState`, `waitingOn`, `nextStepSummary`, `blockedReason`, `dueAt`
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

Use steps for staged work inside one case.

Use child tasks only when work branches into a distinct deliverable with its own lifecycle.

### 3.3 TaskAction

`TaskAction` remains the immutable audit trail.

It records:

* task creation
* notes
* task updates
* assignment changes
* execution triggers
* step creation/update/completion/deletion

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

* task workflow state
* waiting-on state
* next-step summary
* current ordered task steps
* recent task actions

That makes the draft more aware of what stage the case is actually in.

## 8. API Surface

Task APIs now support structured workflow operations:

* `POST /api/tasks` can include `steps`
* `GET /api/tasks/:id` returns `TaskSteps`
* `POST /api/tasks/:id/steps`
* `PATCH /api/tasks/:id/steps/:stepId`
* `DELETE /api/tasks/:id/steps/:stepId`

## 9. UI Expectations

The dashboard should show:

* task workflow summary at a glance
* ordered step list inside task detail
* owner handoff on a per-step basis
* visible blockers and wait states
* ability to add/remove steps
* ability to mark steps started, blocked, completed, or reopened

Notes remain for collaboration, but the structured step list is now the primary progress mechanism.

## 10. Current Constraints

This is intentionally not a full generic BPM/workflow engine.

The current build does not yet include:

* branching dependency graphs between steps
* reusable workflow templates stored as first-class records
* SLA/escalation automation
* versioned AI plan records

The implementation does now have reusable workflow templates in code. What it still does not have is workflow templates as user-managed database records or admin-configurable objects.

Those can be added later if the product proves the need.

## 11. Current Outcome

The current implementation now supports the core MVP workflow capability that was missing:

* structured multi-step task progression
* handoffs by step owner
* explicit blocking and waiting states
* task-level workflow summaries for list/detail views
* AI-generated initial workflow plans
* audit events for workflow edits

That gives the product a much stronger operational backbone while preserving the current task/execution model.
