# Canonical Wine Club Shadow Projection

Status: additive provider-neutral storage, strict shadow projection, manager reads, and customer-merge safety implemented; no Wine Club automation or provider cutover is active

Last reviewed: 2026-08-20

## Purpose

Wine Club data is often split across club, commerce, fulfilment, and customer systems. VinAgent needs a stable
operational view of membership and allocation facts without making any one vendor's identifiers or payload
shape part of its rule engine. Migration `20260821000000-create-canonical-wine-club.js` adds:

- `WineClubProgram`: a winery-owned mapping target for a named club/tier;
- `WineClubMembership`: current provider-neutral membership state linked to an explicit `Member` and program;
- `WineClubMembershipEvent`: idempotent source-backed membership history;
- `WineClubAllocation`: current state for one membership cycle; and
- `WineClubAllocationItem`: the complete line snapshot for that allocation.

Provider identifiers stay in `ExternalResourceReference`. Canonical rows use local integer keys and retain the
authority connection, source revision/update time, observation time, projection quality, and source-deletion
marker. Status vocabularies are bounded in the application registry so adapters cannot introduce arbitrary
states.

## Adapter contract

Provider adapters translate their native payload into `wine-club-shadow.v1` and then call the projector. The
contract requires:

- an active same-winery connection with a `CLUB` scope;
- an explicit same-winery `memberId` and active `programId` mapping;
- stable external IDs, source revisions, source update times, and observation times;
- bounded canonical membership and allocation statuses; and
- `itemsComplete: true` for every allocation, so absent lines can be removed safely.

The contract recursively rejects secret-, credential-, contact-, address-, birth-date-, and payment-card-like
keys, including inside provider extension objects. A native adapter must data-minimize before projection. The
projector never creates or guesses a customer from provider contact data and does not perform fuzzy identity
matching.

## Ordering, lineage, and conflicts

Membership and allocation external IDs are connection-scoped through `ExternalResourceReference`.

- An update older than the stored provider update time is ignored and produces a de-duplicated `OUT_OF_ORDER`
  projection issue.
- A second connection attempting to own the same customer/program membership or membership/cycle allocation
  is not chosen automatically. The incoming reference becomes ambiguous and a blocking `SOURCE_CONFLICT`
  issue is recorded.
- Membership events use `(membershipId, eventKey)` idempotency.
- Allocation lines use `(allocationId, lineKey)` idempotency and are replaced only from a declared-complete
  snapshot.
- Provider extension data is retained only after schema/privacy inspection and is omitted from manager reads.

These guards make repeated fixtures and eventual webhook/poll retries safe while keeping multi-source
authority ambiguity visible for manager resolution.

## Shadow-only safety boundary

Projection returns `automationEligible: false`. It does not emit a canonical automation event, activate a
domain, alter `Member.isWineClubMember`, update spend/order rollups, charge a member, modify an external club,
or create staff work. The legacy member flag remains a compatibility field until a traced rollup and explicit
one-writer cutover are implemented.

This means realistic contract fixtures and local data can be exercised before provider credentials exist,
without historical membership or allocation hydration generating Tasks or Notices.

## Manager surface

All routes are manager/admin-only and winery-scoped:

- `POST /api/integration-management/wine-club-programs`
- `GET /api/integration-management/wine-club-programs`
- `GET /api/integration-management/wine-club-memberships`
- `GET /api/integration-management/wine-club-memberships/:membershipId`

The membership list supports bounded pagination plus status, member, and program filters. Detail includes the
program, source summary, membership event history, allocations, and allocation items without provider
extensions.

## Customer merge safety

Customer merge transfers Wine Club memberships to the retained `Member`. If both source and target already
belong to the same local program, the merge fails before deleting either identity. That ambiguity requires a
future explicit membership-resolution workflow; silently choosing one source would lose subscription and
allocation history.

## Remaining boundary

The next Wine Club slices are deliberately separate:

1. add reviewed native provider translators and conformance fixtures;
2. register provider-neutral Wine Club polling/reconciliation and webhook recovery;
3. add source-authority readiness, shadow comparison, activation, and compatibility cutover;
4. emit guarded live canonical lifecycle events only after activation;
5. add a Wine Club context pack and managed allocation-preparation/exception work; and
6. link charged allocations to canonical sales orders and fulfilment without duplicating either domain.

Until those gates exist, these tables are an explainable shadow projection, not a new operational writer.
