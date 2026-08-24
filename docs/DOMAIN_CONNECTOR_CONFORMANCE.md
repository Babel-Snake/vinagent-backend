# Domain Connector Contract and Conformance

Status: reusable contract implemented; real non-Booking provider adapters pending credentials

Last reviewed: 2026-08-20

## Boundary

Every connected application may have different authentication, pagination, status names, and payloads. The
provider adapter owns those differences. Everything after the adapter consumes the same normalized change
page:

```text
provider response -> provider adapter -> normalized change page -> domain projector
```

The reusable contract is `services/integrations/domainConnector.contract.js`. Booking retains its stricter
Booking-specific adapter/feed contract and conformance scenarios.

## Manifest

A connector manifest declares:

- stable connector and provider keys;
- one VinAgent domain and adapter/contract versions;
- native, gateway, or conformance-fixture kind;
- exact canonical resource types it can emit;
- supported protected credential types;
- polling/webhook transports;
- the read capability key verified during onboarding.

A runtime registry rejects duplicate connectors and all conformance fixtures. A runtime manifest cannot
disguise a fixture/mock/test provider as a native adapter.

## Runtime methods

An adapter implements:

- `verifyConnection(context)`, returning only connected state, check time, and the verified capability;
- `readChanges(request)`, returning at most 1,000 normalized changes, cursor state, watermark, and
  reconciliation completeness.

Each normalized change contains resource type, external identity, unique event key, canonical event type,
schema version, occurrence/source-update time, and one domain projection payload. The contract rejects:

- credential-like keys anywhere in returned data;
- undeclared resource types;
- duplicate event keys in a page;
- inconsistent terminal cursors;
- terminal reconciliation without `snapshotComplete`;
- projection payloads over 64 KiB;
- malformed timestamps, resource keys, or schemas.

Provider/customer data permitted by a domain's projection contract may exist in its internal projection
payload. Credentials never may. Manager-facing serializers and bounded contexts apply the narrower
role/privacy policy.

## Conformance runner

`runDomainConnectorConformance` runs fixture adapters only. It verifies the connection contract, executes
each supplied sync scenario twice, requires byte-stable normalized output, and records SHA-256 scenario and
report digests.

A production adapter is not ready merely because it compiles. Before registration it should add fixtures for:

- initial hydration, incremental updates, and reconciliation;
- pagination/cursor termination;
- replay and out-of-order source data;
- tombstones/deletes;
- status, time, money, quantity, and unit translations;
- multiple accounts/locations;
- restricted-data boundaries;
- equivalence with another provider in the same domain.

The generic unit suite proves the reusable boundary without external credentials. Real credentials are needed
only for adapter verification, rate-limit behavior, provider error classification, and pilot reconciliation.
