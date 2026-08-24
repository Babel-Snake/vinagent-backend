# Canonical Booking Projection and Activation

Status: typed projection, guarded activation, incremental polling, and reconciliation implemented

Last reviewed: 2026-08-18

## Runtime boundary

The Booking Feed remains read-only. Each validated source observation is now projected into provider-neutral
Booking state, but historical hydration is still non-actioning:

```text
SOURCE observation
      |
      v
authority and ordering guards
      |
      v
Booking + Items + Requirements + Status History
      |
      v
CANONICAL event + transactional outbox
      |
      +-- HYDRATION/manual replay -> automationEligible=false
      |
      +-- LIVE after approved watermark -> guarded eligibility
      |
      +-- RECONCILIATION material change -> same guarded eligibility
```

The `vinagent-booking-feed` handler supports hydration, incremental polling, and completeness-checked
reconciliation. Activation alone does not manufacture live events, replay history, or create work. Only a
material source change accepted after activation can emit an eligible event; exact replay remains a no-op.

## Typed state

Migration `20260818300000-create-canonical-bookings.js` adds:

- `Bookings`: current provider-neutral status, schedule, party size, local location/customer/type links, source
  reference, authority, revision, quality, and lineage;
- `BookingAreaLinks`: explicit primary/linked operational placement;
- `BookingItems`: experiences and add-ons with stable per-booking keys;
- `BookingRequirements`: structured requirements, fulfilment state, responsibility, sensitivity, and source;
- `BookingStatusEvents`: immutable status-transition history;
- `IntegrationDomainActivations`: generic per-connection/domain/scope activation watermarks.

Provider IDs remain scoped through `ExternalResourceReference`; they do not become canonical primary keys.
Requirements and items missing from a newer authoritative revision are marked inactive rather than silently
deleted. Exact revisions and materially unchanged provider revisions do not emit duplicate canonical events.

Booking Feed status mapping is deterministic:

| Source | Canonical |
| --- | --- |
| `ENQUIRY`, `PENDING` | `TENTATIVE` |
| `CONFIRMED` | `CONFIRMED` |
| `SEATED` | `IN_PROGRESS` |
| `COMPLETED` | `COMPLETED` |
| `NO_SHOW` | `NO_SHOW` |
| `CANCELLED` | `CANCELLED` |
| Unrecognised future value | `UNKNOWN` |

## Authority and ordering

The projector resolves the active `BOOKING / CORE` authority policy at location scope, then winery scope.

- Before an explicit policy exists, one connection may establish provisional `IMPLICIT_SINGLE_SOURCE` state.
  This state is useful for shadow review but cannot pass activation readiness.
- `SOURCE_PRIORITY` allows a listed source. A primary source can replace fallback state; a fallback cannot
  overwrite higher-priority state.
- `VINAGENT_OWNED` and unlisted sources retain their source observations but produce a blocking
  `SOURCE_CONFLICT` rather than changing canonical state.
- Provider updates older than the current `sourceUpdatedAt` produce an `OUT_OF_ORDER` issue and cannot change
  the Booking, its children, or its canonical event history.
- Current successful projection automatically resolves stale location/source-conflict issues for that source
  reference; the evidence remains in the issue row.

Every material projection commits the Booking changes, status event, `CANONICAL` `IntegrationEvent`, and
`CanonicalEventOutbox` record atomically. Event types include `booking.created`, `booking.confirmed`,
`booking.changed`, `booking.cancelled`, `booking.checked_in`, `booking.completed`, and `booking.no_show`.

## Activation preview and cutover

Managers/admins first call:

```text
GET /api/integration-management/connections/:id/booking-activation-preview
```

Readiness requires:

- a verified `CONNECTED` connection;
- completed initial hydration with a provider watermark;
- one unambiguous local location/area scope;
- every booking source reference mapped to canonical state;
- no open blocking/error projection issues;
- an active location/winery `BOOKING / CORE / SOURCE_PRIORITY` policy;
- this connection as primary source order `0`;
- every projected Booking aligned to that exact active policy version.

The response contains a SHA-256 `previewToken` over the connection version, sync state/watermark, mapping
counts, issue count, scope, and authority policy. Activation recomputes the preview in its transaction, so a
configuration, sync, mapping, or policy change makes an earlier token stale.

Activation is requested with:

```text
POST /api/integration-management/connections/:id/booking-activation
```

```json
{
  "requestId": "UUID-v4",
  "previewToken": "64-character preview hash",
  "reason": "Manager-reviewed reason for enabling future events",
  "acknowledgeNonRetroactive": true
}
```

The server chooses `activatedAt`; callers cannot backdate it. The saved `sourceWatermarkAt` comes from the
completed sync state. A live or reconciliation canonical event is eligible only when all of these remain
true:

- its source event purpose is `LIVE`, or it is a material `RECONCILIATION` change explicitly approved by the
  Booking projector;
- the connection remains `CONNECTED`;
- the source event was received after activation;
- the provider update is strictly newer than the activation watermark;
- the active authority policy is still the exact policy approved at activation;
- this connection remains primary source order `0`.

Credential rotation/revocation, connection endpoint/location changes, and authority-policy replacement disable
the activation and its eligibility capability. Re-verification does not silently restore it; the manager must
hydrate/reconcile, generate a fresh preview, and activate again.

Incremental and reconciliation jobs derive their checkpoint from persisted sync state and embed the active
activation identity and preview hash. The worker rechecks both before making a provider call. A stale queued
job fails instead of running under a changed approval. Reconciliation requires the provider to declare a
complete final snapshot and still acts only on explicit revisions or tombstones; absence never means deletion.

## Privacy

Canonical Booking events contain operational requirement codes for ordinary experience/add-on preparation.
Dietary and accessibility requirements are stored as `RESTRICTED`, excluded from canonical event payloads,
and returned by the management detail API only as a restricted placeholder without code or description.
Guest identity retention continues to follow the connection's `guestDataMode`.

## Manager queries

- `GET /api/integration-management/bookings`
- `GET /api/integration-management/bookings/:id`
- `GET /api/integration-management/connections/:id/booking-activation-preview`
- `POST /api/integration-management/connections/:id/booking-activation`

These endpoints are tenant-scoped and manager/admin-only. List filters support canonical status, location,
connection, and a bounded start-time window.

## Remaining boundary

The provider-neutral `booking.readiness.v1` context pack and manager-installed truffle preparation Task are
implemented and documented in `docs/BOOKING_LIVE_READINESS.md`. Its first `AutomationResourceBinding`
lifecycle can update or cancel untouched work and annotate staff-owned work without overwriting it; see
`docs/AUTOMATION_RESOURCE_BINDINGS.md`. This slice does not add a native vendor adapter, automatic scheduler,
webhook receiver, customer/experience identity mapping workflow, inventory/workforce projections, historical
binding backfill, or lifecycle handlers for Notices and other domains.
