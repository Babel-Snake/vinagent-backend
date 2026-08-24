# Canonical Catalogue and Inventory

Status: additive provider-neutral catalogue mappings, inventory shadow projection, immutable history,
deterministic demand commitments, and freshness-safe availability reads implemented; inventory activation
and provider-specific connectors remain disabled

Last reviewed: 2026-08-20

## Purpose

VinAgent needs to answer operational questions such as “does the cellar door have enough paired-truffle
portions for this booking?” without embedding one stock vendor's schema in automation rules. The canonical
inventory slice separates these concerns:

- `WineryProduct` remains the winery-owned product identity and merchandising record.
- `ProductVariant` is the exact stock-keeping form, SKU, pack, and unit.
- `StockLocation` is an inventory location and is not an Operational Area.
- `InventoryPosition` is the latest resolved quantity for one variant/location pair.
- `InventorySnapshot` is immutable observation history.
- `InventoryCommitment` is demand expected by Booking, Wine Club, Commerce, or an internal event; it is not a
  claim that the provider has reserved stock.
- `InventoryDemandMapping` is an audited, manager-confirmed translation from a source code to an exact
  variant/location and quantity multiplier.

Migrations `20260821400000-create-canonical-inventory.js` and
`20260821410000-create-inventory-demand-mappings.js` create this graph. The first migration also backfills one
default variant for every existing Winery Product and one default stock location for every existing Winery
Location. It does not alter the existing product UI, price, vintage, or coarse `stockStatus`.

## Position adapter contract

Provider translators emit `inventory-position-shadow.v1`. Projection requires:

- an active same-winery `INVENTORY` connection scope;
- explicit, active, same-winery `productVariantId` and `stockLocationId` mappings;
- stable external ID, source revision, source-update time, assertion time, observation time, and stale time;
- explicit quantity unit and current on-hand/available values;
- a stale time later than observation time; and
- an incoming expected time whenever incoming quantity is positive.

The contract rejects unknown top-level fields and recursively rejects credentials, secrets, personal contact
or address data, payment-card details, and bank-account fields inside provider extensions. A provider cannot
assert manager-confirmed quality.

The current key is `(wineryId, stockLocationId, productVariantId)`. A second source claiming that key does not
win implicitly: the existing position becomes `CONFLICTING`, the new reference becomes ambiguous, and a
blocking `SOURCE_CONFLICT` issue is recorded. Older observations create an `OUT_OF_ORDER` issue and are
ignored. Replaying identical source state reuses the current row and history key; a material newer observation
appends one snapshot.

## Demand mappings and commitments

A manager can map an exact source code at winery scope or connection scope. Connection-scoped mappings take
precedence. The implemented derivation is:

```text
BookingRequirement code
  -> manager-confirmed InventoryDemandMapping
  -> deterministic InventoryCommitment for the Booking
  -> freshness-safe available-to-promise check
  -> booking.readiness.v1 inventory context
```

Creating, changing, disabling, or replaying a mapping uses a UUID request ID, writes an
`IntegrationOperationAuditEvent`, and refreshes matching existing Bookings transactionally. New Booking
projections refresh commitments after their complete requirement set is stored. Removed/disabled mappings
cancel active derived commitments; confirmed/in-progress Bookings produce `EXPECTED` demand, completed
Bookings produce `CONSUMED`, and cancelled/no-show/source-deleted Bookings produce `CANCELLED`.

Restricted dietary/accessibility requirements are never used as inventory mapping inputs. Mapping metadata
contains operational IDs and source codes only.

The storage and registry already support `WINE_CLUB_ALLOCATION_ITEM` and `SALES_ORDER_LINE` mapping types.
Their automatic commitment derivations remain a later slice; the manager API must not imply they are active.

## Available-to-promise safety

The calculation starts from the source-reported `availableQuantity` and conservatively subtracts every
`EXPECTED` or `RESERVED` VinAgent commitment due at or before the requested time. It returns a useful
`AVAILABLE` or `SHORTAGE` result only when:

- the exact active variant and stock location exist;
- one non-deleted current position exists;
- its quality is source-asserted or manager-confirmed;
- its stale time is still in the future;
- its observation is not implausibly in the future; and
- the requested unit and every included commitment unit match exactly.

Otherwise it fails closed with `UNKNOWN`, `STALE`, `UNIT_MISMATCH`, or `SOURCE_CONFLICT` plus a reason code.
Missing stock must never be interpreted as zero or safe stock.

Incoming stock is excluded by default. A caller may explicitly set `includeIncoming=true`; it is then included
only when the source provides a positive quantity and expected arrival no later than the required time. The
response says whether incoming was included.

`calculationReliable=true` means the arithmetic inputs passed these guards. Inventory remains shadow-only, so
the response still has `automationEligible=false` until a separate authority/activation slice approves live
inventory conclusions.

## Booking readiness

`booking.readiness.v1` now searches for active truffle commitments belonging to the Booking:

- no mapping/commitment returns `UNKNOWN / INVENTORY_DEMAND_UNMAPPED`;
- stale, missing, unit-conflicting, or authority-conflicting stock remains explicitly unsafe;
- reliable negative available-to-promise returns `SHORTAGE`;
- reliable non-negative available-to-promise returns `AVAILABLE`.

The existing manager-installed preparation rule still creates human-owned work from an activated Booking
event. Its payload now records the actual readiness status instead of always claiming inventory is unknown.
Inventory state itself does not yet emit automation events.

## Manager API

All routes are manager/admin-only and winery-scoped:

- `GET|POST /api/integration-management/product-variants`
- `GET|POST /api/integration-management/stock-locations`
- `GET /api/integration-management/inventory-positions`
- `GET /api/integration-management/inventory-positions/:inventoryPositionId`
- `GET /api/integration-management/inventory-commitments`
- `GET /api/integration-management/inventory-availability`
- `GET|POST /api/integration-management/inventory-demand-mappings`

The position list can filter by variant, stock location, and freshness. Detail returns bounded immutable
history plus a conservative current calculation. Provider extensions are not returned.

## Remaining activation boundary

No real credentials are required to test this slice. Fixture adapters can project the strict contract and
manager mappings can be configured against canonical test data.

Before live inventory can autonomously create/cancel work, the remaining slices must add:

1. provider conformance fixtures and native read-only inventory translators;
2. inventory polling/reconciliation and webhook-recovery registrations;
3. field-group authority policies and manager activation with freshness thresholds;
4. automatic Wine Club allocation and Sales Order line commitments;
5. shortage/readiness canonical events and managed Task/Notice lifecycle rules;
6. drift dashboards for unresolved SKU/location mappings and stale positions; and
7. a separately approved write-command layer if VinAgent ever creates real provider reservations.

Until those gates pass, inventory enriches human review but cannot claim a provider reservation or take an
external stock action.
