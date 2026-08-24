# Booking Shadow Connector

Status: read-only sync, conformance boundary, and unverified OpenTable native adapter implemented

Last reviewed: 2026-08-18

## Purpose and safety boundary

This connector lets VinAgent securely read a booking source through a provider-neutral contract without
changing that source. Historical hydration builds reviewable state without creating work. After a manager
approves the authority policy and activation watermark, later incremental or reconciliation changes can
produce automation-eligible canonical events.

```text
manager configuration + protected credential
                    |
                    v
          dedicated integration worker
                    |
       read-only health/bookings calls
                    |
                    v
 reference + observation + SOURCE event
                    |
                    v
       typed Booking + CANONICAL outbox
                    |
       +------------+-------------+
       |                          |
 hydration/manual replay    active incremental/reconciliation
 automationEligible=false   guarded post-watermark eligibility
```

Hydration retains `ingestionPurpose=HYDRATION` and `automationEligible=false`; outbox delivery records the
skip and cannot run a rule or create staff work. Incremental and reconciliation jobs require an active,
manager-approved domain activation and recheck that approval when the worker executes. The authority and
activation contract is documented in `docs/CANONICAL_BOOKING_PROJECTION.md`.

## Connector manifest

The initial provider key is `vinagent-booking-feed`. It is a stable VinAgent feed contract for an approved
gateway or provider-specific translator. It avoids treating an undocumented vendor payload as an API
contract. A native vendor adapter can later implement the same normalized booking contract without changing
the downstream projection or rule design. Native implementations now extend the versioned read-adapter
contract and pass the reusable conformance runner described in `docs/BOOKING_ADAPTER_CONFORMANCE.md`.

Connection configuration is deliberately exact:

```json
{
  "baseUrl": "https://bookings-gateway.example.com",
  "contractVersion": "1",
  "shadowMode": true,
  "guestDataMode": "NONE",
  "pageSize": 100
}
```

- `baseUrl` must be one exact HTTPS origin with no credentials, path, query, or fragment.
- Its exact host and port must be in `INTEGRATION_BOOKING_FEED_ALLOWED_HOSTS`.
- `shadowMode` must remain `true`.
- `pageSize` is between 1 and 100.
- A connection needs an active `BOOKING` scope and an `externalLocationId`.
- HTTP is accepted only behind a test-only environment gate.

## Booking Feed v1

All responses are schema-validated with unknown fields rejected. The fixed schema identifier is
`vinagent.booking-feed.v1`.

### Health

```text
GET /v1/health
```

```json
{
  "schemaVersion": "vinagent.booking-feed.v1",
  "status": "ok",
  "accountId": "account-1",
  "locations": [{ "id": "cellar-door", "name": "Cellar Door" }]
}
```

Verification succeeds only when the configured external location is visible to the credential. Successful
verification changes the connection to `CONNECTED` and exposes the `bookings.read.shadow` capability.

### Booking page

```text
GET /v1/bookings?location_id=...&from=...&to=...&cursor=...&limit=...
    &updated_since=...&sync_mode=...
```

```json
{
  "schemaVersion": "vinagent.booking-feed.v1",
  "bookings": [
    {
      "id": "booking-100",
      "revision": "revision-7",
      "status": "CONFIRMED",
      "startAt": "2026-08-22T03:30:00.000Z",
      "endAt": "2026-08-22T05:00:00.000Z",
      "partySize": 6,
      "locationId": "cellar-door",
      "experience": { "code": "paired-tasting", "name": "Paired Tasting" },
      "requirements": [
        {
          "kind": "ADD_ON",
          "code": "truffle-pairing",
          "label": "Paired truffle tasting",
          "quantity": 6
        }
      ],
      "guest": null,
      "createdAt": "2026-08-01T00:00:00.000Z",
      "updatedAt": "2026-08-18T00:00:00.000Z",
      "deletedAt": null
    }
  ],
  "nextCursor": null,
  "hasMore": false,
  "watermarkAt": "2026-08-18T00:01:00.000Z",
  "snapshotComplete": false
}
```

`sync_mode` is one of `HYDRATION`, `INCREMENTAL`, or `RECONCILIATION`. Incremental requests receive a
server-derived `updated_since` checkpoint with a bounded overlap; the checkpoint can never move behind the
manager-approved activation watermark. A final reconciliation page must set `snapshotComplete=true`.
VinAgent accepts only explicit tombstones (`deletedAt` with `CANCELLED`); a booking missing from a page or
snapshot is never inferred to be deleted.

Supported statuses are `ENQUIRY`, `PENDING`, `CONFIRMED`, `SEATED`, `COMPLETED`, `CANCELLED`, and
`NO_SHOW`. Supported requirement kinds are `EXPERIENCE`, `ADD_ON`, `DIETARY`, `ACCESSIBILITY`, `SEATING`,
and `OTHER`. A deleted booking must also have `CANCELLED` status. Free-form notes and payment-card data are
not part of the contract.

Guest retention is configured per connection:

| Mode | Stored guest fields |
| --- | --- |
| `NONE` | None |
| `EXTERNAL_ID` | Provider-scoped guest ID only |
| `IDENTITY_MINIMUM` | External ID, first/last name, email, and phone |

Start with `NONE` unless a reviewed identity-resolution use case requires more.

## Protected credentials

Manager requests can onboard `BEARER_TOKEN`, `API_KEY`, `BASIC`, or `OAUTH_CLIENT_CREDENTIALS` envelopes,
although this feed accepts only bearer tokens and API keys. Secrets are encrypted with AES-256-GCM using a
random IV and authenticated context containing the credential ID, winery, connection, and schema version.

The API returns credential metadata only. It never returns the credential reference, encrypted payload, IV,
authentication tag, key ID, or secret. Rotation creates a new envelope and wipes encrypted material from the
old row. Revocation also wipes that material. Provider authentication rejection changes the connection to
`REAUTH_REQUIRED` and stores only a bounded generic error code/summary.

Runtime settings:

| Setting | Purpose |
| --- | --- |
| `INTEGRATION_CREDENTIALS_ENABLED` | Fail-closed credential-store gate |
| `INTEGRATION_CREDENTIAL_ACTIVE_KEY_ID` | Identifier for newly encrypted values |
| `INTEGRATION_CREDENTIAL_ENCRYPTION_KEY` | Base64-encoded random 32-byte active key |
| `INTEGRATION_CREDENTIAL_PREVIOUS_KEYS_JSON` | At most ten retained key-ID/base64-key pairs during rotation |
| `INTEGRATION_BOOKING_FEED_ALLOWED_HOSTS` | Exact comma-separated outbound host/port allowlist |

Generate and inject keys through the deployment secret manager; do not commit them. During rotation, retain
the prior key in the previous-key JSON until every active credential has been replaced under the new key.
Production preflight validates the active key, retained keyring, and booking-host allowlist when the store is
enabled.

## Manager API flow

All routes are winery-scoped and require `manager` or `admin`:

1. Inspect `GET /api/integration-management/connectors`.
2. Create the connection and BOOKING scope with `POST /api/integration-management/connections`.
3. Store/rotate the secret with `PUT /api/integration-management/connections/:id/credential`.
4. Queue read-access verification with `POST /api/integration-management/connections/:id/verify`, supplying a
   UUID v4 `requestId` for request-level idempotency.
5. After the worker reports the connection as `CONNECTED`, queue a bounded shadow read with
   `POST /api/integration-management/connections/:id/hydration-runs`.
6. Review canonical Booking state and projection issues, establish the `BOOKING / CORE` authority policy,
   obtain an activation preview, and explicitly activate the Booking domain.
7. Queue bounded live reads with
   `POST /api/integration-management/connections/:id/incremental-runs` or completeness-checked reads with
   `POST /api/integration-management/connections/:id/reconciliation-runs`.
8. Inspect bounded run/job metadata through the connection and job APIs.
9. Revoke with `DELETE /api/integration-management/connections/:id/credential` when required.

A hydration request supplies a UUID v4 `requestId`, ISO `from`/`to` values, and `maxPages` from 1 to 50. A
window cannot exceed 31 days. Incremental runs additionally accept `overlapMinutes` from 0 to 1440. The
request ID is part of job idempotency; a job-scoped saved provider cursor allows a bounded partial run to
continue safely on retry without another request taking over its cursor.

## Persisted shadow state

For every valid item VinAgent maintains:

- one connection-scoped `ExternalResourceReference` for `(connection, BOOKING, external ID)`;
- versioned `ExternalResourceObservation` rows keyed by contract schema and a hashed provider revision;
- one redacted, normalized `SOURCE` `IntegrationEvent` per booking revision;
- typed Booking, Item, Requirement, Area Link, and Status Event state;
- one `CANONICAL` event and transactional outbox record per material revision, with eligibility determined
  by ingestion purpose, activation watermark, current connection state, and the approved authority version;
- `IntegrationSyncState` cursor/watermark/lease state and auditable `IntegrationSyncRun` counts;
- a de-duplicated `ProjectionIssue` when an older provider update attempts to replace newer state.

Raw responses are not persisted. Exact revision replay is idempotent. Older updates are recorded as issues and
cannot overwrite the current observation. Stream leases prevent two workers processing the same
connection/location feed concurrently. The worker also renews its ownership-checked job lease while a handler
is active so a bounded multi-page read cannot be reclaimed midway through processing.

Outbound calls disable redirects, use the shared timeout policy, cap responses at 1 MiB, send credentials only
to an operator-allowlisted origin, and translate provider diagnostics into bounded VinAgent-owned errors.

## Deployment and acceptance

Keep both credential storage and the separate integration worker disabled until migrations, runtime secrets,
host allowlists, and worker ownership are reviewed. The minimum activation sequence is:

1. Run migrations and take a database backup according to the normal deployment process.
2. Configure the protected key and exact booking host as runtime secrets.
3. Deploy one integration-worker instance with `INTEGRATION_WORKER_ENABLED=true`.
4. Onboard one non-production or tightly bounded pilot connection.
5. Verify health, hydrate a short window with `guestDataMode=NONE`, and review references, observations,
   issues, job retries, and sync counts.
6. Confirm hydration canonical events are non-eligible and that no Automation Runs, Tasks, or Notices were
   created.
7. Review and activate the authoritative source, then run one bounded incremental poll and one complete
   reconciliation against non-production fixtures before enabling any active automation rule.

The feed contract and durable worker now support hydration, incremental polling, and reconciliation. A
separately gated durable scheduler can automatically queue incremental and reconciliation jobs for eligible
manager-activated streams, with provider-level spacing and fixed-window controls; see
`BOOKING_SYNC_SCHEDULER.md`. The
native-adapter SDK and two structurally different reference translators prove normalized fact equivalence,
and the registered OpenTable Sync adapter passes that corpus. OpenTable partner/pilot verification, webhook
verification, and scheduler production activation remain separate deployment work. A provider-neutral signed
change-hint receiver and Booking recovery dispatcher are implemented, but no native OpenTable webhook adapter
is claimed without its approved provider contract; runs may still be queued
through the protected manager API. See `docs/BOOKING_LIVE_READINESS.md` for the first context pack and manager-installed
operational rule, `docs/PROVIDER_NEUTRAL_WEBHOOK_INTAKE.md` for webhook recovery, and
`docs/OPENTABLE_BOOKING_SYNC.md` for onboarding.
