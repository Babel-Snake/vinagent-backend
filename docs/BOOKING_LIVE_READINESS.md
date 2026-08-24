# Booking Live Readiness and Preparation Automation

Status: guarded intake, bounded context pack, and first manager-installed rule implemented

Last reviewed: 2026-08-19

## Outcome

This slice proves the first complete provider-agnostic intelligence path:

```text
read-only booking feed
        |
guarded incremental/reconciliation job
        |
canonical Booking event + transactional outbox
        |
booking.readiness.v1
        |
manager-approved deterministic rule
        |
one linked human preparation Task
```

The booking provider is only responsible for satisfying Booking Feed v1. Projection, context, conditions,
assignment, and Task creation use VinAgent-owned contracts and do not mention a vendor.

## Guarded intake

Managers/admins can queue:

- `POST /api/integration-management/connections/:id/incremental-runs`
- `POST /api/integration-management/connections/:id/reconciliation-runs`

Both routes require a connected read-only feed, a completed hydration watermark, and an active Booking-domain
activation. The server derives the checkpoint; callers cannot choose an `updated_since` value that reaches
behind the activation boundary. The queued job carries the activation ID and approved preview hash, which the
worker rechecks immediately before use.

Incremental polling uses a configurable bounded overlap to catch late provider updates. Reconciliation must
finish with `snapshotComplete=true`. Neither mode treats absence as deletion: cancellation/deletion requires
an explicit provider revision and tombstone. Exact replay is idempotent, older changes cannot replace newer
canonical state, and only material post-activation changes can reach automation.

These endpoints create durable jobs. The disabled-by-default Booking scheduler now creates the same jobs for
eligible active streams; `BOOKING_SYNC_SCHEDULER.md` defines its cadence and provider controls. A native vendor
webhook receiver is still not implemented.

## `booking.readiness.v1`

The first context pack is registered as the read capability `booking.readiness.v1`. It accepts one canonical
`bookingId` and an optional freshness threshold. Its bounded response contains:

- canonical status, schedule, party size, experience, location, and primary operational area;
- non-sensitive active operational requirements;
- only a count for restricted dietary/accessibility requirements;
- deterministic truffle-pairing required quantity in portions;
- open generated Tasks linked to the Booking;
- source freshness and short explanation codes;
- freshness-safe canonical inventory results when exact demand and stock mappings exist;
- explicit `UNKNOWN` results when inventory demand is unmapped and for the unimplemented workforce domain.

The pack never queries an arbitrary connected application at rule-evaluation time. Each connector first
normalizes useful facts into canonical VinAgent state; the pack then resolves a stable, privacy-safe view over
that state. This keeps rules tool-agnostic, bounded, testable, and resilient to a provider outage.

Inventory is never inferred from requirement wording or legacy merchandising stock. A manager-confirmed
`InventoryDemandMapping` creates an exact Booking commitment, and a fresh compatible Inventory Position can
then produce `AVAILABLE` or `SHORTAGE`. Missing mappings return `INVENTORY_DEMAND_UNMAPPED`; stale, missing,
conflicting, and unit-mismatched inputs fail closed. Workforce remains
`WORKFORCE_DOMAIN_NOT_IMPLEMENTED`.

## Manager-installed truffle rule

Managers/admins can inspect and install automation templates:

- `GET /api/automations/templates`
- `POST /api/automations/templates/booking.truffle_preparation.v1/rules`

Installation requires an active same-winery assignee, a same-winery operational area, and accepts an optional
name and lead time. It creates a versioned `DRAFT` rule. A manager must separately activate that rule through
the normal automation status route.

The active template listens for `booking.confirmed`, loads `booking.readiness.v1`, and acts only when:

- context is fresh;
- the canonical booking is confirmed;
- a `truffle-pairing` requirement has a positive quantity; and
- no open linked truffle-preparation Task already exists.

It creates a high-priority internal operations supply Task for the designated person, due before the booking.
The wording asks the person to check stock; its payload records the resolved readiness status (`AVAILABLE`,
`SHORTAGE`, or a fail-closed unknown state). The human Task remains the authority for the operational check.

Created work receives an `OperationalResourceLink` to the canonical Booking with rule, version, run, source,
and purpose lineage plus an `AutomationResourceBinding`. Automation-run idempotency prevents the same source
event from acting twice, while readiness checks both open work and an existing lifecycle binding before
allowing another Task.

## Managed lifecycle

Later eligible canonical Booking events now reconcile generated preparation work. Booking time or quantity
changes update only declared managed fields on an untouched pending Task. Cancellation or requirement removal
cancels untouched work. A staff edit, reassignment, workflow action, or completion transfers the binding to
`HUMAN_OWNED`; VinAgent preserves the Task and adds a system note explaining the source change. Cancelled work
is not silently reopened. The full contract is in `docs/AUTOMATION_RESOURCE_BINDINGS.md`.

Other remaining work includes:

- obtain OpenTable partner/Sandbox access and verify the registered native Sync adapter against the pilot
  restaurant, then complete the production shadow checklist;
- production-activate and tune the implemented durable polling scheduler, and/or add a signed webhook recovery path;
- map winery-owned experiences and default preparation requirements;
- add canonical inventory and workforce projections before drawing availability or roster conclusions;
- add reviewed lifecycle handlers for Notices and later canonical domains;
- validate equivalent outcomes through a structurally different second provider.

Provider-neutral operational pause/resume, queue cancellation, failed-job replay, failed-outbox replay, and
append-only manager audit are implemented independently of live credentials. See
`docs/INTEGRATION_OPERATIONAL_CONTROLS.md`.

The reference conformance kit is documented in `docs/BOOKING_ADAPTER_CONFORMANCE.md`. Its fixture translators
prove the normalization boundary but are deliberately blocked from runtime registration. The credential-gated
OpenTable implementation and remaining activation checks are in `docs/OPENTABLE_BOOKING_SYNC.md`.
