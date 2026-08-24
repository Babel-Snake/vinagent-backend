# Intelligence Facts and Cross-Domain Contexts

Status: implemented, shadow/non-actioning

Last reviewed: 2026-08-20

## Purpose

Canonical domain tables preserve operational records. `IntelligenceFact` preserves a small, registered
conclusion about one canonical record. Context packs assemble current evidence for one bounded decision.
Neither layer is staff work, and neither creates a Task or Notice by itself.

This separation prevents raw provider payloads, unbounded joins, or model-generated claims from becoming
automation inputs accidentally:

```text
provider adapter -> canonical projection -> registered fact/context -> approved rule -> staff work
```

## Intelligence fact contract

`IntelligenceFacts` is append-only. A fact identity is the canonical subject, registered fact key,
derivation key, and optional source connection. A new observation creates a new version and timestamps the
previous current version with `supersededAt`. Identical replay returns the existing version. Older evidence,
or different evidence with the same `observedAt`, cannot replace current state.

Every fact records:

- winery and canonical subject;
- registered fact key, value type, schema version, and optional unit;
- quality class, derivation type/key/version, and optional confidence;
- observed, effective, stale, and superseded times;
- optional source connection, event, reference, area, and materialization run;
- privacy-bounded evidence and sensitivity class.

Manager reads omit internal identity/version hashes. Fact writes require a database transaction, a registered
definition, a same-winery canonical subject, tenant-valid evidence links, valid temporal ordering, and a
privacy-safe evidence object. AI-derived facts require an explicit AI quality class and confidence.

Current registered materializers are:

| Materializer | Subject | Facts |
| --- | --- | --- |
| `booking.readiness.v1` | Booking | inventory/workforce status, shortages/gaps, requirement count |
| `shipment.exception.v1` | Shipment | active exception, severity, delivery timing |
| `message.delivery.v1` | Message | delivery status and active failure |

Adding a fact requires a code-reviewed registry definition. Arbitrary manager or connector-defined fact keys
are rejected.

## Context packs

All context packs are tenant-scoped, output-schema validated, bounded, freshness-aware, and return
`automationEligible: false`. Rules may read them only through an allowlisted capability, and generated work
still requires an active manager-approved rule.

### `booking.readiness.v1`

Combines Booking scope, operational requirements, open work, explicit inventory demand commitments, and
complete workforce coverage evidence. Inventory and workforce remain `UNKNOWN` when mappings or fresh
evidence are absent.

### `customer.relationship.v1`

Combines privacy-safe contact availability, currently effective marketing consent, customer rollups,
memberships, per-currency monetary summaries, recent canonical activity, and open work. It excludes names,
contact values, addresses, message content, and raw provider data. Expired consent is `UNKNOWN`; future
consent evidence is ignored.

### `club.fulfilment.v1`

Combines one allocation and its program/membership, item demand, inventory commitments and available-to-
promise, payment summary, shipment status/exception, and open work. It never emits restricted delivery
details or provider SKUs.

### `area.capacity.v1`

Aggregates a bounded booking window for one Operational Area, including booking/covers breakdown and each
Booking's readiness. It deliberately reports physical capacity as `UNCONFIGURED` until a reviewed capacity
source exists; it does not infer venue capacity from booking-type limits. Truncated windows fail closed.

### Existing focused packs

`booking.coverage.v1` and `shipment.exception.v1` remain the focused workforce and fulfilment views used by
the broader packs.

## Manager APIs

- `GET /api/integration-management/intelligence-fact-definitions`
- `GET /api/integration-management/intelligence-facts`
- `POST /api/integration-management/intelligence-facts/materialize`
- `GET /api/integration-management/intelligence-fact-runs`
- `GET /api/integration-management/customers/:memberId/relationship-context`
- `GET /api/integration-management/wine-club-allocations/:allocationId/fulfilment-context`
- `GET /api/integration-management/areas/:areaId/capacity-context`

Materialization requires a UUID `requestId` and reason. The request is idempotent and creates an auditable
run, including failure state, without exposing source content.

## Expansion rule

Prefer a context pack when several current records are needed for one decision. Materialize a fact only when
the conclusion is stable enough to query, explain, trend, or reuse independently. Never copy an entire source
record into the fact table, and never treat a fact as an instruction to act.
