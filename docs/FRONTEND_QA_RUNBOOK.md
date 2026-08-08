# Frontend Phase 7 QA Runbook

## Current automated evidence — 2026-08-08

| Check | Result | Scope |
|---|---|---|
| `npm run lint:ci` | Passed | Frontend source, zero warnings |
| `npm run build` | Passed | Production Next build, TypeScript, and all 20 generated pages, including `/confirm-address` and `/usage` |
| `npm run test:smoke` | Passed, 6/6 | Public-token extraction, endpoint construction, address normalization/validation, and safe customer error states |
| `npm run test:browser-smoke` | Passed | Real local headless Edge/Chromium against the production Next server: public address confirmation and expiry, token removal from the URL, fixed-winery login, manager/staff navigation visibility, aggregate manager Usage rendering, and 375px shell overflow checks |
| Legacy Customer/Staff overlays | Passed source audit | No `fixed inset-0` overlay remains in Customer, Staff, or Create Staff modal files; each uses `ui/Dialog` |
| Native browser feedback | Passed source audit | No `alert`, `confirm`, or `prompt` usage outside the `ConfirmDialog` component's internal handler |

The repository now uses `playwright-core` with an installed local Edge/Chrome executable for deterministic browser smoke. The automated manager/staff profiles and API responses are test fixtures; they verify browser rendering and role-visible navigation but do not replace the real backend, Firebase, PIN, provider, or populated-data staging checks below.

## Test accounts and data

Prepare one account for each role before starting:

| Role | Required evidence |
|---|---|
| Admin | Full navigation, customer management, staff/access, global Winery settings |
| Winery manager | Work, Customers, Insights, and permitted configuration |
| Area manager/config-authorized user | Area-scoped configuration and forbidden global actions |
| Staff Firebase session | Staff-visible destinations and task-critical path |
| Staff PIN session | Same staff-critical path through the PIN entry route |

Use a non-production winery/test tenant with at least 51 notices and more than 20 tasks. Include a blocked task, an overdue task, a task with several links/files/steps, a long customer name, a long task title, an expired notice, and an unknown enum value.

## Viewport matrix

Run the core workflow at 1280 x 800. For each viewport below, inspect navigation fit, header-action wrapping, filters, task-card scanability, Customer representation, Calendar controls, modal bounds/internal scroll, and Winery navigation.

| Viewport | Result |
|---|---|
| 375 x 812 | Public confirmation and manager/staff navigation shells passed automatically; populated workflow checks pending |
| 768 x 1024 | Pending |
| 1024 x 768 | Pending |
| 1280 x 800 | Pending |
| 1440 x 900 | Pending |

## Core workflow matrix

| Scenario | Expected result | Result |
|---|---|---|
| Manager primary navigation | All permitted destinations visible and reachable; Work subnavigation is clear | Role visibility passed automatically; live destinations pending |
| Aggregate Usage dashboard | Manager/admin can view seats, engagement, API, messaging, task, AI-token, and storage totals; staff cannot see the route in navigation | Fixture-backed rendering and role visibility passed automatically; live reconciliation pending |
| Public member address confirmation | Token is removed from the URL; review, correction, explicit confirmation, success, and expired states are safe and usable | Passed automatically at 375 x 812 |
| Queue totals over 20 tasks | Home and Queue totals match API totals, not just loaded cards | Pending |
| Task pagination/deep link | Page/filter state remains after opening and closing a task | Pending |
| Noticeboard over 50 notices | Next page exposes records beyond page one | Pending |
| Quick capture Request | Readable choices, review state, approval/rejection dialog and inline errors | Pending |
| Manual Note after analysis failure | Manual entry remains usable | Pending |
| Relationship pickers | Task and Notice linking works by title/context; exact ID remains an optional path | Pending |
| Calendar keyboard path | Linked records and edit dialog work with keyboard only | Pending |
| Customer mobile edit | Search and edit complete without horizontal overflow at 375px | Pending |
| Insights/Winery hierarchy | Reporting period survives Insights view change; area/global permissions are correct | Pending |
| PIN staff path | Staff-critical work is available without manager-only destinations/actions | Manager-only navigation exclusion passed automatically; live PIN and task work pending |

## Dialog and accessibility smoke

Perform this for Customer create/edit/merge/delete, Staff create/edit/credentials/delete, task workflow actions, and a destructive Winery action:

1. Open the dialog with keyboard.
2. Confirm focus starts within the dialog and never leaves it with Tab/Shift+Tab.
3. Use Escape and confirm the dialog closes and focus returns to its invoking control.
4. Reopen it, use the backdrop close where allowed, and confirm the same focus return.
5. Trigger a safe validation/server error and confirm it is visible, announced, and does not use a browser alert.
6. At 200% browser zoom, confirm the dialog remains bounded and internally scrollable.
7. Verify icon-only close controls have an accessible name and no primary action depends on hover.

Mark a row as passed only after the expected result is observed in the relevant authenticated role and viewport. Record the browser, account role, viewport, test data, and any defect beside the affected row.
