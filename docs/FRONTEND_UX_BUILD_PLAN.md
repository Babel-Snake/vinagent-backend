# Frontend UX, Navigation, and Product Polish Build Plan

Assessment date: 2026-07-14.

Status: implementation in progress. This document remains the source plan; the record below captures completed and intentionally deferred work.

Audience: coding agents and engineers improving the VinAgent dashboard.

## Implementation Record — 2026-07-14

### Completed in the current delivery

| Ticket | Delivered code | Evidence |
| --- | --- | --- |
| UX-001 | Added `TaskListResponse` and `fetchTaskPage`, retained the compatibility `fetchTasks` helper, and added shared page controls to the Work queue. Page and page-size state are retained in the URL without discarding existing deep links. | Targeted Task and Notice API pagination integration tests pass; frontend lint and production build pass. |
| UX-002 | Added `GET /api/tasks/summary`, which reuses the list visibility/filter policy and returns queue-wide counts for all Queue signals. The Queue now uses those exact counts rather than page-derived values. | New queue-summary integration test passes. |
| UX-003 | Home task and notice metrics now use API `pagination.total`; short attention lists remain deliberately capped display lists rather than totals. | Frontend production build passes. |
| UX-004 | Noticeboard now requests its selected page, resets to the first page when filters change, and provides shared page-size and previous/next controls. | Targeted Notice pagination integration test passes; frontend production build passes. |
| UX-011/UX-012 | Replaced the eleven-link route strip with Home, Work, Noticeboard, Calendar, Customers and Insights. Work has a desktop menu and mobile drawer; terminology now uses Work queue, All activity, Operational memory, Noticeboard, Insights, and Intake review. | Frontend lint and production build pass. |
| UX-013 | Added Work subnavigation on Queue, All activity, Requests, Notes, and Intake pages. | Frontend production build passes. |
| UX-020/UX-021 | Added `operationalPresentation` for readable operational labels and guided Quick capture. Requests/Notes expose human-readable subtype choices, preserve manual entry, and move focus to review after analysis. Home, Calendar, task links, Intelligence signal summaries, workflow chips, integration states, generated task context, and advanced task activity now apply staff-facing labels rather than exposing machine values. | Frontend lint and production build pass. |
| UX-022/UX-043 (partial) | Added focus-trapping `Dialog` and reusable `ConfirmDialog` foundations. Request approval/rejection collects an in-context response and requires a rejection reason; workflow-step completion gathers an optional handover note; Create Task, Notice forms, Calendar events, Notice archive/comment/attachment deletion, Customer, Staff, Login, legacy TaskCard, and Winery product/contact/policy/FAQ/booking/area/integration flows now keep validation, errors, and confirmation in context. Customer, Staff, and Create Staff modal layouts now run on the shared dialog primitive, gaining focus trapping, escape/backdrop close, scroll lock, and focus return without changing their established visual content. Task-card workflow, outcome, communication, relationship, and customer-match failures are now reported in its dismissible in-context error surface. Winery overview, brand, profile, and integration forms now show in-surface save status. A source audit finds no native browser `alert`, `confirm`, or `prompt` calls outside `ConfirmDialog` internals. | Frontend lint and production build pass. |
| UX-023 | Replaced raw task and notice ID fields with searchable relationship pickers. `TaskLinkPicker` supports Noticeboard and Intake review; `NoticeLinkPicker` supports task-to-notice relationships. Both search recognisable context first, retain exact-ID support, exclude existing links, and expose keyboard-accessible results. | Frontend lint and production build pass. |
| UX-024 | Task summary cards now have a real keyboard-operable open control, preserve a separate flag control, and remove duplicate routine category/priority/deadline pills. | Frontend lint and production build pass. |
| UX-032/UX-033/UX-034/UX-035/UX-040 (partial) | Added shared focus treatment and 44px control minimums, native Calendar task/notice controls, bounded Calendar sizing, mobile Customer cards, and consistent burgundy/teal calendar event treatment. | Frontend lint and production build pass. |
| UX-050/UX-051/UX-052 | Insights now exposes URL-preserved Overview, Operations, Customers & revenue, Team, and Intelligence views. Overview has six leading metrics; intelligence review remains in Insights while intelligence controls move to Winery configuration. Winery configuration now uses grouped General, Operations, Team, and System navigation. | Frontend lint and production build pass. |

### Still required before calling the full plan complete

1. Execute the role, device, zoom, keyboard, focus-return, and test-data manual matrix in Phase 7. Follow `docs/FRONTEND_QA_RUNBOOK.md`, including Customer, Staff, and Create Staff dialogs, relationship pickers, destructive actions, and a representative task workflow; automated lint/build cannot prove runtime layout or focus behavior.

## 1. Purpose

This plan turns the current frontend review into a sequenced implementation brief. It defines:

* the product experience VinAgent should deliver
* the target information architecture and terminology
* the correctness issues that must be fixed before visual polish
* the exact frontend and backend areas likely to change
* implementation guidance and compatibility constraints
* acceptance criteria and verification steps for every workstream

The plan is intentionally grounded in the current repository. An implementing agent should not reinterpret it as a greenfield redesign.

## 2. Product Goal

VinAgent is an AI-assisted operations platform for winery teams. Its primary product loop is:

`inbound message -> triage -> task/case -> guided staff action -> optional automation -> customer follow-up -> audit trail`

Tasks remain the primary action engine. Notices, Requests, Notes, Intake events, Customers, Calendar, Analytics, and Winery configuration support that engine.

The frontend should therefore optimize for five questions:

1. What needs my attention now?
2. What action should I take next?
3. What customer, conversation, and operational context do I need?
4. What has already happened, and who owns the next step?
5. Where should I record or find non-task operational knowledge?

The UI should not require staff to understand database objects, enum values, or integration internals before they can answer those questions.

## 3. Current Assessment

### 3.1 What should be preserved

The following parts of the current experience are directionally correct and should not be discarded:

* the attention-led Home page
* the task detail organization into Work, Customer, Conversation, Files & Links, Outcome, and Activity
* the warm off-white, burgundy, sage, and teal palette
* restrained surfaces, borders, radii, and shadows
* role-aware navigation and winery scoping
* visible waiting, blocked, overdue, identity-review, and follow-up states
* progressive disclosure for advanced filters
* clear empty, error, and loading states on the newer screens
* the unified Operations feed as searchable operational memory

### 3.2 Current product risks

The most important problems are not decorative:

* the Tasks API defaults to 20 records, but the frontend discards pagination metadata and provides no page controls
* Home metrics are derived from capped result arrays and can appear to be complete totals
* Noticeboard reports that more records exist without providing navigation to later pages
* manager/admin navigation can contain eleven top-level items
* Operations and Tasks compete semantically, while the Tasks heading is currently "Operations queue"
* Requests and Notes expose raw operational subtype values and use native browser prompts for decisions
* several primary click targets are not keyboard-operable
* modal focus handling and Escape behavior are inconsistent
* Customers and Calendar do not adapt cleanly to smaller screens
* legacy indigo/blue controls and native browser alerts make older configuration areas feel separate from the newer design
* Analytics is comprehensive but lacks a clear hierarchy between executive summary, operational diagnosis, customer reporting, and intelligence configuration

### 3.3 Review baseline

At the time of this assessment:

* `npm run lint` passes in `frontend/`
* `npm run build` passes in `frontend/`
* the live login screen was visually inspected at desktop size
* authenticated dashboard screens were reviewed from their implemented layouts and interaction paths because no test login was supplied

Every implementation phase must keep lint and build green.

## 4. Product and Design Principles

Use these principles to resolve details that are not explicitly covered later:

1. **Attention before inventory.** Put overdue, blocked, waiting, unassigned, mentioned, and acknowledgement-required work before general record counts.
2. **Human language before taxonomy.** Display "Stock and supplies" rather than `STOCK_SUPPLIES`; raw values remain API concerns.
3. **One clear home for each intent.** Queue work, operational memory, communication, scheduling, customers, insights, and settings must be predictable destinations.
4. **Progressive disclosure.** Show the next decision and essential metadata first; advanced filters and implementation details remain available but secondary.
5. **Text plus color.** Color may reinforce status but must never be the only status indicator.
6. **Calm operational atmosphere.** Preserve the warm winery-adjacent palette. Do not introduce decorative vineyard photography or luxury styling that competes with work.
7. **Role-aware without being mysterious.** Hide unauthorized actions, but clearly explain read-only access and unavailable configuration where relevant.
8. **URLs are product contracts.** Preserve current route paths and deep links unless a separate migration is explicitly approved.
9. **Accurate numbers only.** A value presented as a total must come from pagination metadata or an aggregate endpoint, never from a capped page array.
10. **Keyboard and mobile are first-class.** A staff member must be able to navigate and act without a mouse, and common work must remain usable on a tablet or phone.

## 5. Target Information Architecture

### 5.1 Primary navigation

The target manager/admin navigation is:

* Home
* Work
* Noticeboard
* Calendar
* Customers
* Insights
* notification control
* profile/settings control

`Work` is a grouped navigation control, not a new required route. Its default destination is `/tasks`.

The Work group contains:

* Queue -> `/tasks`
* All activity -> `/operations`
* Requests -> `/requests`
* Notes -> `/notes`
* Intake -> `/integration-events` for manager/admin users

Winery configuration moves out of the crowded primary row and becomes a clearly labelled Settings/Winery configuration action near the profile control. Users with `canAccessWineryConfig` must still be able to reach it in one interaction.

Staff navigation follows the same structure but omits unauthorized Customers, Insights, Intake, and configuration destinations.

### 5.2 Route and terminology map

| Current route | Target navigation label | Target page title | Group | Access |
| --- | --- | --- | --- | --- |
| `/home` | Home | Home | Primary | All signed-in users |
| `/tasks` | Queue | Work queue | Work | All signed-in users |
| `/operations` | All activity | Operational memory | Work | All signed-in users |
| `/requests` | Requests | Requests | Work | All signed-in users subject to existing visibility |
| `/notes` | Notes | Notes | Work | All signed-in users subject to existing visibility |
| `/integration-events` | Intake | Intake review | Work | Manager/admin |
| `/noticeboard` | Noticeboard | Noticeboard | Primary | All signed-in users |
| `/calendar` | Calendar | Calendar | Primary | All signed-in users |
| `/customers` | Customers | Customers | Primary | Manager/admin |
| `/analytics` | Insights | Insights | Primary | Manager/admin |
| `/winery` | Winery configuration | Winery configuration | Profile/settings | Authorized users |
| `/staff` | No primary item | Staff & Access | Winery configuration | Preserve route compatibility |

Use "Noticeboard" consistently. Do not use the mixed-case label "NoticeBoard".

### 5.3 Responsive navigation behavior

Desktop, at the final breakpoint selected during implementation:

* show the compact primary destinations in one row
* open Work as an accessible menu
* keep notifications and profile/settings visible
* show the active Work state for every Work child route

Tablet and mobile:

* replace the horizontally scrolling route strip with a Menu button and navigation drawer/dialog
* group Work children beneath a visible Work heading
* show the current destination and active group
* retain notification and profile access without consuming a second horizontal navigation row

Do not solve overflow by shrinking link text until it becomes difficult to scan.

## 6. Execution Rules for Implementing Agents

Before changing code, the implementing agent must:

1. Read `README.md`, `docs/AGENT_GUIDE.md`, `docs/ARCHITECTURE.md`, `docs/ENGINEERING_GUIDE.md`, `docs/COMPONENTS.md`, `docs/TEST_PLAN.md`, and this document.
2. Read `docs/API_SPEC.md` and `docs/DOMAIN_MODEL.md` before changing task, notice, analytics, or auth contracts.
3. Inspect `git status` and preserve unrelated or pre-existing work.
4. Work through the phases below in order. Do not combine all phases into one unreviewable change.
5. Add or update tests before backend behavior changes, as required by `docs/AGENT_GUIDE.md`.
6. Keep existing route paths and query-string deep links working.
7. Avoid new dependencies unless the user explicitly approves them.
8. Update `docs/API_SPEC.md`, `docs/COMPONENTS.md`, and frontend documentation when implemented behavior changes.

Each phase should be independently buildable, reviewable, and reversible.

## 7. Delivery Sequence

| Phase | Goal | Priority | Depends on |
| --- | --- | --- | --- |
| 1 | Correct list reachability and counts | Release-critical | None |
| 2 | Simplify navigation and terminology | High | Phase 1 preferred, not technically required |
| 3 | Polish Work, Requests, Notes, and linking flows | High | Phase 2 terminology |
| 4 | Responsive and accessibility foundation | High | Phase 2 navigation |
| 5 | Visual-system consolidation and secondary screens | Medium | Phase 4 primitives |
| 6 | Analytics and configuration hierarchy | Medium | Phase 2 terminology and Phase 5 styling |
| 7 | End-to-end verification and trial sign-off | Release-critical | All selected phases |

## 8. Phase 1: Correct List Reachability and Counts

### UX-001: Preserve and expose Task pagination

**Problem**

`GET /api/tasks` already returns `{ tasks, pagination }`. `frontend/lib/taskApi.ts` returns only `result.tasks`, while the backend defaults to a page size of 20. The queue has no page navigation.

**Files to inspect or update**

* `frontend/lib/taskApi.ts`
* `frontend/lib/taskTypes.ts`
* `frontend/lib/coreTypes.ts`
* `frontend/lib/api.ts`
* `frontend/app/(dashboard)/tasks/page.tsx`
* `frontend/components/TaskFilters.tsx`
* new shared pagination component under `frontend/components/` or `frontend/components/ui/`
* `src/controllers/task.controller.js` and `src/services/taskQueryPolicy.service.js` for contract confirmation only
* relevant task route tests if backend behavior changes

**Implementation**

1. Define or reuse a generic pagination type with `page`, `pageSize`, `total`, and `totalPages`.
2. Add a `TaskListResponse` type containing `tasks` and `pagination`.
3. Introduce `fetchTaskPage(filters)` that returns the full response.
4. Retain `fetchTasks(filters)` temporarily as a compatibility wrapper returning only `tasks` for call sites that intentionally need a capped list.
5. Change the Tasks page to use `fetchTaskPage`.
6. Add explicit `page` and `pageSize` state. Default page size should be 20 unless product testing establishes another value.
7. Send `page` and `pageSize` to the API.
8. Reset `page` to 1 whenever any filter other than page/page size changes.
9. Add a footer showing `Showing X-Y of Z tasks`, current page, Previous, and Next controls.
10. Disable Previous/Next correctly and retain the current filters when paging.
11. Prefer reflecting `page` in the URL so browser Back/Forward and copied links preserve list position. Do not overwrite `taskId`, `mentionedMe`, or existing filter query parameters.
12. When a task modal closes, return to the same filtered page instead of always replacing the URL with plain `/tasks`.

**Acceptance criteria**

* With 21 matching tasks and a page size of 20, the twenty-first task is reachable through Next.
* Searching and advanced filters operate across all matching server records.
* Changing a filter on page 2 returns the user to page 1.
* Opening and closing a task preserves list filters and page.
* Notification deep links such as `/tasks?taskId=123&expandNotes=1` still open the intended task.
* Empty results display an empty state, not an invalid pagination footer.

### UX-002: Replace page-derived queue metrics with accurate information

**Problem**

The nine queue metrics are calculated from the currently loaded page. They visually read as queue-wide totals even though they may represent only 20 records.

**Recommended implementation**

Use a two-part treatment:

1. Always show `pagination.total` as the exact number of results for the current filters.
2. Replace the nine large tiles with a compact `Queue overview`/quick-filter region backed by exact aggregate data.

The recommended additive API is:

`GET /api/tasks/queue-summary`

Suggested response:

```json
{
  "summary": {
    "pendingTotal": 0,
    "highPriority": 0,
    "waiting": 0,
    "blocked": 0,
    "unassigned": 0,
    "overdue": 0,
    "dueSoon": 0,
    "identityReview": 0,
    "followUps": 0
  }
}
```

**Backend files**

* `src/routes/task.routes.js`
* `src/controllers/task.controller.js`
* new focused service such as `src/services/taskQueueSummary.service.js`
* existing record-visibility and task-query policy services
* `src/tests/integration/task.routes.test.js`
* a focused unit test if aggregation logic is extracted into pure helpers
* `docs/API_SPEC.md`

**Backend rules**

* apply the same winery and record-visibility boundaries as task listing
* default all summary values to the visible pending queue where appropriate
* define `overdue` and `dueSoon` through the existing deadline service rather than new date heuristics
* detect identity review and follow-up with the same semantics as the task list and analytics layers
* allow only the small set of scope parameters needed for the overview, initially `areaId` and `assigneeId`
* do not make summary counts silently depend on free-text search or unrelated advanced filters; label the section as a queue overview

**Frontend files**

* `frontend/lib/taskApi.ts`
* `frontend/lib/taskTypes.ts`
* `frontend/app/(dashboard)/tasks/page.tsx`
* optional `frontend/components/QueueOverview.tsx`

**Frontend behavior**

* render overview values as compact, actionable filter chips or small metrics
* clicking Overdue, Blocked, Unassigned, or another supported item applies the corresponding list filter
* show active state and provide a clear way to remove the applied quick filter
* do not render duplicate overdue or priority information elsewhere merely for decoration

**Fallback if an API addition is not approved**

Remove the page-derived metric values. Keep non-count quick-filter buttons and the exact filtered result total. Do not relabel page counts as totals.

**Acceptance criteria**

* summary numbers remain correct when more than one task page exists
* staff see only summary counts for records they are authorized to view
* clicking an overview item produces a list whose pagination total agrees with the selected concept

### UX-003: Correct Home totals while keeping lists intentionally short

**Problem**

Home fetches capped Task lists and displays array lengths as totals. `taskFocus` is explicitly capped at eight but is also shown as a metric.

**Files**

* `frontend/app/(dashboard)/home/page.tsx`
* `frontend/lib/taskApi.ts`
* `frontend/lib/noticeApi.ts`
* associated types

**Implementation**

1. Use `fetchTaskPage` for assigned, mentions, overdue, due soon, high priority, and unassigned queries.
2. Continue requesting only the number of rows needed to compose the page.
3. Use each response's `pagination.total` for metric totals.
4. Use `fetchNotices(...).pagination.total` for the Notice metric.
5. Remove the `Focus` metric or rename it to `Shown` only if testing proves that value useful. Preferred: remove it because it measures the presentation cap, not workload.
6. Keep the combined Priority work list capped at eight and Mentions capped at five.
7. If a count is larger than the displayed list, make the section link state this naturally, for example `View all 27`.
8. Prefer no more than six Home metrics at the largest breakpoint. Recommended manager metrics are Overdue, Due soon, Unassigned, Mentions, Notices, and Upcoming. Staff should not see manager-only workload values.

**Acceptance criteria**

* a total of 27 overdue tasks displays as 27 while only the top relevant rows are rendered
* no Home metric is silently capped at 8 or 20
* role-specific metrics and links still point to valid filtered queues

### UX-004: Add Noticeboard pagination

**Problem**

Noticeboard stores pagination metadata and displays `Showing X of Y`, but has no page controls. The API defaults to 50 notices.

**Files**

* `frontend/app/(dashboard)/noticeboard/page.tsx`
* `frontend/lib/noticeApi.ts`
* `frontend/lib/noticeTypes.ts`
* shared pagination component created under UX-001

**Implementation**

1. Add page/page-size state or include it in Notice filters.
2. Pass page and page size to `fetchNotices`.
3. Reset page to 1 when filters change.
4. Render the shared pagination footer.
5. Preserve `noticeId` deep links when updating page/filter query parameters.
6. When a notice is archived or created and the current page becomes invalid, move to the nearest valid page.

**Acceptance criteria**

* the fifty-first matching notice is reachable
* the footer reports an accurate visible range and total
* direct links to a notice load the notice even when it is not present on the current page

### Phase 1 verification gate

Run:

```bash
npm test -- --runInBand
cd frontend
npm run lint
npm run build
```

Manually verify Tasks and Noticeboard with datasets of 0, 1, 20, 21, 50, and 51 records.

## 9. Phase 2: Navigation and Terminology

### UX-010: Centralize navigation configuration

**Files**

* `frontend/components/Navbar.tsx`
* new `frontend/lib/navigation.ts` or `frontend/components/navigation/navigationConfig.ts`
* `frontend/components/ProfileDropdown.tsx`
* `frontend/app/(dashboard)/layout.tsx`

**Implementation**

1. Move labels, routes, group membership, icons, and permission predicates into one typed navigation configuration.
2. Model Work as a parent with child destinations.
3. Keep active-route detection centralized, including all Work children.
4. Keep authorization based on the current profile fields already used by Navbar.
5. Add Winery configuration to the profile/settings area for authorized users.
6. Do not remove authorization checks merely because a destination leaves the main row.

**Acceptance criteria**

* navigation visibility matches the current manager/admin/staff behavior
* adding or renaming a destination requires changing one configuration source
* Work is active on Queue, All activity, Requests, Notes, and Intake

### UX-011: Build accessible desktop and mobile navigation

**Suggested component structure**

* `frontend/components/navigation/DesktopNavigation.tsx`
* `frontend/components/navigation/WorkMenu.tsx`
* `frontend/components/navigation/MobileNavigation.tsx`
* keep `Navbar.tsx` as the orchestration shell

The exact split may be adjusted if these components would remain very small.

**Desktop behavior**

* compact primary links fit at 1024, 1280, and 1440 widths
* Work opens through a button with `aria-expanded`, `aria-controls`, and a labelled menu
* menu supports Enter, Space, Escape, arrow-key navigation where practical, outside click, and focus return
* Winery context, notification, and profile controls remain visible without overlapping navigation

**Mobile behavior**

* use a Menu button and drawer/dialog below the desktop breakpoint
* use the shared accessible dialog foundation from Phase 4 if already available; otherwise implement the minimum focus/Escape behavior here and consolidate later
* list Work children together and show role-appropriate links
* close the drawer after navigation
* prevent background scroll while open

**Acceptance criteria**

* no horizontal page overflow at 375, 768, 1024, 1280, or 1440 pixels
* every destination can be reached using keyboard only
* the active destination is visually and programmatically identifiable
* the mobile experience has no horizontally scrolling strip of eleven route chips

### UX-012: Rename page headings without breaking routes

**Files**

* `frontend/app/(dashboard)/tasks/page.tsx`
* `frontend/app/(dashboard)/operations/page.tsx`
* `frontend/app/(dashboard)/integration-events/page.tsx`
* `frontend/app/(dashboard)/noticeboard/page.tsx`
* `frontend/components/Navbar.tsx` or centralized navigation config
* any page metadata added later

**Required wording**

* `Operations queue` -> `Work queue`
* Operations navigation -> `All activity`
* Operations page title -> `Operational memory`
* `NoticeBoard` -> `Noticeboard`
* Analytics navigation/title -> `Insights`
* Intake page title -> `Intake review`

Keep task domain language inside detail views where "task" and "case" remain meaningful.

### UX-013: Add Work-level orientation

Create a compact Work subnavigation used on Work child pages:

* Queue
* All activity
* Requests
* Notes
* Intake when authorized

Suggested file:

* `frontend/components/navigation/WorkSubnav.tsx`

This component should use links, preserve accessibility, collapse or scroll in a clearly signposted way on narrow screens, and never repeat global branding.

**Acceptance criteria**

* users can explain the difference between Queue and Operational memory from the page labels and descriptions
* all Work objects are reachable from within the Work area
* current URLs and inbound links remain valid

## 10. Phase 3: Work and Capture Experience

### UX-020: Replace raw operational taxonomy with presentation mappings

**Problem**

Requests, Notes, activity cards, and other newer surfaces can expose enum values such as `STOCK_SUPPLIES`.

**Files**

* new `frontend/lib/operationalPresentation.ts`
* `frontend/components/OperationalItemPage.tsx`
* `frontend/app/(dashboard)/operations/page.tsx`
* `frontend/components/OperationalCollaborationPanel.tsx`
* relevant integration review components

**Implementation**

1. Add explicit value-to-label maps for operational item type, subtype, status, priority, area scope, mapping source, and review state.
2. Add one safe formatter for unknown future enum values: replace underscores, lowercase, and sentence-case.
3. Keep raw values in API requests and form state; apply labels only at the presentation boundary.
4. Replace free-text subtype fields with selects or comboboxes populated from defined options.
5. Allow AI to suggest a subtype, but require the human to see and confirm a readable label.

**Acceptance criteria**

* no primary staff-facing screen displays underscore-separated enum values
* unknown future values remain readable rather than blank

### UX-021: Turn Quick capture into a guided review flow

**Current component**

* `frontend/components/OperationalItemPage.tsx`

**Target flow**

1. Capture: user writes the request or note in natural language.
2. Analyse: VinAgent suggests object type, title, subtype, details, area, and priority where relevant.
3. Review: a concise form displays populated, editable human-readable fields.
4. Confirm: user creates the Request or Note.

**Implementation details**

* do not show an empty full metadata form before analysis unless the user chooses `Enter manually`
* make `Enter manually` explicit and keep it available when AI is unavailable
* preserve the user's original text if analysis fails
* explain cross-type suggestions without blocking the user's chosen object: `VinAgent thinks this may be a Note. Continue as Request` is preferable to raw confidence output alone
* display confidence as secondary information; the recommended next action is primary
* use inline errors near invalid fields
* disable only the action currently unavailable, not the entire capture region

**Acceptance criteria**

* a staff member can create a basic Request or Note without knowing a subtype code
* AI failure leaves a usable manual path
* keyboard focus moves to the review heading after successful analysis

### UX-022: Replace browser prompts and alerts in operational flows

**Priority flows**

* Request approve/reject response in `OperationalItemPage.tsx`
* workflow-step completion notes in `frontend/components/task-card/TaskWorkflowStepCard.tsx`
* task creation validation in `frontend/components/CreateTaskModal.tsx`
* notice creation/link/acknowledgement in `frontend/app/(dashboard)/noticeboard/page.tsx`
* calendar create/update/delete in `frontend/components/Calendar/EventModal.tsx`

**Implementation**

* use the shared Dialog/ConfirmDialog and inline feedback components defined in Phase 4
* Request approval response is optional; rejection reason should be required unless backend policy says otherwise
* step completion notes should appear inline with the step action or in a labelled dialog
* form validation errors should be visible inside the active modal and focus the first invalid field
* successful saves should use a consistent transient success notice or an in-context saved state

Do not mechanically replace `alert()` with a custom modal that has the same disruptive behavior. Prefer field-level feedback and non-blocking status where possible.

### UX-023: Make entity linking searchable

**Problem**

Several flows require raw numeric IDs:

* Notice -> Task linking
* Task -> Notice linking
* operational relation linking

**Files**

* `frontend/app/(dashboard)/noticeboard/page.tsx`
* `frontend/components/task-card/TaskFilesPanel.tsx`
* `frontend/components/OperationalCollaborationPanel.tsx`
* `frontend/components/CalendarEventPicker.tsx` as an existing pattern to review
* relevant APIs in `frontend/lib/`

**Implementation**

Create a reusable accessible entity picker or small type-specific pickers:

* search by title, customer, task number, or visible context
* display type, title, status, area, and ID as supporting metadata
* debounce requests
* exclude already-linked records
* support keyboard selection and Escape
* keep an optional exact-ID search path for expert users without making raw ID the only path

If the backend lacks a scoped search endpoint for a required entity, add an additive, permission-aware endpoint with tests and update `docs/API_SPEC.md`.

### UX-024: Reduce Task summary-card duplication

**File**

* `frontend/components/TaskSummaryCard.tsx`

**Keep visible**

* task/case title and ID
* customer/requester
* concise summary
* assignee
* due state
* next step or blocked reason
* primary status and exceptional workflow state
* at most three exceptional badges such as Overdue, Identity review, or Follow-up

**Remove or consolidate**

* repeated overdue labels
* priority shown simultaneously as border, label, and pill
* routine category/status pills that compete with actionable exceptions

**Interaction structure**

The entire non-action content should use a real link or button to open the task. Do not leave `onClick` on a non-focusable `<article>`. The flag action must remain a separate valid interactive element, not nested inside another button.

**Acceptance criteria**

* cards can be opened with keyboard and expose a useful accessible name
* scanning 10 cards makes differences in due state, ownership, and next action obvious
* the card does not repeat the same state in multiple visual treatments

### UX-025: Preserve the Task detail information architecture

The current Task detail section model is strong. Do not flatten it into one long form.

Improve it only by:

* using the shared accessible modal shell
* ensuring the active section remains visible after data refreshes
* preserving scroll position where safe
* providing visible saved/saving/error feedback within the active section
* keeping mobile section navigation keyboard- and touch-friendly
* reducing raw enum wording through shared presentation maps

## 11. Phase 4: Responsive and Accessibility Foundation

### UX-030: Create small shared UI foundations

Do not launch a full design-system rewrite. Add only primitives required by this plan and migrate components as they are touched.

Recommended primitives:

* `PageHeader`
* `Button` variants or disciplined existing button classes
* `Badge`
* `Pagination`
* `Dialog`
* `ConfirmDialog`
* `InlineAlert`
* `EmptyState`
* `LoadingState`

Suggested location:

* `frontend/components/ui/`

If the project prefers CSS classes over React wrappers for simple controls, keep `.btn-primary`, `.btn-secondary`, and `.form-control`, but centralize behavior-heavy elements such as Dialog and Pagination as components.

### UX-031: Build an accessible Dialog foundation

**Required behavior**

* `role="dialog"` and `aria-modal="true"`
* labelled title through `aria-labelledby`
* optional description through `aria-describedby`
* focus moves into the dialog on open
* Tab and Shift+Tab remain within the dialog
* Escape closes when safe
* focus returns to the opening control on close
* background scrolling is locked
* backdrop click is configurable and disabled for destructive or unsaved forms when appropriate
* close control has a useful accessible name

**Migration order**

1. mobile navigation
2. Task detail
3. Request decision dialog
4. Notice detail/form
5. Calendar event dialog
6. Create Task
7. Customer and Staff dialogs
8. Winery configuration confirmations

### UX-032: Fix primary keyboard gaps

**Known locations**

* Task summary card open action
* Calendar task/notice markers currently implemented as `span role="button"`
* clickable search suggestions and entity-picker results
* dropdown menus and mobile navigation
* tab-like Winery and Task section navigation

**Implementation**

* use native `button`, `a`, `input`, and `select` elements wherever possible
* do not rely on `role="button"` when a button element works
* provide visible focus styles using the accent color
* maintain logical focus order
* announce important async updates with `aria-live="polite"`; use assertive announcements sparingly for blocking errors

### UX-033: Make page headers and metrics responsive

**Files**

* `frontend/app/globals.css`
* all pages using `.page-header`
* Home, Tasks, Noticeboard, Customers, and Analytics metric grids

**Implementation**

* page headers stack title/description above actions on narrow screens
* header actions wrap without reducing tap targets below 44 CSS pixels where practical
* metric groups use two columns on small screens and avoid orphaned final rows at large breakpoints
* reduce metric count rather than forcing nine tiny equal columns
* prevent long winery names and profile names from pushing navigation off-screen

### UX-034: Add a responsive Customer presentation

**File**

* `frontend/app/(dashboard)/customers/page.tsx`

**Desktop**

Keep the detailed table where there is enough width. Consider a sticky Customer column and reduce repeated padding before introducing horizontal scroll.

**Tablet/mobile**

Render cards or compact rows containing:

* name and customer type
* email/phone actions
* location
* tier/spend summary where authorized
* last contact
* task count
* overflow actions

Secondary fields can appear in an expandable detail region. Do not require horizontal scrolling through twelve columns for routine use.

**Acceptance criteria**

* customer search, paging, edit, merge, and delete remain reachable at 375 pixels
* destructive actions remain behind confirmation
* cards and table use the same source data and actions

### UX-035: Correct Calendar sizing and mobile controls

**Files**

* `frontend/app/(dashboard)/calendar/page.tsx`
* `frontend/components/Calendar/CalendarView.tsx`
* `frontend/components/Calendar/EventModal.tsx`

**Implementation**

* remove `h-[calc(100vh-100px)]`, which ignores navbar, main padding, and the page header
* size the calendar relative to the remaining page or use a bounded responsive height with a sensible minimum
* provide a compact custom toolbar if the library toolbar crowds at phone/tablet widths
* use native buttons for linked Task and Notice markers
* retain text/symbol distinctions in addition to event colors
* ensure day, week, month, and agenda controls remain reachable without horizontal page overflow

**Acceptance criteria**

* desktop does not gain a large avoidable page scrollbar from the calendar height calculation
* calendar controls remain usable at 375 and 768 pixels
* linked records are keyboard-operable

### UX-036: Accessibility manual gate

For every migrated route, verify:

* keyboard-only navigation
* visible focus
* Escape and focus return for dialogs
* 200% browser zoom
* labels for every form control
* meaningful button names for icon-only controls
* status communicated by text as well as color
* error focus and `aria-live` behavior

Automated accessibility tooling may be proposed separately, but no new dependency should be added without approval.

## 12. Phase 5: Visual-System Consolidation

### UX-040: Formalize the existing visual tokens

**File**

* `frontend/app/globals.css`

**Keep**

* warm neutral background
* near-black green foreground
* burgundy primary brand
* teal operational accent
* semantic amber, red, and green

**Add or normalize**

* surface elevations
* strong/subtle border colors
* focus ring token
* consistent small/medium/large radii
* semantic success color and surface
* disabled state colors
* chart palette variables

Use burgundy for primary product actions, teal for focus/selection and operational information, and semantic colors for actual state. Indigo/blue should not remain as a second accidental primary palette.

### UX-041: Migrate legacy controls as files are touched

**Known areas**

* `frontend/components/CreateStaffModal.tsx`
* `frontend/app/(dashboard)/staff/page.tsx`
* `frontend/app/(dashboard)/customers/page.tsx`
* `frontend/components/winery/*`
* `frontend/components/NotificationCenter.tsx`
* `frontend/components/analytics/*`

**Implementation**

* replace indigo primary buttons with the shared primary treatment
* replace one-off gray panels with shared surface classes
* align input, checkbox, select, error, and success states
* remove conflicting classes such as applying `.btn-primary` and `bg-indigo-600` to the same element
* keep semantic blue only where blue has a defined meaning, not as a default action color

Do this incrementally. Avoid a repository-wide mechanical class replacement without visual review.

### UX-042: Refine identity and winery atmosphere

**Files**

* `frontend/components/Login.tsx`
* `frontend/components/Navbar.tsx`
* winery brand/profile API only if already capable of supplying safe logo data

**Implementation**

* retain the clean, sparse login composition
* strengthen the VinAgent wordmark/monogram treatment without adding decorative imagery
* when a device has winery context, make the winery name a clear tenant identity
* when no context exists, retain the product-level VinAgent identity
* ensure logo/mark treatment works in monochrome and at small sizes

Do not add remote image or font dependencies merely for atmosphere.

### UX-043: Standardize feedback

Create a consistent policy:

* field validation -> inline near the field
* form/API failure -> inline alert inside the current surface/dialog
* successful background or form save -> small in-context saved state or transient toast
* destructive action -> ConfirmDialog
* loading -> local loading state that does not blank unrelated navigation

Migrate the most common `alert()` calls first. Track remaining native alerts with `rg "alert\\(|window\\.alert|window\\.prompt|window\\.confirm" frontend`.

## 13. Phase 6: Insights and Winery Configuration Hierarchy

### UX-050: Reorganize Analytics as Insights

**Current files**

* `frontend/app/(dashboard)/analytics/page.tsx`
* `frontend/components/analytics/*`

**Target views**

1. Overview
2. Operations
3. Customers & revenue
4. Team
5. Intelligence

Use query parameters such as `/analytics?view=operations` rather than creating unnecessary new routes.

**Overview content**

* no more than six leading KPIs
* key queue health: overdue, blocked, waiting, first response, resolution time
* one customer/business signal
* one clear path to each detailed view

**Detailed views**

* Operations: workflow, waiting, deadlines, handoffs, response, outcomes
* Customers & revenue: acquisition, loyalty, spend, bookings, channels
* Team: workload and handoffs
* Intelligence: suggested signals, recurrence, saved-signal review, evidence links

Maintain the period selector across views and retain the selected view when changing period.

### UX-051: Separate intelligence insight from intelligence configuration

`OperationalIntelligenceInsights` belongs in Insights. Thresholds, schedules, presets, and configuration history are settings.

**Implementation**

* retain insight review, acknowledgement, dismissal, and task creation in the Intelligence insights view
* move `OperationalIntelligenceControls` into Winery configuration under a new Intelligence settings destination
* preserve existing permission checks
* update docs to make the distinction explicit

### UX-052: Group Winery configuration

The current flat tab row can contain nine or more tabs. Replace it with grouped navigation:

* General: Overview, Brand & Voice
* Operations: Area Profiles, Products, Bookings, Policies & FAQs
* Team: Organisation, Staff & Access
* System: Integrations, Intelligence

**Desktop**

Prefer a narrow grouped side navigation or clearly separated tab groups.

**Mobile**

Use a labelled select or accessible grouped menu, followed by the active settings panel.

Keep global-versus-area editability explanations visible and preserve the existing read-only behavior.

### UX-053: Simplify dense Analytics visuals

* use the shared brand/semantic chart palette
* avoid eight tiny KPI cards in one row
* use readable labels instead of truncation where possible
* show "No data for this period" instead of empty chart geometry
* provide units in chart headings or values
* keep evidence links close to operational intelligence signals

## 14. Phase 7: Verification and Trial Sign-off

### 14.1 Automated gates

Run after every phase:

```bash
cd frontend
npm run lint
npm run build
```

Run backend tests whenever API or service behavior changes:

```bash
npm test -- --runInBand
```

Do not accept new lint warnings in touched files.

### 14.2 Role matrix

Verify each relevant route as:

* admin
* winery manager
* area manager/config-authorized user
* staff Firebase session
* staff PIN session

Check both destination visibility and forbidden action visibility. A hidden navigation item is not a substitute for backend authorization.

### 14.3 Responsive matrix

Verify at minimum:

* 375 x 812
* 768 x 1024
* 1024 x 768
* 1280 x 800
* 1440 x 900

Check:

* navigation fit
* page-header action wrapping
* modal bounds and internal scroll
* task-card scanability
* filter layout
* customer representation
* calendar toolbar and height
* settings navigation

### 14.4 Core workflow smoke test

1. Sign in as a manager.
2. Navigate through every primary destination.
3. Open Work and visit every child view.
4. Confirm Home counts against API totals with more than 20 tasks.
5. Page from Tasks page 1 to page 2, open a task, update a safe field, close it, and confirm page/filter preservation.
6. Open a task from a notification deep link.
7. Search and page Noticeboard beyond 50 results.
8. Create a Request through Quick capture, review readable type labels, and approve/reject through the decision dialog.
9. Create a Note manually after simulating analysis failure.
10. Link a Task and Notice through search rather than memorized IDs.
11. Open and edit a Calendar event and linked record using keyboard only.
12. Search Customers and complete an edit at mobile width.
13. Move between Insights views while preserving the reporting period.
14. Open Winery configuration and verify global versus area permissions.
15. Sign in through a PIN session and repeat the staff-critical path.

### 14.5 Accessibility smoke test

For Home, Work queue, Task detail, Noticeboard, Requests, Calendar, Customers, and mobile navigation:

* navigate using Tab, Shift+Tab, Enter, Space, Escape, and arrow keys where applicable
* confirm focus is always visible
* confirm dialogs trap and return focus
* confirm no primary action requires hover
* confirm icon-only buttons have accessible names
* verify layout at 200% zoom
* verify errors are announced and focus moves to the first invalid input

### 14.6 Data-shape edge cases

Test:

* zero records
* exactly one record
* one less than page size
* exactly page size
* one more than page size
* long winery and staff names
* long task/notice titles
* missing customer email/phone
* unknown enum values
* expired notices
* blocked task without a reason
* task with many messages, files, steps, and linked notices

## 15. Compatibility and Risk Controls

### 15.1 Preserve deep links

The following link shapes are already used and must keep working:

* `/tasks?taskId=<id>`
* `/tasks?taskId=<id>&expandNotes=1`
* `/tasks?assigneeId=me`
* `/tasks?mentionedMe=1`
* `/noticeboard?noticeId=<id>`
* Request/Note links with typed IDs generated by Operations

### 15.2 Preserve auth behavior

Do not weaken Firebase or PIN-session checks to make UI testing easier. Use valid test accounts or request interception in dedicated tests if later approved.

### 15.3 Prefer additive API changes

* keep existing Task and Notice list response fields
* add summary endpoints or response properties rather than changing established fields
* update API docs and tests with every contract addition

### 15.4 Do not mix unrelated refactors

Avoid changing API behavior, navigation, visual tokens, and every modal in one change. The phases exist to keep regressions diagnosable.

### 15.5 Respect operational density

VinAgent is an operations product. Simplification should remove duplication and technical noise, not hide ownership, due state, waiting reason, customer context, or audit information.

## 16. Suggested Implementation Tickets

| ID | Deliverable | Priority | Primary files | Done when |
| --- | --- | --- | --- | --- |
| UX-001 | Task pagination contract and controls | P0 | `taskApi.ts`, Tasks page | Task 21 is reachable and state is preserved |
| UX-002 | Accurate queue overview | P0 | Task services/routes, Tasks page | No page-derived count appears as a total |
| UX-003 | Accurate Home totals | P0 | Home page, task API types | Counts can exceed display caps accurately |
| UX-004 | Noticeboard pagination | P0 | Noticeboard page | Notice 51 is reachable |
| UX-010 | Central navigation config | P1 | Navbar, navigation config | Role rules and labels have one source |
| UX-011 | Desktop Work menu and mobile drawer | P1 | Navigation components | No overflow; keyboard navigation passes |
| UX-012 | Terminology normalization | P1 | Work/Notice/Analytics pages | Page purpose is unambiguous |
| UX-013 | Work subnavigation | P1 | Work pages | All Work objects are locally reachable |
| UX-020 | Enum presentation layer | P1 | Operational presentation/components | No raw primary enum labels |
| UX-021 | Guided Quick capture | P1 | OperationalItemPage | Natural-language capture has review/manual paths |
| UX-022 | Operational dialog/feedback migration | P1 | Task/Request/Notice/Calendar flows | No native prompt in critical work |
| UX-023 | Searchable entity linking | P1 | Task/Notice/Collaboration components | IDs are not required knowledge |
| UX-024 | Task-card hierarchy and keyboard access | P1 | TaskSummaryCard | Card is concise and natively operable |
| UX-030 | Shared UI foundations | P1 | `components/ui` | Dialog/Pagination/feedback behavior is reusable |
| UX-031 | Dialog accessibility | P1 | Modal-heavy components | Focus trap, Escape, and return focus pass |
| UX-033 | Responsive headers/metrics | P1 | globals and dashboard pages | 375-1440 matrix passes |
| UX-034 | Responsive Customers | P1 | Customers page | Routine mobile customer work is usable |
| UX-035 | Responsive Calendar | P1 | Calendar components | No avoidable viewport overflow |
| UX-040 | Token consolidation | P2 | globals.css | One intentional primary palette |
| UX-041 | Legacy style migration | P2 | Staff/Customers/Winery | Touched flows use common controls |
| UX-042 | Product/tenant identity refinement | P2 | Login/Navbar | Atmosphere feels intentional, not decorative |
| UX-050 | Insights information hierarchy | P2 | Analytics page/components | Overview and detail views are distinct |
| UX-051 | Move intelligence controls to settings | P2 | Analytics/Winery | Analysis and configuration have clear homes |
| UX-052 | Group Winery configuration | P2 | Winery page | Settings remain discoverable without a flat 9-tab row |
| UX-060 | Full role/responsive/accessibility smoke | P0 release gate | whole frontend | Sign-off matrix passes with evidence |

## 17. Definition of Done

This plan is complete when:

* all Task and Notice records are reachable through normal navigation
* Home and queue totals are derived from complete aggregate data
* managers no longer see eleven competing top-level navigation items
* Queue and Operational memory have distinct names and purposes
* Requests and Notes can be created without raw enum knowledge
* critical work no longer uses native prompts or alerts for ordinary validation and decisions
* primary cards, navigation, dialogs, and Calendar links are keyboard-operable
* Customers, Calendar, navigation, headers, and modals pass the responsive matrix
* the burgundy/teal visual language is consistent across touched screens
* Insights is divided into clear overview and detailed views
* intelligence configuration lives in settings while intelligence evidence remains in Insights
* manager, area manager, staff, and PIN-session smoke paths pass
* frontend lint/build and relevant backend tests pass
* API, component, and frontend documentation match the implemented behavior

## 18. Recommended First Agent Assignment

Start with Phase 1 only:

> Implement UX-001, UX-003, and UX-004 using the existing Task and Notice pagination response shapes. Add `fetchTaskPage` without removing the compatibility `fetchTasks` helper, make Home totals use pagination metadata while keeping short display lists, add reusable pagination controls to Tasks and Noticeboard, preserve all existing deep-link query parameters, and keep frontend lint/build green. Do not begin navigation or visual refactors in the same change.

After that change is reviewed, implement UX-002 with the additive queue-summary API and backend tests. Then proceed to Phase 2.
