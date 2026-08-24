# Canonical Commerce Shadow Projection

Status: additive provider-neutral order, line, payment-summary, and refund-summary storage with strict shadow projection and manager reads implemented; no commerce automation or provider cutover is active

Last reviewed: 2026-08-20

## Purpose

VinAgent needs purchase and fulfilment context from POS, ecommerce, CRM, and Wine Club systems without
becoming the payment processor or copying a provider-specific order schema. Migration
`20260821100000-create-canonical-commerce.js` adds:

- `SalesOrder`: current provider-neutral order, payment, fulfilment, and monetary summary state;
- `SalesOrderLine`: complete typed order lines with optional explicit winery-product and variant mapping;
- `PaymentSummaryEvent`: append-only non-sensitive payment lifecycle facts; and
- `RefundSummary`: ordered, source-backed refund state with an optional order-line relationship.

All monetary values are integer minor units with an explicit ISO currency. Provider identifiers remain in
`ExternalResourceReference`; current rows retain their source connection, revision, provider update time,
observation time, source hash, projection quality, and source-deletion marker.

## Adapter contract

Provider translators produce `commerce-order-shadow.v1`. Projection requires an active same-winery
`COMMERCE` connection scope, stable source identifiers/revisions/timestamps, bounded canonical states, and a
declared-complete line snapshot (`linesComplete: true`).

Identity is explicit:

- `customerResolutionStatus=RESOLVED` requires a same-winery `memberId`;
- unresolved or genuinely anonymous orders retain a null customer link and cannot be treated as known-person
  history;
- `productResolutionStatus=RESOLVED` requires a same-winery `wineryProductId`;
- an optional `productVariantId` must be an active same-winery variant of that exact Winery Product; and
- provider SKU or description is never used to guess a product mapping.

The contract recursively rejects contact/address/birth-date fields, secrets, credentials, card/PAN/CVV data,
bank-account/routing data, and similar fields, including inside extension or metadata objects. The allowed
payment surface is limited to state, method class, amount/currency, time, failure category, and a
non-sensitive provider transaction reference.

## Idempotency, ordering, and conflict behavior

- Order and refund external IDs are connection-scoped references.
- Older provider update times are ignored and create de-duplicated `OUT_OF_ORDER` issues.
- Two external IDs from the same connection claiming one order number create a blocking `SOURCE_CONFLICT`;
  VinAgent does not merge them.
- Complete line snapshots upsert stable `lineKey` values and remove lines absent from the new complete set.
- Payment events are immutable by `(salesOrderId, eventKey)`. An exact replay is a no-op; reuse of the key with
  different facts retains the original event and creates a blocking conflict issue.
- Refunds update only through their own ordered source observation. Absence from a later order snapshot does
  not imply deletion.
- Removing an order line preserves any refund summary and clears only its optional line pointer.

Cross-provider order correlation is intentionally deferred to evidence-backed entity relationships. Order
numbers from different systems are not assumed to identify the same sale.

## Shadow-only safety boundary

Projection returns `automationEligible: false` and `rollupsUpdated: false`. It does not emit canonical
automation events, mutate an external provider, charge/refund a customer, create work, or update the legacy
`Member.lifetimeSpend`, `totalOrders`, or `lastPurchaseAt` fields. Those fields remain compatibility rollups
until a source-defined, currency-aware, rebuildable rollup and one-writer cutover exist.

Customer merge retargets canonical Sales Orders to the retained Member inside the existing transaction. Orders
with unresolved identity remain unresolved.

## Manager surface

The manager/admin-only, winery-scoped read surface is:

- `GET /api/integration-management/sales-orders`
- `GET /api/integration-management/sales-orders/:salesOrderId`

List filters include canonical status, member, authority connection, and a bounded placed-time range. Detail
returns the source summary, explicit customer/location mapping, lines, payment events, refund summaries, and
Wine Club allocation links. Provider extension objects are omitted.

## Remaining boundary

The next commerce slices are separate approval and trust steps:

1. add provider conformance fixtures and native read-only translators;
2. register polling/reconciliation and webhook recovery;
3. add commerce authority, shadow comparison, and manager activation;
4. emit live canonical commerce events only after activation;
5. add order-payment/fulfilment context packs and managed exception work;
6. introduce traceable, currency-aware Member rollups with drift comparison and cutover; and
7. permit external refunds or order changes only through a future risk-classified command layer.

Until then, commerce is an explainable local shadow projection and cannot action operational work.
