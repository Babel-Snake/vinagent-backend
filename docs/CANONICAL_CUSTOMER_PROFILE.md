# Canonical Customer Profile Foundation

Status: additive contact/address/consent/milestone storage, safe legacy backfill, relationship read model, and
merge transfer implemented; `Member` remains the writer

## Purpose

VinAgent already uses `Member` as its winery-scoped customer identity. This slice keeps that root and adds the
history and provenance structures needed to explain a customer's relationship across CRM, Wine Club,
Booking, commerce, communications, and fulfilment providers without creating a competing Customer table.

The new child tables are:

- `CustomerContactPoint`: normalized email/phone identity, display value, verification, validity, suppression,
  primary state, and optional external-source lineage;
- `CustomerAddress`: normalized-address fingerprint, typed address fields, validity/primary state, and source
  lineage;
- `CustomerConsent`: append-only channel/purpose/state assertions with effective time, collection source,
  evidence reference, and supersession;
- `CustomerLifecycleMilestone`: source/derivation-backed relationship events such as customer creation, first
  booking, first purchase, club join, or re-engagement.

The vocabularies are bounded in code rather than database enums so reviewed domains can extend them without
rewriting historical rows. Contact lookup is indexed by winery, type, normalized value, and validity; it is
not globally unique because shared household or organisational contacts are legitimate and must not force an
identity merge.

## Safe legacy backfill

Manager/admin routes:

- `GET /api/integration-management/customer-profile-backfill/preview`
- `POST /api/integration-management/customer-profile-backfill/apply`

Apply requires a UUID-v4 request ID, the current preview token, and a reason:

```json
{
  "requestId": "11111111-1111-4111-8111-111111111111",
  "previewToken": "64-character-preview-hash",
  "reason": "Create additive customer profile projections for manager review."
}
```

The preview is PII-free and reports only counts and safety rules. Its token includes the relevant Member
projection inputs, so an edit between preview and apply makes the command stale. Apply locks the winery,
runs transactionally, is request-idempotent, and writes a PII-free
`CUSTOMER_PROFILE_BACKFILL_APPLIED` audit event.

Backfill behavior is deliberately conservative:

- normalized Member email and phone become unverified/unknown primary contact projections;
- a populated Member address becomes one primary address projection;
- each available email/phone channel receives `MARKETING / UNKNOWN` consent;
- `Member.marketingOptIn=true` is **not** converted to `GRANTED`, because the old merged flag does not prove
  purpose, channel, evidence, or effective time;
- Member creation becomes the evidence-backed `CUSTOMER_RECORD_CREATED` milestone;
- no external customer ID, club membership event, first purchase, or first visit is inferred; and
- reruns reuse stable source keys, refresh Member-owned projections, and invalidate removed legacy contact or
  address projections rather than leaving them current.

## Relationship read model

`GET /api/members/:id/relationship-profile` is manager/admin-only and winery-scoped. It returns the
Member, contact points, addresses, consent history, milestones, current canonical relationship/per-currency
rollups when rebuilt, and migration status. The migration block explicitly states that Member is still the
writer and reports whether the contact/address projections match it.

This endpoint is a review/read-through boundary; it does not make the new tables authoritative yet.

## Merge safety

The existing manager customer merge transaction now transfers all four child types before the source Member
is deleted:

- identical normalized contacts and address fingerprints are deduplicated;
- validity, primary, and available verification state are retained conservatively;
- append-only consent and milestone rows are retargeted without collapsing their source lineage; and
- canonical Bookings, Wine Club Memberships, Sales Orders, and optional Business Entity Links are
  transferred or safely invalidated before source deletion;
- current derived customer rollups for both identities are deleted as stale while historical contributions
  remain; and
- the response reports transferred and deduplicated counts.

External references and redirect-chain safety continue through `CustomerMergeRedirect`.

## Current boundary and next steps

This is migration stage 1, not the contact/consent cutover:

1. `Member` fields remain the write authority and compatibility projection.
2. Customer create/update, secure address change, intake enrichment, and provider projection still need a
   shared dual-write service plus drift telemetry.
3. Identity matching and outbound-message consent policy must move to a read-through resolver only after
   dual-write comparison is clean.
4. A manager consent command must require explicit evidence and append a new event; existing rows must never
   be edited into a different decision.
5. Wine Club Membership and commerce projections will add their own external references and lifecycle
   milestones rather than changing `isWineClubMember` or spend rollups without traceable source facts.
