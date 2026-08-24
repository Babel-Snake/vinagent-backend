# Integration Health and Domain Activation

Status: health and common activation implemented; configuration cutover remains Booking-only

Last reviewed: 2026-08-20

## Integration health

`GET /api/integration-management/integration-health` gives managers one provider-neutral view across:

- Customer, Booking, Club, Commerce, Catalogue, Inventory, Fulfilment, Workforce, and Communication;
- connection lifecycle and active scope coverage;
- external-reference resolution and projection freshness;
- open/acknowledged projection issues;
- stream pause/failure/freshness and recent failed/partial runs;
- active domain activations;
- current/stale/conflicting intelligence facts.

Filters are `domain`, `connectionId`, `maxAgeSeconds`, and `recentRunHours`. High-volume mapping and fact
counts are aggregated by the database. Responses never include external IDs, cursors, raw payloads, issue
titles/evidence, provider diagnostics, contact data, or credentials.

Domain health is:

- `BLOCKED` for reauthentication/error connections, blocking issues, ambiguous mappings, or failing streams;
- `DEGRADED` for pending/degraded connections, unresolved/stale evidence, warnings/errors, stale streams,
  failed recent runs, or stale/conflicting facts;
- `HEALTHY` when configured evidence has none of those conditions;
- `UNCONFIGURED` when the domain has no active scope/activation, mapping, stream, or current fact.

The view is diagnostic and always returns `automationEligible: false`.

## Common activation readiness

Booking keeps its specialised activation workflow because it also proves canonical Booking/authority-policy
alignment and controls the guarded Booking scheduler. The common workflow covers Customer, Club, Commerce,
Catalogue, Inventory, Fulfilment, Workforce, and Communication:

- `GET /api/integration-management/connections/:id/domain-activations/:domain/preview`
- `POST /api/integration-management/connections/:id/domain-activations/:domain`
- `POST /api/integration-management/connections/:id/domain-activations/:domain/disable`

Preview requires:

- deployment gate `INTEGRATION_DOMAIN_ACTIVATION_ENABLED=true`;
- connected/verified connection;
- active matching connection scope;
- available, recently verified domain read capability and a declared polling/webhook transport;
- active, successfully verified protected credential for real providers;
- complete hydration plus watermark for polling connectors;
- a watermark from verified capability, sync, or source observation;
- all observed source references resolved to canonical records;
- active `CORE` source-priority authority policy with this connection primary;
- no active error/blocking projection issue for the domain.

An empty verified webhook source may be ready: zero source rows and zero projected rows are complete, not an
error. Fixture providers are credential-exempt only for test/conformance setup; normal APIs cannot promote a
new fixture connection from `PENDING` to `CONNECTED`.

Activation uses a fresh preview hash, UUID request id, reason, and explicit non-retroactive acknowledgement.
It records the source watermark and enables the domain's `*.canonical.events.live` capability. Replays are
idempotent. Credential rotation/revocation, connection configuration changes, or authority-policy changes
disable affected activations and live capabilities. Managers may disable activation explicitly; canonical
configuration authority must be rolled back first if it would otherwise create two writers.

## Credentials unavailable

The current build can be completed and tested with:

- deterministic provider fixtures;
- the generic conformance runner;
- projection/service integration tests;
- manager readiness previews showing exact missing prerequisites;
- default-off deployment gates.

Do not fabricate credentials or mark a real connection connected. When credentials arrive, the remaining
work is provider-specific: implement/register the adapter, onboard the encrypted credential, verify the
manifest capability, run hydration/reconciliation, review health, then activate with a fresh preview.

## Configuration cutover

Domain activation and legacy-configuration cutover are separate decisions. Activation permits non-
retroactive canonical events. Cutover selects the single configuration writer. The latter remains implemented
only for Booking under `INTEGRATION_BOOKING_CONFIG_CUTOVER_ENABLED`; other domains fail closed until their
legacy compatibility projections and rollback snapshots are registered.
