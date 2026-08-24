# Canonical Customer Rollups and Contribution Lineage

Status: stale-protected shadow rebuilds, current relationship/per-currency rollups, contribution history, manager reads, and merge invalidation implemented; legacy Member rollups remain authoritative

Last reviewed: 2026-08-20

## Purpose

The legacy `Member` record contains convenient fields such as `lifetimeSpend`,
`totalOrders`, `visitCount`, `lastVisitAt`, `lastPurchaseAt`, and
`isWineClubMember`. Those fields do not explain which systems, records, currencies, authority states,
or calculation versions produced their values.

Migration `20260821300000-create-customer-rollups.js` adds:

- `CustomerRollupRun`: the immutable rebuild request, input hash, calculation version, actor/reason,
  completion state, and output counts;
- `CustomerRelationshipRollup`: current club, completed-booking, purchase-order, and recency metrics
  for one customer;
- `CustomerMonetaryRollup`: current paid/refunded/net summaries for one customer and one currency; and
- `CustomerRollupContribution`: run-scoped lineage from a canonical Booking, Membership, or Sales
  Order to a specific metric.

Historical contributions retain the customer ID used at calculation time without a destructive foreign key.
`CustomerMergeRedirect` provides the later identity translation when a source Member is merged.

## Calculation v1

`canonical-customer-rollup-v1` applies conservative rules:

- current club membership includes `ACTIVE`, `PAUSED`, `PAYMENT_HOLD`, and
  `CANCELLING` memberships that are not source-deleted;
- completed visits include non-deleted canonical Bookings in `COMPLETED`;
- purchases require an explicitly resolved customer, a non-deleted Sales Order, and a completed/paid/refund
  lifecycle state;
- gross paid and refunded source summaries are aggregated as integer minor units;
- each currency receives its own row and currencies are never converted or added together;
- possible same-order Business Entity Links do not silently remove an order. They mark affected relationship
  and monetary rollups `POSSIBLE_DUPLICATES` while the displayed count remains a raw source count; and
- unresolved/anonymous orders do not contribute to a known customer's rollup.

Every contribution records its resource type/ID, contribution type, currency/amount when applicable, effective
time, authority connection, and a minimal status summary.

## Preview and rebuild

Manager/admin routes:

- `GET /api/integration-management/customer-rollups/preview`
- `POST /api/integration-management/customer-rollups/rebuild`
- `GET /api/integration-management/customer-rollup-runs`
- `GET /api/integration-management/customer-rollup-runs/:runId`

Preview hashes only the canonical fields that affect the calculation. Rebuild requires a UUID-v4 request ID,
the preview token, and a reason. It reloads and rehashes all inputs transactionally; a changed booking,
membership, order, or overlap relationship makes the preview stale. Exact request replay returns the original
run, while request reuse with a different preview or reason fails.

Rebuild atomically updates current relationship rows, replaces the winery's current per-currency rows, appends
run-scoped contributions, and completes the run. The customer relationship endpoint includes the current
canonical relationship and monetary rollups.

## Safety boundary

All rows are `SHADOW_UNVERIFIED` and `automationEligible=false`. Rebuild does not modify any
legacy Member rollup, create work, or emit a canonical event. A potential duplicate-order link is visible as a
quality warning instead of being interpreted as a manager-approved deduplication.

Customer merge transfers canonical Bookings, Sales Orders, Wine Club Memberships, and profile children, then
deletes current rollups for both source and target because their inputs changed. Historical run contributions
remain. A new preview/rebuild is required for the retained customer.

## Cutover path

Moving a legacy field to canonical authority requires separate work:

1. activate and reconcile the contributing Booking, Club, and Commerce domains;
2. resolve duplicate-order and identity ambiguity;
3. compare canonical and legacy results over a defined monitoring period;
4. define currency display/accounting policy rather than manufacturing one lifetime-spend number;
5. add freshness and drift telemetry plus a rebuild schedule;
6. use an audited per-field one-writer cutover; and
7. only then register selected rollup facts for context packs or automations.

Until that process completes, canonical rollups are an explainable review model, not a replacement writer.
