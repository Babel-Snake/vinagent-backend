# Evidence-backed Business Entity Relationships

Status: bounded cross-domain links, append-only evidence, manager review lifecycle, and customer-merge safety implemented; links are not yet automation inputs

Last reviewed: 2026-08-20

## Purpose

Canonical foreign keys remain the correct representation for stable relationships such as Booking to Member,
Membership to Program, Allocation to Membership, or Sales Order to Member. Some useful cross-system
relationships are optional, inferred, or asserted by multiple providers and cannot be made a foreign key
without guessing.

Migration `20260821200000-create-business-entity-links.js` adds:

- `BusinessEntityLink`: one normalized relationship between two winery-scoped canonical entities,
  with confidence, review state, and validity; and
- `BusinessEntityLinkEvidence`: append-only observations supporting that relationship, with
  derivation, version, source references, confidence, observation time, and a content hash.

The first bounded relationship definitions are:

- `BOOKING_RESULTED_IN_ORDER`: `BOOKING -> SALES_ORDER`;
- `POSSIBLE_SAME_CUSTOMER`: symmetric `CUSTOMER <-> CUSTOMER`; and
- `POSSIBLE_SAME_SALES_ORDER`: symmetric `SALES_ORDER <-> SALES_ORDER`.

The latter two never merge records. They make ambiguity explicit so a manager or later resolver can decide
what to do without destroying source identity.

## Validation and idempotency

The registry fixes the allowed endpoint types and direction for every relationship. Both entities, the
evidence creator, connection, source event, and source reference are tenant-validated. When multiple evidence
references are supplied, their connection/resource relationships must agree.

Symmetric endpoints are normalized before a SHA-256 link key is built, so reversed proposals converge on one
link. Evidence is idempotent by `(businessEntityLinkId, evidenceKey)`. Reusing an evidence key with
different facts fails; retrying the same facts with a later receipt time remains a no-op.

Evidence metadata is size-bounded and recursively rejects credentials, secrets, contact/address/birth-date
keys, and payment instrument/bank fields. Evidence summaries must be concise and should describe operational
proof rather than copy provider payloads.

## Review lifecycle

Proposals can be `SOURCE_ASSERTED`, `DETERMINISTIC`, or `AI_INFERRED`. AI evidence
requires an explicit confidence. Every non-manager proposal begins `UNREVIEWED`.

Managers/admins can:

- confirm an unreviewed link;
- reject an unreviewed link;
- invalidate an unreviewed or previously confirmed link; or
- create an already confirmed relationship with an explicit reason.

Commands require UUID-v4 request IDs and reasons. Each transition writes an
`IntegrationOperationAuditEvent`; exact request replay is safe, and request reuse for another link or
relationship fails. Rejection/invalidation ends validity but retains the link and all evidence.

Customer merge retargets relationship endpoints in the same transaction. A relationship that collapses into a
self-link, or duplicates an existing normalized link, is invalidated rather than deleted. Canonical Bookings,
Sales Orders, Wine Club Memberships, customer profile children, and relationship links all move before the
source Member is removed.

## Manager surface

- `GET /api/integration-management/business-entity-link-definitions`
- `GET /api/integration-management/business-entity-links`
- `POST /api/integration-management/business-entity-links`
- `GET /api/integration-management/business-entity-links/:linkId`
- `POST /api/integration-management/business-entity-links/:linkId/confirm`
- `POST /api/integration-management/business-entity-links/:linkId/reject`
- `POST /api/integration-management/business-entity-links/:linkId/invalidate`

List filters support relationship type, confirmation state, or either side of a canonical entity.

## Safety boundary and next steps

Every response currently reports `automationEligible: false`, including manager-confirmed links.
Confirmation is necessary but not sufficient for action: a future context resolver must explicitly register
which relationship definitions it accepts, require active/confirmed state, apply freshness rules to evidence,
and include the relationship in an explainable context pack.

Generic links must never replace a typed foreign key. The next relationship work is to add:

1. native adapter assertions for provider booking/order references;
2. a manager resolution path that can safely convert confirmed same-order/customer candidates into the
   domain-specific merge or authority workflow;
3. confirmed-link read-through in customer and operational context packs; and
4. drift/reconciliation checks when a source stops asserting a previously observed relationship.
