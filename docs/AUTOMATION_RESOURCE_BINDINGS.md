# Automation Resource Bindings

Status: generic binding persistence and first Booking-to-Task lifecycle handler implemented

Last reviewed: 2026-08-18

## Purpose

An `AutomationRun` proves that one source event was evaluated once. It does not answer what should happen to
work already created for a business resource when that resource later changes. `AutomationResourceBinding`
provides that longer-lived relationship:

```text
canonical resource + rule + purpose
                 |
                 v
       generated operational item
                 |
      managed fields + last snapshot
                 |
 later eligible canonical revisions
                 |
 UPDATE / CANCEL / ANNOTATE / NOOP
```

The uniqueness boundary is `(wineryId, ruleId, resourceType, resourceId, purposeKey)`. A new source event
therefore cannot create a second lifecycle for the same rule purpose merely because its event/run key differs.

## Stored contract

Migration `20260818400000-create-automation-resource-bindings.js` adds:

- canonical resource, generated item, rule, and original rule-version identity;
- lifecycle state and source revision;
- last reconciled run/event and timestamp;
- an allowlist of automation-managed fields;
- the last values applied by automation;
- immutable handler configuration and reconciliation policy snapshots;
- first detected human override time, actor, and reason;
- the latest reconciliation decision and explanation.

Lifecycle values are bounded strings rather than provider-specific states:

- `ACTIVE`: automation may still manage its declared fields;
- `HUMAN_OWNED`: staff activity was detected, so automation only annotates or does nothing;
- `CANCELLED`: untouched generated work was safely cancelled and will not be reopened;
- `ORPHANED`: the bound operational item no longer exists.

## Safety policy

Lifecycle handlers are registered by canonical resource type, operational item type, and purpose key. The
first handler is `BOOKING / TASK / booking.truffle_preparation` with:

```json
{
  "onChange": "UPDATE_MANAGED",
  "onCancel": "CANCEL_IF_UNTOUCHED",
  "onUnsafe": "ANNOTATE",
  "reopen": "NOOP"
}
```

Automation compares the current Task with its last applied managed snapshot. It also treats a non-pending or
progressed workflow, a resolution, or a later user-attributed Task audit action as human ownership. Detection
is deliberately conservative.

Only allowlisted fields are updated. The truffle handler manages its configured assignment/category/priority,
due time, suggested action, and bounded preparation payload fields. It does not replace the whole Task payload,
staff notes, workflow steps, outcomes, or unrelated fields.

If untouched work is no longer required, the Task is rejected/cancelled with a system-attributed audit record
and assignment notifications are removed. If staff changed or progressed it, the Task stays as-is, the binding
becomes `HUMAN_OWNED`, and a visible system note explains the Booking change. Completed work is never reopened.

## Dispatch and idempotency

Binding reconciliation runs from the canonical outbox before new matching rules are evaluated. It runs only
for `automationEligible=true` canonical events; hydration and other non-actioning history cannot mutate work.
The binding stores `lastReconciledEventId`, so an outbox retry cannot apply or annotate the same revision twice.

Creating the original Task, its `OperationalResourceLink`, the binding, and the successful Automation Run is
one transaction. If the binding uniqueness guard fails, the newly attempted Task is rolled back.

For the current truffle workflow:

- booking time or required quantity changes update untouched managed Task fields;
- booking cancellation or truffle-requirement removal cancels an untouched pending Task;
- the same changes annotate and preserve staff-owned work;
- a cancelled binding prevents silent recreation if the booking is later reconfirmed.

## Manager visibility

Managers/admins can inspect winery-scoped lifecycle state through:

- `GET /api/automations/bindings`
- `GET /api/automations/bindings/:id`

List filters support rule, canonical resource type/ID, lifecycle state, and bounded pagination. These endpoints
do not provide mutation or forced-reconciliation controls.

## Current boundary

The persistence and policy engine are generic, but the only registered lifecycle handler is the truffle
Booking Task. Notices and other canonical domains remain `NOOP` until they receive an explicit reviewed
handler. There is no automatic reopen/rebind, manager override-reset endpoint, or bulk historical binding
backfill in this slice.
