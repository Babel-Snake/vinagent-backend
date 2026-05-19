# Task Step AI Suggestions

Task-level suggestions still exist for a simple "recommended current action" on the whole case. Step-level suggestions add a finer-grained workflow path: each `TaskStep` can now hold its own draft action, reply, recipient metadata, and action state.

## What Is Stored

Each `TaskStep` can store:

* `suggestedAction`
* `suggestedChannel`
* `suggestedRecipientEmail`
* `suggestedCc`
* `suggestedReplySubject`
* `suggestedReplyBody`
* `suggestionStatus`
* `suggestionGeneratedAt`
* `suggestionError`

The saved step is the editable draft source of truth. The original task-level suggestion remains useful for simple cases and whole-task closure, but the per-step draft is what should be used when a workflow has distinct stages.

## Generation Flow

Use:

* `POST /api/tasks/:id/steps/:stepId/suggestion`

The service loads the task, member, communication timeline, current ordered steps, target step, and owner context. It then asks the AI service to produce a draft for the specific target step.

Default channel selection:

* customer message, follow-up, customer wait, external, and approval steps default to `email`
* internal/execution/other steps default to `none`
* if the step already has a channel, that channel is preserved
* customer-facing steps can inherit the task-level suggested channel

Generated suggestions are saved as `DRAFT` and recorded in `TaskAction` as `STEP_UPDATED` with `details.source = "STEP_SUGGESTION_GENERATED"`.

## Edit And Save Flow

The task detail UI shows a Step Suggestion panel for each workflow step.

Users can edit:

* action text
* channel
* email recipient
* CC
* subject
* body/internal note

Saving the draft uses the normal step update endpoint:

* `PATCH /api/tasks/:id/steps/:stepId`

The UI saves the edited suggestion fields with `suggestionStatus = "SAVED"`.

## Action Flow

Use:

* `POST /api/tasks/:id/steps/:stepId/action`

For `email` and `sms`, the endpoint sends through `notifications/notification.service`, records the outbound `Message`, marks the suggestion as sent, and can complete the step.

For `none`, no external notification is sent. The endpoint records the suggestion as actioned and can complete the step.

`voice` drafts can be saved, but direct voice actioning is intentionally blocked until a live voice execution adapter exists.

Actioning a step records a `TaskAction`:

* `STEP_COMPLETED` when `completeStep = true`
* `STEP_UPDATED` when the draft is actioned without completing the step
* `details.source = "STEP_SUGGESTION_ACTIONED"`

## MVP Scope

This is ready for MVP step-level drafting and email send-through. It does not replace full task closure: completing all steps updates the derived workflow state, but `Task.status` remains the explicit business outcome (`PENDING`, `ACTIONED`, or `REJECTED`) until the user closes the task.

The next expansion points are:

* provider-specific send controls for Outlook once OAuth credentials are configured
* a phone/recipient field for SMS override instead of relying on the member phone
* versioned suggestion history for model-training comparison
* automatic generation for the active next step when a task is opened
