# Booking Adapter Conformance

Status: adapter SDK/reference corpus implemented; OpenTable native read adapter registered but live access unverified

Last reviewed: 2026-08-18

## Outcome

VinAgent now has an enforceable boundary between a booking vendor payload and the canonical Booking pipeline:

```text
vendor authentication + request/pagination
                    |
              raw vendor page
                    |
       provider-owned translator v1
                    |
          Booking Feed v1 envelope
                    |
     normalized read-adapter validation
                    |
 observation -> Booking -> canonical event -> automation lifecycle
```

The boundary is tool-agnostic: the sync, projection, context, rule, and generated-work lifecycle layers never
branch on a booking vendor. A native adapter owns authentication, provider requests, rate-limit/error mapping,
pagination, status conversion, time conversion, add-on conversion, and explicit deletion conversion.

The two original reference adapters remain `CONFORMANCE_FIXTURE` and cannot be registered at runtime. The
subsequent `opentable` adapter is a real `NATIVE_PROVIDER` implementation based on OpenTable's documented Sync
API and passes the shared corpus. It remains partner-credential gated and has not been verified against the
pilot account; see `docs/OPENTABLE_BOOKING_SYNC.md`.

## Implemented contracts

`bookingReadAdapter.contract.js` defines `vinagent.booking-read-adapter.v1` and validates:

- bounded hydration, incremental, and reconciliation requests;
- strict normalized Booking pages with unknown fields rejected;
- canonical statuses, timestamps, party sizes, experience and requirement shapes;
- cursor consistency and source-hash integrity;
- configured external-location isolation;
- `NONE`, `EXTERNAL_ID`, and `IDENTITY_MINIMUM` guest-data ceilings;
- terminal reconciliation `snapshotComplete=true`;
- bounded, provider-matching verification results.

The booking worker validates adapter results again at the consumer boundary. An adapter cannot bypass these
guards by returning a page directly.

`nativeBookingAdapter.js` supplies:

- a versioned provider translator definition;
- declared pagination and supported sync modes;
- a `NativeBookingReadAdapter` base that translates every raw page before returning it;
- a hard separation between `NATIVE_PROVIDER` and `CONFORMANCE_FIXTURE` translators.

`bookingAdapterConformance.js` supplies the reusable test runner. It verifies all three sync modes, bounded
pagination, cursor progress, non-regressing watermarks, duplicate observations, privacy limits, complete
reconciliation, and provider-neutral fact equivalence.

## Reference corpus

The common semantic sequence is:

1. confirmed paired tasting for six people with six truffle-pairing portions;
2. rescheduled tasting with the requirement changed to eight portions;
3. explicit cancellation/tombstone.

The reference translators intentionally differ:

| Concern | Cursor reservation shape | Offset visit shape |
| --- | --- | --- |
| Pagination | opaque cursor plus trailing empty page | numeric offset metadata |
| Status | named `booked` / `voided` | numeric lifecycle codes |
| Time | UTC timestamp plus duration | local service date/minute plus UTC offset |
| Experience | nested service key | numeric package category mapped to stable code |
| Add-on | array of extras | supplement dictionary |
| Revision | opaque revision token | numeric sequence |
| Guest | customer identity shape | person/contact shape |

Both produce the same privacy-safe automation facts and the same event/lifecycle inputs:

```text
booking.confirmed  -> truffle quantity 6
booking.changed    -> new time, truffle quantity 8
booking.cancelled  -> explicit source deletion
```

Provider external IDs, revisions, pagination tokens, and source location IDs are lineage—not rule inputs—so
they are intentionally excluded from cross-provider fact equality. Location equality is established later
through the connection's winery-owned scope. The strict page validator still checks that every page belongs
to its configured provider location.

## Adding a real provider

OpenTable is the first implemented provider. For it or another provider:

1. Capture provider API version, credential type, account/location scoping, rate limits, and webhook/polling
   guarantees in the connection manifest.
2. Implement a `NATIVE_PROVIDER` translator and a `NativeBookingReadAdapter` subclass. Keep raw status codes,
   request fields, and response shapes inside that provider directory.
3. Add reviewed raw fixtures for confirmed, changed, cancelled/deleted, pagination, retry/rate-limit, malformed,
   multi-location, and sensitive-data cases. Fixtures must contain synthetic data only.
4. Run the shared corpus plus provider-specific authentication, timeout, retry, and error-redaction tests.
5. Run the existing shadow hydration, activation, incremental, reconciliation, projection, context, rule, and
   `AutomationResourceBinding` tests through the provider adapter.
6. Register the connector manifest only after the translator kind is `NATIVE_PROVIDER` and configuration,
   credentials, outbound-host policy, and read-only permissions are approved.
7. Deploy in `guestDataMode=NONE`, shadow hydrate a bounded window, review issues/counts, and complete a test
   reconciliation before enabling canonical-event activation.

## Live acceptance gate

A native connector is not live-ready until it passes all of the following:

- real authentication and account/location verification with secrets redacted;
- rate-limit, timeout, retry, pagination, cursor/checkpoint, and bounded-response tests;
- status, timezone/DST, quantity, add-on, cancellation, and deletion mapping tests;
- replay, duplicate, older-revision, missed-change reconciliation, and cursor-loop tests;
- multi-account, multi-winery, and multi-location isolation tests;
- guest-data minimization and restricted-requirement checks;
- unchanged canonical event, readiness context, rule decision, Task creation/update/cancel, and human-override
  outcomes against the shared corpus;
- a successful non-production hydration and reconciliation run with reviewed telemetry.

The domain exit criterion still requires two actual, structurally different providers and real partner
verification. OpenTable passing synthetic fixtures proves the implementation boundary, not production access.

## Applying the pattern to other connected apps

Wine club, orders, inventory, delivery, workforce, and communications adapters should use the same layering:
raw provider transport -> domain translator -> strict canonical intake contract -> local projection -> bounded
context. The contract and conformance runner should be domain-specific because facts, authority, privacy, and
deletion semantics differ. Authentication or pagination helpers should only be extracted after real provider
implementations demonstrate a shared pattern.
