# Legacy Integration Compatibility Backfill

Status: dry-run inventory, conservative apply, issue creation, and audit implemented

## Purpose

VinAgent still has production dependencies on `WineryIntegrationConfig.providerConnections`,
`OperationalAreaIntegrationConfig.providerConnections`, and derived `WinerySettings`. Those JSON documents
cannot be treated as canonical connections: they mix provider selection, UI metadata, old execution settings,
and webhook configuration, and often lack stable account or location identifiers.

This slice inventories that state into `IntegrationConnection` and `IntegrationConnectionScope` without
changing the current runtime authority. It is preparation for a later one-writer cutover, not the cutover
itself.

## Safety rules

- Preview is read-only and must be reviewed before apply.
- Apply never deletes or edits the legacy JSON.
- A legacy `connected` flag, webhook hash, or environment credential does not prove a canonical connection is
  authenticated. Every created connection starts `PENDING`, has no `authReference`, and carries
  `LEGACY_CREDENTIAL_ONBOARDING_REQUIRED`.
- Webhook hashes, credentials, URLs, free-text notes, and last provider errors are not copied.
- Provider entries named `other`, `none`, `mock`, or `unknown` are reported as skipped rather than invented.
- Two entries merge only when provider plus available account/location identity are exactly equal. Provider
  name alone is never a merge key.
- Entries without an account or location stay source-isolated. Overlap creates a
  `CONNECTION_MAPPING_AMBIGUOUS` issue for manager review.
- A deterministic connection-key collision with a manager-owned/non-backfill row is never overwritten. The
  candidate is skipped and a blocking `SOURCE_CONFLICT` issue is created.
- A previously backfilled candidate whose source identity later disappears is preserved and reported through
  a `CONNECTION_MAPPING_STALE` issue; inventory refresh never disables it silently.
- Apply locks the winery, runs transactionally, uses request-level idempotency, and writes an append-only
  `LEGACY_CONNECTION_BACKFILL_APPLIED` operation record.

## Explicit domain map

| Legacy key | Canonical scopes |
| --- | --- |
| `sms` | `COMMUNICATION` |
| `email` | `COMMUNICATION` |
| `booking` | `BOOKING` |
| `crm` | `CUSTOMER` |
| `pos` | `COMMERCE`, `CATALOG` |
| `delivery` | `FULFILMENT` |
| trusted `retell` routing | `COMMUNICATION` |

This map is intentionally conservative. For example, legacy CRM metadata does not automatically claim a
Wine Club capability, and POS product reads do not prove inventory authority. Those scopes are added later by
verified provider manifests and manager-approved authority policies.

Winery entries create `winery` scopes with priority `0`; area overrides create `area:<id>` scopes with priority
`100`. Area scope preserves the operational placement already expressed by legacy configuration. It does not
invent a `WineryLocation` mapping.

## Identity and grouping

The inventory assigns one of four evidence levels:

- `ACCOUNT_AND_LOCATION`: exact provider/account/location tuple;
- `ACCOUNT`: exact provider/account tuple with no location;
- `LOCATION`: exact provider/location tuple with no account;
- `SOURCE_ISOLATED`: no stable external account or location.

Exact identities may group entries from different legacy domains into one multi-domain connection. A
source-isolated entry includes its source record/domain in the deterministic identity, preventing accidental
merges. All source keys, mapped domains, claimed non-secret capability labels, and an inventory fingerprint are
kept under `providerExtensions.legacyBackfill` for lineage.

## Manager API

All routes require a winery-scoped manager or admin:

- `GET /api/integration-management/compatibility-backfill/preview`
- `POST /api/integration-management/compatibility-backfill/apply`
- `GET /api/integration-management/compatibility-backfill/issues`

Apply uses the standard controlled-operation body:

```json
{
  "requestId": "11111111-1111-4111-8111-111111111111",
  "reason": "Inventory legacy integrations before protected connector onboarding."
}
```

The preview reports source entries, skipped reasons, candidate connections/scopes, create/reuse/collision
counts, and mapping issues. Repeating the same apply request returns the original report. Re-running with a new
request reuses the deterministic connections and scopes instead of duplicating them.

## What remains before cutover

Backfilled rows are candidates only. Before a winery/domain can prefer them over legacy settings:

1. Resolve ambiguous account/location/provider mappings.
2. Install a reviewed provider adapter and its declared capabilities.
3. Onboard protected credentials and verify account/location access.
4. Hydrate and reconcile canonical data without actioning automation.
5. Approve domain authority and activation watermarks.
6. Prepare and activate the implemented per-winery/domain cutover record, which enforces exactly one
   configuration writer. Booking is the first registered cutover handler; other domains still fail closed.
7. Project sanitized compatibility state one-way for legacy consumers until they are removed.

The backfill itself deliberately does not redirect reads, advance cursors, create credentials, activate
domains, or mutate `WinerySettings`. Those effects remain separate manager operations; see
`INTEGRATION_CONFIGURATION_CUTOVER.md`.
