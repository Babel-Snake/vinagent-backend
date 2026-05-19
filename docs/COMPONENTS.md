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

Responsibilities:

* validate webhook signatures and payloads
* normalize SMS, email, and voice events into `Message`
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
* manage products, FAQs, SOPs, and contacts
* aggregate winery context for AI usage

## 8. Supporting Product Layers

Files:

* `src/routes/member.routes.js`
* `src/routes/staff.routes.js`
* `src/routes/notification.routes.js`
* `src/routes/calendar.routes.js`
* `src/routes/analytics.routes.js`

Responsibilities:

* member management
* staff management, including manager/admin reset of internal staff access codes
* notifications
* calendar/event support
* analytics endpoints for the dashboard, including operational flow metrics from tasks, steps, actions, messages, identity resolution, and follow-up automation

## 9. Frontend

Files:

* `frontend/app/*`
* `frontend/components/*`
* `frontend/lib/api.ts`

Responsibilities:

* dashboard task views
* winery configuration UI
* member and staff management UI
* profile settings for display name updates and Firebase password reset emails
* Staff & Access reset flow for internal staff account access codes
* analytics and calendar views
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
