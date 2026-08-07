# Operational Intelligence Implementation Plan

## Objective

Evolve VinAgent from a task-centric workflow application into an area-aware operational layer built around four staff-facing objects:

- Task: coordinated action
- Notice: coordinated communication
- Request: coordinated approval, decision, help, information, or resources
- Note: coordinated memory, implemented internally as `OperationalRecord`

The governing rule is: AI assists, a human confirms important actions, and VinAgent records the source and decision history.

## Architectural decision

The existing `Task` and `Notice` implementations remain in place. They already own mature workflow, execution, audience, calendar, analytics, attachment, and audit behavior. Replacing them in one migration would create unnecessary operational risk.

The migration is additive:

1. Add first-class `OperationalRequest` and `OperationalRecord` domains.
2. Reuse the existing `Winery` tenant boundary and operational-area permission model.
3. Introduce a common four-way classification contract and persist the AI suggestion separately from the confirmed object.
4. Add shared relations, search, attachments, comments, and auditing incrementally.
5. Present all four objects through a unified operational feed without requiring them to share one physical table.

`Winery` remains the current organisation/site boundary. A future organisation-above-winery layer must preserve existing winery, area, and item IDs.

## Delivery phases

### Phase 0: Stabilise the area foundation

- Review and commit the operational-area migrations and services.
- Run migrations against a MySQL copy and verify rollback behavior.
- Confirm existing Tasks and Notices default to `ORGANISATION` scope.
- Verify list, detail, attachment, comment, calendar, and search routes all enforce the same visibility policy.

Exit criteria:

- Existing automated tests pass.
- Production frontend build passes.
- MySQL migration and rollback rehearsal is recorded.

### Phase 1: Four-object operational MVP

- Add `OperationalRequests`, `OperationalRequestAreas`, `OperationalRecords`, and `OperationalRecordAreas`.
- Add Request states: `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`.
- Record requester, target person, response, decision actor, decision time, and optional generated Task.
- Record Note title, summary/body, original text, source, occurrence time, structured metadata, and related customer when available.
- Store AI-suggested type, confidence, suggestion payload, human-confirmed type, confirmer, and confirmation timestamp.
- Add tenant- and area-scoped list/detail/create/update endpoints.
- Extend quick capture classification to `TASK | NOTICE | REQUEST | NOTE`.
- Add initial Requests and Notes dashboard surfaces.

Exit criteria:

- A staff member can create and view Requests and Notes in an area they belong to.
- An area manager can approve or reject Requests only in areas they manage.
- A winery manager/admin can operate across all areas.
- Cross-tenant and out-of-area reads return not-found responses.
- AI output never creates a final operational object without an explicit create/confirm request.

### Phase 2: Shared memory and relationships

- Add a general operational-item relation table with typed source and target identities.
- Support `created_from`, `relates_to`, `blocks`, `duplicates`, `generated_task`, `follow_up_for`, and `completion_record`.
- Add Request-to-Task, Note-to-Task, Notice-to-Task, and Task-to-completion-record conversions.
- Extend attachments and comments to Requests and Notes.
- Add consistent audit events for creation, edits, decisions, conversions, visibility changes, and AI confirmation.

Exit criteria:

- Conversions preserve both records and create an explicit relation; they never silently change one type into another.
- Every important mutation records actor, time, source, and before/after context.

### Phase 3: Unified feed and search

- Add `/api/operations` as a read model over Tasks, Notices, Requests, and Notes.
- Support type, area, status, owner, source, date, and related-entity filters.
- Search titles, bodies, original text, AI summaries, comments, message text, customer identity, and file metadata.
- Apply tenant and area visibility before ranking or returning results.
- Begin with indexed relational search; introduce a dedicated search engine only when measured data volume requires it.

Exit criteria:

- A user cannot infer hidden records through counts, snippets, suggestions, or pagination.
- Common winery queries return relevant cross-object results.

### Phase 4: Integration-event harness

- Replace the single related-record pointer with an `IntegrationEventItem` link table.
- Permit one incoming event to suggest or create multiple operational objects.
- Preserve raw and normalized payloads, classifier output, reviewer, confirmation, and processing errors.
- Add idempotent retry and per-created-item audit behavior.

Exit criteria:

- One event can safely create a Note and a linked Task or Request after human review.
- Replayed provider events do not duplicate operational objects.

### Phase 5: Operational intelligence

- Add cross-area trend reporting, recurrence detection, unresolved-request aging, acknowledgement metrics, and conversion outcomes.
- Keep recommendations advisory until a human approves a material action.
- Measure classification corrections and use them to improve prompts/rules without treating production corrections as automatic model training consent.

## Phase 1 data contracts

### OperationalRequest

Shared fields include winery, area scope, title, body, original text, subtype, priority, creator, requester, requested person, status, response, decision actor/time, source integration event, AI suggestion metadata, confirmation metadata, and timestamps.

Approval or rejection is a decision event. Approval may create a separate Task later; the Request remains immutable as the source business record.

### OperationalRecord

Shared fields include winery, area scope, title, body, original text, record type, source type/reference, occurrence time, member/customer link, structured metadata, AI suggestion metadata, confirmation metadata, creator/updater, and timestamps.

An Operational Record has no completion status by default. If action is needed, a linked Task or Request is created.

### ClassificationSuggestion

The classification endpoint returns:

```json
{
  "originalText": "We need more takeaway bags",
  "suggestedType": "REQUEST",
  "suggestedSubtype": "STOCK_SUPPLIES",
  "confidence": 0.87,
  "suggestedTitle": "Request more takeaway bags",
  "suggestedBody": "Cellar Door needs additional takeaway bags.",
  "suggestedAreaIds": [1],
  "suggestedFields": {}
}
```

Confidence is advisory. The creation endpoint receives the final type and fields and records who confirmed them.

## Security rules

- Resolve winery, role, and user identity only from authenticated server context.
- Scope every query by `wineryId` before applying any other filter.
- Staff may create area records only in their memberships.
- Area managers may make decisions only when they manage every linked area.
- Winery managers/admins have cross-area authority within their winery only.
- Direct record, attachment, relation, comment, search, and analytics endpoints use the same visibility service.
- Do not include sensitive raw integration payloads in routine logs.

## Migration and rollout

1. Back up the production database.
2. Apply additive tables and indexes before deploying code that writes them.
3. Deploy read/write APIs behind normal authenticated routes.
4. Enable navigation only after API health and permission smoke tests pass.
5. Roll back application code independently if necessary; additive tables may remain unused.
6. Do not drop or repurpose Task/Notice columns during these phases.

## Test strategy

Required automated coverage:

- Request and Note creation, validation, list, detail, and update.
- Tenant isolation and area visibility.
- Area-manager decision authority.
- Four-way classification examples and confidence bounds.
- Human correction of the suggested type.
- Original input and suggestion metadata persistence.
- Search and integration-event scoping when those phases land.
- MySQL migration rehearsal in addition to SQLite model tests.

Every phase must finish with the backend Jest suite and the frontend production build passing.

## Implementation status

Implemented in the first Phase 1 slice:

- Additive Request and Operational Record models and migration.
- Multi-area placement tables with primary and linked area semantics.
- Human confirmation and AI suggestion/confidence metadata.
- Shared audit events for Request and Note creation, edits, and Request decisions.
- Area-aware list, detail, create, update, and decision services.
- Authenticated `/api/requests`, `/api/operational-records`, and `/api/operations/classify` routes.
- Deterministic four-way classification fallback with the proposal's core examples covered by tests.
- Initial Requests and Notes dashboard pages with quick capture, confirmation, filtering, and Request decisions.

Implemented in the Phase 2 collaboration slice:

- Typed cross-object relationships for Tasks, Notices, Requests, and Notes.
- Relationship types for source, follow-up, blocking, duplication, generated tasks, and completion records.
- Request and Note comment threads with author/manager deletion rules.
- Request and Note attachments using the existing protected attachment storage and download routes.
- Approved Request to Task conversion and Note to Task conversion.
- Additive conversion behavior: the source object remains intact and a `GENERATED_TASK` relation records provenance.
- Idempotent conversion behavior: repeated conversion calls return the existing generated Task.
- Audit events for comments, attachments, relationships, and conversions.
- Dashboard collaboration panels for comments, files, manual relationships, and linked-Task creation.

Implemented in the Phase 3 unified-memory slice:

- Permission-scoped `GET /api/operations` read model over Tasks, Notices, Requests, and Notes.
- Cross-object search over titles, bodies, original input, task messages/notes/payloads, comments, customer identity, source references, and attachment filenames.
- Type, status, operational-area, sort, and bounded pagination controls.
- Per-type result counts and normalized operation cards without changing source-table ownership.
- Server-side tenant and area filtering before records enter the merged result set.
- Operations dashboard with direct links back to the source Task, Notice, Request, or Note.

Implemented in the Phase 4 integration-event slice:

- Additive `IntegrationEventItem` links from one intake event to multiple Tasks, Notices, Requests, and Notes.
- Transactional `create_items` review action for up to ten created or linked operational objects.
- Whole-batch rollback when any item fails, plus idempotent replay of an already completed batch.
- Source-event provenance and normal per-domain creation audit events for generated Requests and Notes.
- Backfill of legacy `relatedRecordType` / `relatedRecordId` pointers while retaining those fields for compatibility.
- Intake dashboard multi-item editor and links to every resulting operational object.

Implemented in the first Phase 5 operational-intelligence slice:

- Notice-level `requiresAcknowledgement` and optional acknowledgement deadline.
- Durable, unique per-user `NoticeAcknowledgement` records with idempotent submission.
- Audience and operational-area-aware acknowledgement eligibility.
- Manager-only recipient completion summaries with acknowledged and outstanding users.
- NoticeBoard recipient action, completion counts, overdue state, and authoring controls.
- Analytics read-rate, outstanding-assignment, completed-assignment, and overdue-notice metrics.

Implemented in the second Phase 5 operational-intelligence slice:

- Current pending-Request aging, overdue counts, age buckets, and oldest-item drill-down links.
- AI classification acceptance/correction rates and suggested-to-confirmed type transitions for Requests and Notes.
- Request/Note-to-Task conversion volume, target Task state, and completion rate.
- Deterministic cross-object recurrence candidates based on significant-term overlap across Tasks, Notices, Requests, and Notes.
- Source evidence links, type/area spread, first/last occurrence, and explicit advisory labelling for recurrence signals.
- Manager analytics presentation for all four intelligence groups.

Implemented in the third Phase 5 operational-intelligence slice:

- Previous-period type and area trend comparison in `operations.intelligence.trends`.
- Durable `OperationalIntelligenceSignal` records with winery, optional area, period, severity, fingerprint, evidence, and review state.
- Idempotent signal creation by winery/fingerprint so repeated saves update the same advisory signal rather than duplicating review work.
- Manager/admin signal review endpoints for open, acknowledged, and dismissed states.
- Manager-approved signal-to-Task creation. The generated Task carries the source signal evidence in payload and the signal moves to `ACTION_CREATED`.
- Analytics dashboard trend display, recurrence signal saving, saved signal review, dismissal/acknowledgement, and explicit task creation.
- Thresholded `suggestedSignals` in Analytics for Request aging, classification corrections, conversion outcomes, type/area trends, and notice acknowledgements.
- Manager-triggered signal materialization endpoint that persists those thresholded suggestions without creating Tasks.
- Richer signal action task inputs for owner assignment, due dates, suggested action text, and custom workflow steps.
- Stable `dedupeKey` generation for thresholded suggestions and adjacent-window suppression for open/acknowledged saved signals.
- Signal review workflow fields for suggested action, review owner, review due date, materialization count, and last materialized time.
- Scheduler-oriented signal materialization service plus manager/admin scheduled-run endpoint.
- Opt-in production scheduler wiring from `server.js` using `OPERATIONAL_INTELLIGENCE_SCHEDULER_ENABLED=true`.
- Review due reminders for open/acknowledged signals assigned to a review owner, de-duplicated with notification reminder keys.
- Per-winery `operationalIntelligenceConfig` controls in `WinerySettings`, exposed through manager-only config APIs and a lightweight Analytics controls panel.
- Configurable signal thresholds for Request aging, classification corrections, conversion outcomes, trends, and notice acknowledgement signals.
- Recommended control presets, field-level explanations, and immutable config-change audit events surfaced through the config API and Analytics controls panel.
- Read-only preset/config impact previews that compare current and proposed thresholds against the selected reporting window and recent historical windows before managers apply changes, including structured before/after control diffs with field explanations.
- Compact historical impact charts for preset and custom-control previews, showing current versus proposed suggested-signal volume by recent window.

Explicitly deferred to the next slice:

- Higher-quality trend thresholds after real usage data is available.
