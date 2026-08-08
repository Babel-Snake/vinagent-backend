# COMPONENTS.md

This document breaks the current VinAgent codebase into the major runtime components that exist today.

## 1. API Shell

Files:

* `src/app.js`
* `src/server.js`
* `src/routes/index.js`

Responsibilities:

* boot the Express app
* mount `/api` routes
* configure Helmet, CORS, rate limiting, request IDs, and error handling

## 2. Auth and RBAC

Files:

* `src/middleware/authMiddleware.js`
* `src/models/User.js`

Responsibilities:

* validate Firebase-backed auth context
* expose `req.user`
* enforce manager/admin/staff route permissions
* support winery-scoped access
* support current-user profile updates through `/api/public/me`
* keep password reset paths separate: email-backed users use Firebase reset email, while internal staff access codes are reset by manager/admin users

## 3. Ingestion Layer

Files:

* `src/routes/webhook.routes.js`
* `src/controllers/webhook.controller.js`
* `src/middleware/webhookValidation.js`
* `src/services/retellWebhookContext.service.js`

Responsibilities:

* validate webhook signatures and payloads
* normalize SMS, email, and voice events into `Message`
* resolve signed Retell agent/account identities through operations-managed winery or area integration config, failing closed on missing or cross-winery mappings
* normalize actionable Retell calls into reviewable `IntegrationEvent` records
* create initial tasks from inbound traffic

## 4. Triage Layer

Files:

* `src/services/triage.service.js`
* `src/services/ai/*`

Responsibilities:

* classify inbound messages and staff notes
* derive `category`, `subType`, `priority`, `sentiment`, and payload
* respect winery feature flags
* fall back to heuristics if AI is skipped or unavailable

## 5. Task Workflow Layer

Files:

* `src/controllers/task.controller.js`
* `src/services/taskService.js`
* `src/models/Task.js`
* `src/models/TaskStep.js`
* `src/models/TaskAction.js`

Responsibilities:

* list/filter/search tasks
* fetch task detail with audit history
* create manual tasks
* create and update structured workflow steps
* update status, notes, assignment, payload, and suggestions
* enforce current status transitions and role restrictions

Current task statuses:

* `PENDING`
* `ACTIONED`
* `REJECTED`

Current task workflow summary states:

* `NOT_STARTED`
* `IN_PROGRESS`
* `WAITING`
* `BLOCKED`
* `COMPLETED`
* `CANCELLED`

## 6. Execution Layer

Files:

* `src/services/execution.service.js`
* `src/services/addressUpdateService.js`
* `src/services/memberActionTokenService.js`
* `src/services/notifications/notification.service.js`

Responsibilities:

* run best-effort automations after task actioning
* create secure member tokens
* send outbound notifications
* apply member-confirmed address updates

Notable current behaviour:

* address-change tasks go back to `PENDING` after token creation
* order tasks can record CRM-backed writeback results and structured execution outcomes
* booking tasks use the configured provider path

## 7. Winery Context Layer

Files:

* `src/controllers/winery.controller.js`
* `src/services/winery.service.js`
* winery-related Sequelize models

Responsibilities:

* manage winery overview data
* manage brand, bookings, policy, and integration profiles
* expose organisation configuration read-only to area managers
* manage area public profiles and area-owned booking rules/types
* manage shared products plus area-specific availability and commercial overrides
* manage area booking/POS/CRM/delivery overrides while retaining winery-level communication defaults
* manage shared and area-owned FAQs/SOPs with scoped area-manager authority
* manage organisation contacts with primary/linked area placement and a winery-wide reporting hierarchy
* manage products, FAQs, SOPs, and contacts
* aggregate winery context for AI usage

## 8. Supporting Product Layers

Files:

* `src/routes/member.routes.js`
* `src/routes/staff.routes.js`
* `src/routes/notification.routes.js`
* `src/routes/calendar.routes.js`
* `src/routes/project.routes.js`
* `src/routes/analytics.routes.js`

Responsibilities:

* member management
* staff management, including manager/admin reset of internal staff access codes
* notifications
* calendar/event support
* analytics endpoints for the dashboard, including operational flow metrics from tasks, steps, actions, messages, identity resolution, follow-up automation, cross-object intelligence, and saved signal review
* Project lifecycle, participants, typed item membership, dependencies, activity, and reverse item lookup

## 9. Frontend

Files:

* `frontend/app/*`
* `frontend/components/*`
* `frontend/lib/api.ts`

Current shared frontend interaction components include `Pagination.tsx` for list reachability and result counts, `WorkSubnav.tsx` for local Queue/Projects/Requests/Notes/Search/Intake orientation, `TaskLinkPicker.tsx` and `NoticeLinkPicker.tsx` for searchable task/notice relationships, `ProjectLinksPanel.tsx` for permission-scoped reverse Project context, and `ui/Dialog.tsx`/`ui/ConfirmDialog.tsx` for focus-managed dialogs and destructive-action confirmation. `Dialog` can keep a legacy visual heading while retaining its accessible dialog name and focus management, which is useful during progressive modal migrations. `lib/operationalPresentation.ts` converts operational enum values to staff-facing labels. New list views should consume full list responses and `pagination.total` rather than inferring totals from loaded card arrays.

Responsibilities:

* dashboard task views
* winery configuration UI
* member and staff management UI
* profile settings for display name updates and Firebase password reset emails
* Staff & Access reset flow for internal staff account access codes
* analytics and calendar views, including operational intelligence trend and saved-signal controls
* Projects list/detail, creation/editing, typed source creation/linking, dependency and participant management, files, activity, and reverse navigation
* public secure-link flows

## 10. Cross-Cutting Concerns

### 10.1 Audit Trail

`TaskAction` is the durable record of workflow activity. Because the task status model is coarse, the audit trail is essential for understanding what actually happened.

`TaskStep` is the structured progress layer. It holds the live workflow plan, while `TaskAction` records how that plan changed over time.

### 10.2 Feature Flags

`WinerySettings` influences both triage and execution behaviour.

### 10.3 AI Context

Winery data, member context, and task history are used to make AI drafting and classification winery-specific rather than generic.

## 11. Practical Ownership Guide

When changing behaviour:

* webhook shape or security -> ingestion layer
* classification, suggested reply logic, or AI-generated step plans -> triage / AI layer
* status transitions, step logic, or notes/assignment rules -> task workflow layer
* secure-link or member update logic -> execution layer
* winery knowledge used by AI -> winery context layer

This is the component map that should be used for current implementation work, not the older bootstrap-era sprint breakdown.
## Unified Operations dashboard

`frontend/app/(dashboard)/operations/page.tsx` provides the shared cross-record Search surface. It searches and filters all four object types through `GET /api/operations`, displays normalized source cards, and links back to the authoritative object page. It is intentionally labelled Search rather than Activity because it indexes records, not their audit events.

Request and Note source links include their typed IDs. `OperationalItemPage` loads and highlights the requested object even when it is outside the current list page.

Note authoring in `OperationalItemPage` can optionally select multiple eligible recipients. The Home dashboard queries `GET /api/operational-records?directedToMe=true` and shows Notes addressed directly to the user or placed in one of their departments. Its Project panel uses a Current/Upcoming toggle so targeted Notes can occupy the adjacent attention panel without reserving an empty Project column.

## Integration event multi-item review

`src/services/integrationEvent.service.js` owns manager review orchestration. Its `create_items` path uses one database transaction across Task, Notice, Request, Note, and `IntegrationEventItem` writes. Domain services still own validation and audit creation; Request and Note creators accept a caller-owned transaction for this workflow.

`frontend/app/(dashboard)/integration-events/page.tsx` provides the batch editor and renders links to all reviewed results. `relatedRecordType` / `relatedRecordId` are retained only as a compatibility fallback.

## Notice acknowledgement and intelligence

`src/services/notice.service.js` owns acknowledgement eligibility, idempotent recording, recipient summaries, and per-notice aggregate state. It reuses the established notice audience and operational-area visibility boundary.

`src/controllers/analytics.controller.js` derives acknowledgement metrics for the selected reporting period. `frontend/app/(dashboard)/noticeboard/page.tsx` provides authoring and recipient actions; the analytics dashboard displays completion and overdue signals.

`src/services/operationalIntelligence.service.js` derives cross-object Request aging, classification correction, conversion outcome, recurrence, type/area trend signals, thresholded non-persisted `suggestedSignals`, and read-only single-window/historical config impact previews. Its pure recurrence, trend, and metric functions are unit tested; the analytics controller supplies tenant and period boundaries. The analytics dashboard presents each signal with evidence links and keeps recurrence explicitly advisory.

`src/services/operationalIntelligenceSignal.service.js` owns persisted signal review state, stable `dedupeKey` duplicate suppression across adjacent reporting windows, review owner/due/suggested-action workflow fields, manager-triggered materialization of thresholded suggestions, and manager-approved conversion of a saved signal into one Operations Task. `src/services/operationalIntelligenceConfig.service.js` owns per-winery defaults, presets, field explanations, normalization, and audit writes for scheduler, threshold, and reminder controls stored in `WinerySettings.operationalIntelligenceConfig`. `src/services/operationalIntelligenceScheduler.service.js` wraps the materialization path for manual scheduled runs, opt-in server cron cycles, and review due reminder notifications. `frontend/app/(dashboard)/analytics/page.tsx` can tune core controls, preview preset or unsaved custom-control impact across recent windows with compact current/proposed charts, apply presets, inspect recent control changes, materialize suggested signals, save recurrence signals, review saved signals, dismiss/acknowledge them, or create the action Task.

## Project coordination

`src/services/project.service.js` owns Project transactions and delegates typed child access to `projectItemResolver.service.js`, visibility/manage checks to `projectVisibility.service.js`, and derived read-model calculations to `projectSummary.service.js`. `ProjectAuditEvent` is the durable Project-level activity source; linked objects retain their own domain histories.

`frontend/app/(dashboard)/projects/page.tsx` owns URL-addressable Project selection and filtered pagination. `components/projects/ProjectEditorDialog.tsx` owns outcome and placement editing, while `ProjectDetailPanel.tsx` owns attention, membership, source creation/linking with recovery, dependencies, participants, files, status completion safeguards, and activity. `ProjectLinksPanel.tsx` is embedded in all five supported detail surfaces.

## Personal involvement presentation

`frontend/lib/involvement.ts` is the single client-side classifier for personal relevance. `src/services/involvement.service.js` adds the same signal to normalized Search results and Project item read models, where the frontend does not otherwise receive the full source record.

The visual contract is deliberately separate from workflow status:

* teal (`--involvement-direct`) plus an explicit badge means directly assigned, requested from, directed to, personally targeted, created calendar work, or a Project role
* soft burgundy (`--involvement-area`) plus an explicit badge means relevant through an operational department or audience role
* no involvement treatment means generally visible context
* red, amber, and green remain reserved for urgency and workflow state

`InvolvementBadge` and the `involvement-surface-*` classes must be used together so personal relevance is not communicated by colour alone. Direct items may be sorted ahead of contextual items within a Project section, but relevance must not hide other visible Project records.

## Usage metering

`src/services/usageTracking.service.js` owns usage validation, dimension allowlisting, idempotent event writes, hourly counters, activity aggregation, gauge capture, summaries, and reconciliation. `usageMetricCatalog.js` is the only metric/unit/dimension catalogue. Business services emit facts without storing prices or customer content.

`src/middleware/usageRequestMeter.js` observes authenticated responses and records only route-group aggregates. `src/controllers/usage.controller.js` and `src/routes/usage.routes.js` expose aggregate reporting and bounded activity/snapshot/reconciliation operations.

`frontend/components/UsageActivityTracker.tsx` owns the privacy-limited heartbeat. `frontend/app/(dashboard)/usage/page.tsx` is the manager/admin aggregate reporting surface. See `USAGE_METERING.md` before adding metrics or a payment-provider exporter.
