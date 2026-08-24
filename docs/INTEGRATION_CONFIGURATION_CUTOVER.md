# Integration Configuration Authority Cutover

Status: generic per-winery/domain authority state, Booking readiness, prepare/activate/rollback, one-writer
guards, compatibility projection, and audit implemented; production cutover remains disabled

## Purpose

VinAgent currently has two integration configuration shapes:

- first-class canonical connections, scopes, protected credentials, authority policies, activations, and sync
  state; and
- legacy `WineryIntegrationConfig`, area overrides, and derived `WinerySettings` still consumed by older
  execution paths.

Keeping both writable would eventually make the intelligence layer non-deterministic. This slice introduces
an explicit `IntegrationConfigurationAuthority` per winery and canonical domain. It stages and records which
side is the writer, projects a sanitized compatibility view when canonical authority is selected, and
requires an explicit rollback before a protected canonical dependency can be invalidated.

This is separate from `IntegrationDomainActivation`. Domain activation decides whether canonical changes may
produce live canonical events. Configuration authority decides which configuration store is writable.

## State model

```text
LEGACY_PRIMARY -> PREPARED -> CANONICAL_PRIMARY
       ^                         |
       |                         v
       +------------------- ROLLED_BACK
```

- `LEGACY_PRIMARY`: no row is also interpreted as this state; legacy configuration remains writable.
- `PREPARED`: a manager reviewed a fresh preview and VinAgent captured a sanitized rollback baseline. Legacy
  remains the writer.
- `CANONICAL_PRIMARY`: canonical connection state is the only writer. Legacy tables contain a one-way,
  sanitized compatibility projection.
- `ROLLED_BACK`: the captured legacy metadata is restored and legacy writes are enabled again. A new preview
  and prepare are required before another activation.

Transitions are transactional, UUID-v4 request-idempotent, winery-scoped, manager/admin-only, and append one
of `CONFIGURATION_AUTHORITY_PREPARED`, `CONFIGURATION_AUTHORITY_ACTIVATED`, or
`CONFIGURATION_AUTHORITY_ROLLED_BACK` to the integration operation audit.

## Manager API

- `GET /api/integration-management/configuration-authorities`
- `GET /api/integration-management/configuration-authorities/:domain/preview`
- `POST /api/integration-management/configuration-authorities/:domain/prepare`
- `POST /api/integration-management/configuration-authorities/:domain/activate`
- `POST /api/integration-management/configuration-authorities/:domain/rollback`

Prepare body:

```json
{
  "requestId": "11111111-1111-4111-8111-111111111111",
  "previewToken": "64-character-preview-hash",
  "reason": "Capture the reviewed legacy baseline before changing writers."
}
```

Activation additionally requires `"acknowledgeOneWriter": true`. Because preparing changes the authority
state, the manager must obtain a new preview token after prepare. Rollback requires
`"acknowledgeLegacyRestore": true` and no preview token.

## Current Booking readiness contract

The persistence and API are domain-generic, but Booking is deliberately the only registered cutover handler.
Other domains preview as blocked with `DOMAIN_CUTOVER_HANDLER_NOT_REGISTERED`; they cannot be activated by
pretending Booking's rules apply.

Booking activation requires all of the following:

- deployment gate `INTEGRATION_BOOKING_CONFIG_CUTOVER_ENABLED=true`;
- at least one active canonical Booking domain activation;
- exactly one active authority per represented scope and a winery-default scope;
- only winery/area scopes that legacy compatibility tables can represent;
- every selected authority connection remains `CONNECTED`;
- no open/acknowledged `ERROR` or `BLOCKING` projection issue for those connections; and
- the legacy reservation-write module is disabled (`WinerySettings.enableBookingModule=false`).

The final condition matters because the currently registered OpenTable adapter is a read/projection adapter,
not a reservation-write adapter. Configuration cutover must not silently redirect a live reservation action
to a mock or unsupported provider. Canonical runtime resolution returns the canonical provider after cutover,
so unsupported transactional calls continue to fail closed.

`INTEGRATION_BOOKING_CONFIG_CUTOVER_ENABLED` defaults to false. Preparing a rollback baseline remains useful
without credentials, but a real preview will remain blocked until connection verification and canonical
activation have occurred.

## One-writer enforcement

While Booking is `CANONICAL_PRIMARY`:

- explicit legacy winery or area Booking configuration writes and legacy connection tests return
  `CANONICAL_CONFIGURATION_AUTHORITY_ACTIVE`;
- enabling the legacy Booking execution module is rejected;
- execution configuration resolution prefers the canonical compatibility snapshot rather than
  `WinerySettings`;
- changing/disabling the selected connection, deleting its Booking scope, rotating/revoking its credential,
  changing the active authority policy, or adding a new Booking activation requires rollback first and
  returns `CONFIGURATION_AUTHORITY_ROLLBACK_REQUIRED`; and
- unrelated legacy domains remain writable.

These conservative mutation guards avoid a half-updated compatibility view. A later rolling-replacement
operation can permit zero-downtime connection rotation by validating the replacement and projecting it in the
same transaction.

## Compatibility and rollback data

Activation projects provider identity, account/location identifiers, public base URL, capability names, and
health metadata to the legacy Booking entries and derived settings. It never copies `authReference`, encrypted
credentials, webhook verification material, tokens, or secret-shaped fields.

The rollback baseline is also sanitized recursively. Consequently, a rollback restores provider/routing
metadata but intentionally does not resurrect legacy credentials or webhook verification hashes. Those must
be re-onboarded through their protected stores. This makes rollback a configuration-authority recovery path,
not an unsafe secret backup.

## Extending to another domain

A domain handler must define:

1. its readiness facts and deployment gate;
2. which canonical activation, authority, and capability prove runtime availability;
3. how winery/area/location scopes map to the legacy compatibility shape;
4. which old readers and writers have migrated or must be disabled;
5. its sanitized compatibility projection and rollback metadata; and
6. which canonical mutations require rollback or a transactional re-projection.

Only then should the domain be added to the registered preview/activation dispatch. The database row alone is
not evidence that a domain is ready.

