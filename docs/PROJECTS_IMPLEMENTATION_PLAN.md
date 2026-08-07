# VinAgent Projects Implementation Plan

## 1. Objective

Projects add a coordination layer above VinAgent's operational objects without changing the meaning or source of truth of those objects.

The hierarchy is:

```text
Winery
└── Project
    ├── Task: work that must be completed
    ├── Request: a decision, approval, resource, or answer that is needed
    ├── Notice: information that must be communicated
    ├── Note: durable operational context or a recorded decision
    └── Calendar Event: something scheduled to occur
```

A Project groups these records around one organisational outcome. It does not absorb their workflows, permissions, communication histories, or audit records.

The governing product rule remains:

> AI assists. Humans confirm. VinAgent records.

## 2. Feature-complete outcome

The first production release is complete when an authorised user can:

1. Create a lightweight Project shell.
2. State the intended outcome and optional business context.
3. Assign one accountable owner.
4. Set planned and target dates.
5. Place the Project at organisation or operational-area scope.
6. Add explicit participants without granting access to otherwise restricted linked records.
7. Link existing Tasks, Requests, Notices, Notes, and Calendar Events.
8. Create a new operational item from the Project and retain the Project link.
9. Mark Tasks as required and Tasks or Events as milestones.
10. See understandable required-Task progress.
11. See blockers, overdue work, pending decisions, dependency-held work, upcoming Events, and the next meaningful action.
12. Record and inspect Project-specific activity history.
13. Add and remove Task dependency relationships with cycle protection.
14. Add Project attachments.
15. Notify the owner and relevant participants of significant Project changes without broadcasting every edit.
16. Search and filter Projects by status, health, owner, area, date, and text.
17. Navigate from a linked operational item back to its Project or Projects.
18. Complete or cancel a Project without deleting its organisational memory.
19. Retain the existing permission rules of every linked item.

AI-generated plans, predictive risk, templates, recurring Project cloning, resource forecasting, budgets, Gantt charts, and advanced portfolio analytics are subsequent intelligence passes. They depend on trustworthy human-created Project data and are not release blockers for the coordination layer.

## 3. Non-negotiable domain decisions

### 3.1 Project is a container, not a fifth peer object

`OperationalItemRelation` continues to describe relationships between operational objects. Project membership uses a dedicated `ProjectItem` table because membership carries container-specific data such as required progress, milestone state, ordering, and the actor who added the item.

`Task.parentTaskId` must not be used for Project membership. It remains reserved for genuine parent/child case relationships such as managed follow-up work.

### 3.2 Existing objects remain authoritative

- Task completion comes from `Task.workflowState`.
- Request decisions come from `OperationalRequest.status`.
- Notice audience and acknowledgement rules remain on `Notice`.
- Note content remains on `OperationalRecord`.
- Calendar scheduling remains on `CalendarEvent`.
- Project changes never silently rewrite linked item ownership, deadlines, audience, or visibility.

### 3.3 Project membership is many-to-many

An operational item may provide context to more than one Project. `ProjectItem` is unique by `projectId + itemType + itemId`; the same item may be linked to another Project after a human confirms it.

Progress metadata is per Project. A Task can therefore be required in one Project and contextual in another.

### 3.4 Progress semantics

Only linked Tasks with `isRequired = true` contribute to progress.

```text
completed required Tasks / total required Tasks
```

A Task is complete for Project progress only when `workflowState = COMPLETED`. `Task.status = ACTIONED` is not sufficient.

When no required Tasks exist, progress is `null` and the UI displays `No required work defined`.

### 3.5 Status and health are separate

Project status is human-controlled:

- `PLANNED`
- `ACTIVE`
- `ON_HOLD`
- `COMPLETED`
- `CANCELLED`

Health is derived for open Projects:

1. `BLOCKED` when required work is blocked or held by an incomplete dependency.
2. `OVERDUE` when the target date has passed or required work is overdue.
3. `AT_RISK` when a manager has recorded a risk reason or the target is close with substantial required work outstanding.
4. `ON_TRACK` otherwise.

Completed and cancelled Projects return no current health.

Blocker, overdue, and risk flags remain independently visible even when one primary health label is selected.

### 3.6 Human-controlled completion

Changing a Project to `COMPLETED` records `actualCompletedAt`.

If required Tasks are incomplete, blocked, or overdue, the API rejects completion unless the actor supplies:

- `completionOverride = true`
- a non-empty `completionReason`

The override and reason are written to Project audit history. Reopening a completed Project clears `actualCompletedAt` and is also audited.

### 3.7 Blockers and decisions

Projects do not introduce a duplicate blocker workflow.

- Task and TaskStep blocked state describes work that cannot proceed.
- A pending linked Request describes the decision, resource, approval, or answer needed.
- Task dependencies describe ordering constraints.

The Project summary combines these sources.

## 4. Data model

### 4.1 `Project`

Fields:

- `id`
- `wineryId`
- `title`
- `intendedOutcome`
- `businessContext`
- `status`
- `areaScope`: `ORGANISATION | AREAS`
- `ownerUserId`
- `createdBy`
- `updatedBy`
- `plannedStartAt`
- `targetEndAt`
- `actualCompletedAt`
- `riskReason`
- `riskReviewAt`
- `completionReason`
- `createdAt`
- `updatedAt`

Indexes:

- winery/status/target date
- winery/owner/status
- winery/area scope
- winery/updated date

### 4.2 `ProjectArea`

Fields:

- `projectId`
- `areaId`
- `wineryId`
- `relationshipType`: `PRIMARY | LINKED`
- timestamps

Constraints:

- unique `projectId + areaId`
- at most one primary area, enforced by service validation

### 4.3 `ProjectParticipant`

Fields:

- `projectId`
- `userId`
- `wineryId`
- `participationRole`: `PARTICIPANT | STAKEHOLDER`
- `notificationsEnabled`
- `addedBy`
- timestamps

Constraints:

- unique `projectId + userId`
- users must be active and belong to the same winery

### 4.4 `ProjectItem`

Fields:

- `projectId`
- `itemType`: `TASK | REQUEST | NOTICE | NOTE | CALENDAR_EVENT`
- `itemId`
- `wineryId`
- `isRequired`
- `isMilestone`
- `sortOrder`
- `addedBy`
- timestamps

Rules:

- `isRequired` is accepted only for Tasks.
- `isMilestone` is accepted only for Tasks and Calendar Events.
- the target must belong to the same winery.
- the linking actor must be allowed to manage the Project and view the target.
- deleting a membership never deletes the target item.

### 4.5 `ProjectTaskDependency`

Fields:

- `projectId`
- `blockingTaskId`
- `blockedTaskId`
- `wineryId`
- `createdBy`
- timestamps

Rules:

- both Tasks must be linked to the Project.
- a Task cannot depend on itself.
- duplicates are rejected or returned idempotently.
- adding an edge that creates a dependency cycle is rejected.
- removing a Task from a Project removes dependency edges involving it.

### 4.6 `ProjectAuditEvent`

Fields:

- `projectId`
- `wineryId`
- `actorUserId`
- `eventType`
- `beforeSnapshot`
- `afterSnapshot`
- `metadata`
- `createdAt`

Initial event types:

- `CREATED`
- `UPDATED`
- `STATUS_CHANGED`
- `OWNER_CHANGED`
- `DATES_CHANGED`
- `RISK_CHANGED`
- `PARTICIPANT_ADDED`
- `PARTICIPANT_REMOVED`
- `AREA_CHANGED`
- `ITEM_LINKED`
- `ITEM_UPDATED`
- `ITEM_UNLINKED`
- `DEPENDENCY_ADDED`
- `DEPENDENCY_REMOVED`
- `ATTACHMENT_ADDED`
- `ATTACHMENT_DELETED`
- `COMPLETED`
- `COMPLETION_OVERRIDDEN`
- `REOPENED`
- `CANCELLED`

The initial Project timeline guarantees Project lifecycle, membership, dependency, and attachment history. Existing child-item histories remain authoritative and are linked from the Project detail view rather than copied into a second source of truth.

## 5. Permission model

### 5.1 View authority

A same-winery user may view a Project when any of these is true:

- their role is `manager` or `admin`
- they are the Project owner, creator, or an explicit participant
- the Project is organisation-scoped
- the Project is area-scoped and they belong to at least one linked area

### 5.2 Manage authority

A user may manage a Project when:

- their role is `manager` or `admin`, or
- they manage every linked Project area through `UserAreaMembership.membershipRole = MANAGER`

The Project owner is selected from users who meet this coordination-authority rule. Ownership itself does not override linked Task, Notice, Request, Note, Calendar, customer, or attachment permissions.

### 5.3 Linked-item visibility

- Project detail resolves every linked item through its existing domain visibility policy.
- Hidden items never expose titles, bodies, owners, or dates.
- The response may include a `restrictedItemCount` so managers can recognise incomplete context without leaking it.
- Project participation is not an implicit grant to a linked item.

### 5.4 Mutation authority

- Only Project managers can edit Project fields, participants, areas, membership metadata, and dependencies.
- Existing domain services decide who may edit the linked item itself.
- Staff may use the Project as context and follow links to items they can already access.

## 6. API contract

All endpoints are mounted under `/api/projects` and use authenticated winery context.

### 6.1 Project lifecycle

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`
- `PATCH /api/projects/:id`

No hard-delete endpoint is provided. Cancellation preserves organisational memory.

List filters:

- `status`
- `health`
- `ownerUserId`
- `areaId`
- `search`
- `targetFrom`
- `targetTo`
- `sortBy`
- `page`
- `pageSize`

### 6.2 Participants

- `POST /api/projects/:id/participants`
- `PATCH /api/projects/:id/participants/:userId`
- `DELETE /api/projects/:id/participants/:userId`

### 6.3 Linked items

- `GET /api/projects/:id/items`
- `POST /api/projects/:id/items`
- `PATCH /api/projects/:id/items/:projectItemId`
- `DELETE /api/projects/:id/items/:projectItemId`
- `GET /api/projects/for-item?itemType=TASK&itemId=123`

`POST /items` accepts `itemType`, `itemId`, `isRequired`, `isMilestone`, and optional `sortOrder`.

Creating a new Task, Request, Notice, Note, or Calendar Event from the Project uses the existing authoritative create API, then adds the Project membership. The frontend reports a linking failure without deleting the successfully created source record and offers a retry.

### 6.4 Dependencies

- `GET /api/projects/:id/dependencies`
- `POST /api/projects/:id/dependencies`
- `DELETE /api/projects/:id/dependencies/:dependencyId`

### 6.5 Activity and attachments

- `GET /api/projects/:id/activity`
- existing `/api/attachments` endpoints accept `entityType = PROJECT`

### 6.6 Response summaries

List responses return compact summary values:

- status
- primary health
- progress percentage or `null`
- required/completed Task counts
- blocked count
- overdue count
- pending decision count
- upcoming milestone
- next action
- owner and areas

Detail responses additionally return visible typed items, participants, dependency state, upcoming Events, Project audit history, and `restrictedItemCount`.

## 7. Summary algorithms

### 7.1 Required progress

```text
required = linked Tasks where ProjectItem.isRequired
completed = required where Task.workflowState = COMPLETED
progress = null when required is empty, otherwise round(completed / required * 100)
```

Cancelled required Tasks remain visible as unresolved required work until a manager removes the requirement or records a completion override.

### 7.2 Blocked work

Blocked work includes:

- required Tasks with `workflowState = BLOCKED`
- required Tasks with unresolved predecessor dependencies

Task and TaskStep blocker reasons remain the detailed source.

### 7.3 Overdue work

An incomplete required Task is overdue when `dueAt < now`.

An open Project is past target when `targetEndAt < now`.

Both values are returned independently.

### 7.4 Pending decisions

Linked Requests with `status = PENDING` appear under pending decisions. The requested user and due date identify who must act next.

### 7.5 Upcoming work

Upcoming Events and milestone Tasks are sorted by their effective date. Past occurrences remain in the linked-item history but not the upcoming list.

### 7.6 Next meaningful action

Priority order:

1. an unresolved blocking dependency
2. an explicitly blocked required Task
3. an overdue pending Request
4. an overdue required Task
5. the next due pending Request
6. the next due required Task
7. the next milestone Event
8. no next action defined

The response identifies the source item type and ID so the UI can deep-link to the authoritative record.

## 8. Notifications

Use the existing in-app `SYSTEM` Notification type.

Notify:

- a newly assigned owner
- a newly added participant when notifications are enabled
- the owner when status or target date changes by someone else
- the owner when a required Task becomes blocked or overdue, through a later scheduled evaluation pass
- participants when a manager explicitly chooses `notifyParticipants` on a major Project update

Do not notify every participant for every linked-item edit. Notification data includes `projectId` and `href = /projects?projectId=<id>`.

## 9. Frontend experience

### 9.1 Navigation

Add `Projects` under Work after Queue. Preserve current top-level navigation density.

### 9.2 Project list

Display:

- title and intended outcome preview
- owner
- status and health
- progress
- target date
- primary area/participating areas
- blocker, overdue, and pending-decision counts
- next meaningful action

Filters use URL-compatible state where practical so Project views can be shared and restored.

### 9.3 Project creation

The required first step is deliberately small:

- title
- intended outcome
- owner
- area scope/areas
- status
- target date when activating

Business context and participants are optional. Operational items are added after the Project shell exists.

### 9.4 Project detail

The first screenful answers:

- What outcome are we pursuing?
- Who is accountable?
- Is it on track?
- What is blocked or overdue?
- Who must act next?
- What happens next?

Detailed sections:

- overview and editable Project fields
- progress and attention summary
- required Tasks
- other Tasks
- pending Requests
- upcoming Events and milestones
- Notices and Notes
- dependency list
- participants and areas
- attachments
- activity history

### 9.5 Item creation and linking

The Project page supports:

- searching visible existing objects by type
- linking and unlinking
- marking required/milestone state
- creating a minimal Task, Request, Notice, Note, or Event through existing API clients
- linking the newly created item immediately
- retrying the link if source creation succeeded but membership creation failed

### 9.6 Reverse navigation

A reusable Project links panel calls `GET /api/projects/for-item` and appears on Task, Notice, Request, Note, and Calendar detail surfaces as those surfaces are touched. It displays only Projects the viewer may access.

## 10. Test-first implementation sequence

### Phase 0: Blueprint and contracts

1. Add this plan.
2. Add Project scenarios to `TEST_PLAN.md`.
3. Add the proposed endpoint contract to `API_SPEC.md` before routes are implemented.
4. Define migration rollback and compatibility expectations.

Gate: documentation is internally consistent and introduces no changes to existing contracts.

### Phase 1: Domain persistence

Tests first:

- models synchronize in SQLite tests
- uniqueness constraints hold
- associations load owner, participants, areas, items, dependencies, and audit events

Implementation:

- migration for all Project tables and indexes
- Sequelize models and associations
- Winery/User/OperationalArea reverse associations
- add `PROJECT` to attachment entity validation and schema

Gate:

- model boot test passes
- migration syntax is valid
- existing model sync suites still pass

### Phase 2: Permissions and Project CRUD

Tests first:

- manager/admin create and manage Projects
- area manager manages only Projects wholly inside managed areas
- staff visibility follows organisation/area/participant rules
- cross-tenant direct reads return not found
- owner and participant IDs are same-winery active users
- activating requires an owner and target date
- completion guard and override semantics

Implementation:

- Joi schemas
- Project visibility and management policy
- Project service CRUD
- thin controller and routes
- Project audit writes

Gate:

- focused Project route integration suite passes

### Phase 3: Typed item membership and summaries

Tests first:

- link each supported item type
- reject cross-tenant and invisible targets
- validate required/milestone metadata
- unlink without deleting source
- hide invisible targets from Project detail
- calculate progress from `workflowState`
- derive blocked, overdue, pending decision, upcoming, health, and next-action summaries
- reverse item lookup is permission scoped

Implementation:

- typed resolver delegating to existing visibility services
- membership CRUD
- batched item loading and serialization
- summary derivation service
- list/detail response integration

Gate:

- membership and summary tests pass
- task status `ACTIONED` never falsely counts as completed

### Phase 4: Dependencies, activity, attachments, and notifications

Tests first:

- dependency endpoints require two linked Tasks
- direct and indirect cycles are rejected
- removing a Task membership removes dependency edges
- Project activity is immutable and ordered
- Project attachments enforce Project visibility/manage rules
- owner/participant notifications are scoped and de-duplicated where applicable

Implementation:

- dependency service and routes
- activity list route
- attachment resolution support
- significant-update Notification writes

Gate:

- dependency, attachment, notification, and audit tests pass

### Phase 5: Frontend API and Projects experience

Implementation:

- Project TypeScript types and API client
- Projects Work navigation
- paginated Project list with filters
- create/edit Project dialog
- Project detail overview and attention summary
- typed item picker and membership editor
- minimal linked-item creation workflows
- dependency editor
- participant editor
- attachments and activity timeline
- reverse Project links panel on supported item detail surfaces

Gate:

- frontend lint passes with zero new warnings
- production build passes
- responsive smoke checks at 375, 768, 1024, and 1440 pixel widths
- keyboard access works for dialogs, filters, item linking, and destructive confirmation

### Phase 6: Documentation and release verification

1. Update `ARCHITECTURE.md` and `DOMAIN_MODEL.md` with implemented truth.
2. Update `COMPONENTS.md`, `API_SPEC.md`, and `TEST_PLAN.md`.
3. Add Projects to README product shape and repository guidance.
4. Record migration and rollout notes.
5. Run focused tests, then full backend tests.
6. Run backend lint.
7. Run frontend lint and production build.
8. Review `git diff` for unrelated edits and secret exposure.

Gate: every acceptance criterion has implementation and verification evidence.

## 11. Rollout and compatibility

- Schema changes are additive.
- Existing operational objects require no backfill because Project membership is optional.
- No existing endpoint response is removed or renamed.
- New Project fields may be added to existing detail responses only through additive, permission-scoped properties.
- Completed and cancelled Projects remain searchable.
- Project hard deletion is intentionally absent.
- Initial rollout should use real examples such as a wine-club release, vintage preparation, and a compliance review.

## 12. Release acceptance checklist

- [x] Database migration and rollback are safe.
- [x] All Project models and associations load.
- [x] Manager, area-manager, staff, participant, and cross-tenant permission paths pass.
- [x] Project CRUD and lifecycle guards pass.
- [x] All five item types link and unlink safely.
- [x] Progress is based only on required Task workflow completion.
- [x] Health and attention indicators are explainable.
- [x] Dependencies reject cycles.
- [x] Project audit history covers all Project mutations.
- [x] Attachments inherit Project permissions.
- [x] Significant notifications are relevant and scoped.
- [x] Projects are reachable under Work.
- [x] List, creation, detail, item-linking, dependencies, participants, attachments, and activity UI are implemented.
- [x] Linked items provide reverse Project navigation on all five supported detail surfaces.
- [x] Backend focused and full tests pass.
- [x] Backend lint passes.
- [x] Frontend lint and build pass.
- [x] Architecture, domain, API, components, test, and README documentation match the live implementation.

## 13. Subsequent intelligence passes

After reliable Project usage data exists:

1. AI-assisted Project breakdown with human confirmation.
2. Suggested links between new operational items and existing Projects.
3. Evidence-based risk suggestions from overdue work, dependencies, and pending decisions.
4. Management summaries of changes, blockers, decisions, and deadlines.
5. Project templates and recurring Project cloning where real winery repetition justifies them.
6. Portfolio analytics for recurring bottlenecks, timing accuracy, and cross-area coordination.

These capabilities must remain advisory wherever they alter ownership, dates, visibility, completion, or business decisions.

## 14. Implementation record — 27 July 2026

### Delivered backend

- Added `Project`, `ProjectArea`, `ProjectParticipant`, `ProjectItem`, `ProjectTaskDependency`, and `ProjectAuditEvent` models and their winery/user/area/attachment associations.
- Added the additive `20260727000000-create-projects.js` migration. Its rollback removes Project attachment rows before narrowing the attachment enum, then removes Project tables in foreign-key-safe order.
- Added Joi contracts and `/api/projects` CRUD, participant, item, dependency, activity, and reverse-lookup routes.
- Added area-aware view/manage policy, typed source resolution, cross-tenant and child-visibility enforcement, simple dependency cycle detection, immutable audit writes, and scoped SYSTEM notifications.
- Added explainable summaries: required-Task progress, separately derived health, blockers, overdue work, pending decisions, milestones, upcoming Events, and deterministic next action.
- Added Project attachment authorization to the shared attachment service.
- Added permission-filtered Calendar `eventId` lookup so Project Event links open the authoritative event.

### Delivered frontend

- Added typed Project clients and models, Work navigation, filtered/paginated list, URL-addressable detail selection, and create/edit dialog.
- Added the outcome-first Project overview, health/progress/attention read model, linked item groups, required/milestone editing, source unlinking, participants, notification preferences, status changes, completion override, dependencies, files, and activity.
- Added minimal in-Project creation for Task, Request, Notice, Note, and Calendar Event. Each source is created through its existing client and normal domain policy. If linking fails after creation, the UI retains the source type/ID and offers a retry.
- Added permission-scoped reverse Project context to Task, Request, Note, Notice, and Calendar Event detail surfaces.
- Used breakpoint-specific layouts for 375, 768, 1024, and 1440 pixel classes: stacked mobile rows, two-column tablet summaries/forms, desktop list/detail split, and wide detail/sidebar split. The Work sub-navigation is intentionally horizontally scrollable on narrow screens.

### Verification evidence

- Focused Project route integration: 8 passing scenarios.
- Full backend regression: 49 suites and 264 tests passed on the final implementation state.
- Migration rehearsal: 1 passing SQLite up/down test, including cleanup of a Project attachment during rollback.
- Backend ESLint: passed.
- Syntax checks: all Project controller/service/migration files and the Calendar controller passed `node --check`.
- Frontend ESLint with zero warnings: passed.
- Next.js production build and TypeScript validation: passed; `/projects` is present in the generated route list.
- Responsive code audit: passed at the four planned layout breakpoints. The operational release pass below subsequently exercised and visually inspected the authenticated production frontend at desktop and mobile widths using a temporary local browser driver; no browser automation dependency was added to the repository.

### Operational rollout verification â€” 27 July 2026

- Confirmed the configured target before mutation: local MySQL development database `vinagent_dev` at `127.0.0.1:3306`. No staging or production database was changed.
- Captured a pre-migration MySQL dump outside the repository as `vinagent_dev-pre-projects-20260727-161502.sql` (341,195 bytes, SHA-256 `967AC4450CE030D2F8DCE839F87BD2EC25DD41BB58FF3B89A2005B42971B722A`).
- Applied `20260727000000-create-projects.js` successfully. A subsequent Sequelize status check reported the complete migration chain as `up`.
- Verified all six Project tables, their expected columns, indexes, and foreign keys in MySQL. Verified the Attachment `entityType` enum now includes `PROJECT`.
- Compared representative pre-existing row counts before and after migration: Wineries 22, Users 19, Tasks 20, Attachments 0, Notices 12, Calendar Events 2, Requests 0, and Notes 0. Every count was unchanged.
- Booted the real backend and optimized Next.js frontend. Used the backend's explicit non-production `mock-token` path for the browser session so no Firebase password or production auth configuration was changed.
- Passed an authenticated browser workflow that loaded Projects, created an active Project, set owner/outcome/context/dates, added and removed a participant, linked an existing Task, marked it required, observed 0% authoritative progress, exercised completion override with a reason, reopened the Project, edited context, searched to both matching and empty states, unlinked the borrowed Task, cancelled the QA Project, and reopened its deep link.
- The browser pass reported zero page/console errors, zero failed API responses, and zero failed local requests. Full-page desktop and mobile captures were visually inspected.
- The 375 px check identified a 62 px min-content overflow in the Project list column. Adding `min-w-0` to the list grid item and Project cards removed the overflow; the optimized frontend was rebuilt and the complete workflow then passed at both 1440 px and 375 px.
- Teardown removed the nine exact `[QA] Projects release ...` fixtures produced while refining the operational harness and their six QA notifications. All were cancelled, had no remaining participants/items/dependencies/attachments, and no non-QA Project or notification was removed. The local Projects table is empty after teardown.
- Temporary screenshots, diagnostic scripts, and the temporary browser driver were removed. The pre-migration database dump was retained in the system temporary directory for recovery during this release session.

### Deliberately deferred intelligence

AI-generated Project plans, inferred relationships, scheduled risk alerts, templates, portfolio analytics, and critical-path scheduling remain outside this release. The implemented data and audit layer is designed to support those additions after real winery usage provides evidence for them.

## 15. Sidewood demonstration portfolio â€” 27 July 2026

Run `npm run seed:sidewood:projects` after the base Sidewood seed. The command uses one database transaction, fills any missing demonstration relationships, and is safe to rerun without duplicating Projects, participants, links, dependencies, audit events, notifications, or supporting records.

The local Sidewood Estate dataset now includes:

| Project | Owner / lead | Demonstrated state | Key behavior |
| --- | --- | --- | --- |
| Winter Wine Club Release 2026 | Owen / Clare | Active, Blocked, 0% | Four participating areas, three required Tasks, two dependencies, four participants, a pending decision, a handover Note, Notice, and future Event milestone. This one Project exercises all five supported linked item types. |
| Private Member Dinner - August 2026 | Owen / Kirri | Active, At Risk, 0% | Cross-area hospitality outcome with explicit risk context, one required coordinating Task, supporting floor-plan work, run-sheet Notice, participants/stakeholders, and an Event milestone. |
| Cellar Door Weekend Service Lift | Serena / Jacob | Active, On Track, 0% | Single-area Project governed by Serena through her Cellar Door `MANAGER` membership and coordinated by Jacob, with roster Task, briefing Notice, and readiness Event. |
| Feast Dinner Close-out | Owen / none | Completed, 100% | Historical Project whose only required Task is authoritatively completed, retaining its past Event and full Project activity. |
| FY27 Leadership Priorities | Owen / Lisa | Planned, On Track, no percentage | Organisation-wide planning Project with optional Task/Notice context and no required work, demonstrating that progress remains unset until required Tasks exist. |
| Sidewood Festival Weekend 2026 | Owen / Kirri | Active, At Risk, 0% | Kirri leads Restaurant, Cellar Door, and Marketing delivery while reporting to Owen. Three `DELEGATED_WORK` Tasks are assigned to Kirri, Jacob, and Lara, alongside three area Notices and a Festival Event milestone. |

Supporting data added once by the Project seed consists of one pending approval Request, one operational handover Note, four future Calendar Events, and three Festival Tasks created through the authoritative Task creation service. Existing Sidewood Tasks, Notices, areas, users, memberships, and the Feast Dinner Event are reused rather than copied.

Verification after an idempotent rerun recorded six Projects, 15 area links, 18 participant links, 25 linked items, three delegated-work links, two dependencies, 58 Project audit events, and 19 scoped Project notifications. Kirri's Festival response grants `canManage` and `canDelegateTasks` while denying `canGovern`, scope, leadership, completion, and cancellation authority. Kirri can see all three delegated cross-area Tasks; the separately permissioned Calendar Event remains restricted, demonstrating that ordinary links still preserve child-record privacy.

## 16. Scoped Project Lead delegation extension — 27 July 2026

### Goal and authority model

The extension separates accountability from delivery coordination:

1. The existing `ownerUserId` remains the accountable owner and the person the lead reports to.
2. A nullable `leadUserId` identifies the person authorised to coordinate one specific Project.
3. `leadGrantedByUserId` and `leadGrantedAt` record who granted the authority and when.
4. Governance remains with winery managers/admins or an area manager who manages every Project area.
5. Lead authority exists only while the appointment is current and the Project is open.
6. The lead may coordinate delivery across participating areas without receiving organisational manager permissions in those areas.

### Implementation sequence and completion record

- [x] Add the reversible `20260727010000-add-project-lead-delegation` migration for leadership fields/index, audit events, and delegated-work link type.
- [x] Add `Lead` and `LeadGrantor` associations and serialize leadership provenance in list/detail responses.
- [x] Split `canGovernProject` from `canManageProject` and return authoritative per-Project permission flags to clients.
- [x] Permit the current lead to coordinate open Project fields, participants, linked-item metadata, dependencies, and attachments.
- [x] Protect owner, lead, participating areas, completion, cancellation, reopening, and completion overrides behind governance authority.
- [x] Add `PUT /api/projects/:id/lead` and `DELETE /api/projects/:id/lead` with active-user, winery, owner-separation, area-membership, and closed-Project checks.
- [x] Add `POST /api/projects/:id/tasks` for atomic cross-area Task delegation.
- [x] Validate that the receiving area participates in the Project and the assignee actively belongs to that area.
- [x] Create the Task through `taskCreation.service`, its Task-area placement, `DELEGATED_WORK` link, Task audits, Project `TASK_DELEGATED` audit, and notifications in one transaction.
- [x] Persist the accountable owner as the delegated Task creator and the lead as audit actor, preventing creator-based authority from surviving lead revocation.
- [x] Extend Task visibility/mutation only for the current lead and only for `DELEGATED_WORK`; leave `REFERENCE` links permission-neutral.
- [x] Add UI owner/lead/reporting presentation, governance-locked editor controls, server-issued permission handling, receiving-area/assignee Task controls, and delegated-work labels.
- [x] Extend `/api/users` with all `areaIds` so the UI can filter assignees to the selected receiving department.
- [x] Add integration coverage for appointment, delivery editing, governance denials, area/assignee validation, delegation, audit/notification state, Task visibility, and revocation.
- [x] Add migration up/down coverage, including removal of new audit values before enum rollback.
- [x] Apply the migration locally after a fresh database backup and seed the six-example Sidewood portfolio twice to prove rerun safety.

### Operational rollout

1. Back up the target database.
2. Run `npm run db:migrate`; do not use schema sync in a deployed environment.
3. Deploy backend and frontend from the same release so UI permission flags match the new server contract.
4. Optionally run `npm run seed:sidewood:projects` in the Sidewood demonstration tenant.
5. Confirm a governing manager can appoint/revoke a lead, a lead can delegate only to members of participating areas, and the lead cannot close or re-scope the Project.
6. Confirm revocation removes cross-area access to delegated Tasks while preserving the Tasks, assignee access, audits, and notifications.

The local pre-migration backup is `C:\Users\pc\AppData\Local\Temp\vinagent-before-project-leads-20260727-211015.sql`. It is a temporary operational artifact and is intentionally not part of the repository.

Final verification passed after the delegation extension: all 49 backend suites and 266 tests, backend and frontend ESLint, the optimized Next.js production build with TypeScript validation, migration status, `git diff --check`, and an idempotent second Sidewood seed run. The applied migration is reported `up` in the local development database.

## 17. Personal Projects on Home — 28 July 2026

Home now requests open Projects with `involvement=me` and separates active/on-hold work from planned work. Personal involvement is deliberately narrower than visibility: it includes accountable ownership, Project leadership, participant/stakeholder membership, and assignment to a `DELEGATED_WORK` Task, but not manager or area visibility by itself. Each card explains the relationship and shows health/status, progress, outcome, participating areas, relevant date, next action, and a deep link to the permission-checked Project detail.

The Project list response now includes caller-specific `involvement.roles`, `primaryRole`, and `delegatedTaskCount`; `status=open` provides the planned/active/on-hold lifecycle set used by Home. No database migration was required. Final verification passed with 49 backend suites and 267 tests, backend and frontend ESLint, and the optimized Next.js production build with TypeScript validation.
