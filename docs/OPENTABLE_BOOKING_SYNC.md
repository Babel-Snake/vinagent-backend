# OpenTable Booking Sync

Status: native read adapter implemented and registered; partner access and live pilot verification pending

Last reviewed: 2026-08-19

## Scope

The `opentable` connector implements the read-only OpenTable Sync Reservations API behind VinAgent's
`vinagent.booking-read-adapter.v1` contract. It supports:

- OAuth 2.0 client-credentials token acquisition;
- one configured OpenTable restaurant ID (`rid`) per connection;
- bounded hydration and completeness-checked reconciliation by scheduled-time window;
- incremental reads using `updated_after` plus the normal VinAgent overlap window;
- offset pagination calculated locally rather than following provider-returned URLs;
- confirmed, seated/arrived, completed, cancelled, and no-show status mapping;
- UTC booking/update timestamps and DST-aware local query windows;
- explicitly mapped experiences, selected add-ons, and reviewed visit tags;
- `NONE`, `EXTERNAL_ID`, and `IDENTITY_MINIMUM` guest-data ceilings without calling the Guest API.

OpenTable requires partner approval and grants Sandbox/Production access according to the approved use case.
The implementation follows the public OpenTable developer documentation, but this repository has not used a
Sidewood partner credential or restaurant ID. Registration makes the adapter available for reviewed onboarding;
it does not mean the pilot is connected or production-verified.

This is a read/projection adapter. It does not implement the older `booking_execution` factory used to create
reservations, and it does not make that write capability production-ready.

## Configuration

Create the connection with provider key `opentable`, one active Booking scope, and the restaurant ID supplied
by OpenTable as `externalLocationId`.

```json
{
  "apiBaseUrl": "https://platform.opentable.com",
  "oauthBaseUrl": "https://oauth-host-issued-by-opentable.example",
  "contractVersion": "1",
  "shadowMode": true,
  "guestDataMode": "NONE",
  "pageSize": 100,
  "timeZone": "Australia/Adelaide",
  "experienceMappings": [
    {
      "externalId": "324887",
      "code": "paired-tasting",
      "name": "Paired Tasting",
      "durationMinutes": 90
    }
  ],
  "addOnMappings": [
    {
      "externalId": "946651ee-4252-4e3d-945f-eafb6f252b86",
      "code": "truffle-pairing",
      "label": "Paired truffle tasting",
      "kind": "ADD_ON"
    }
  ],
  "visitTagMappings": [
    {
      "externalValue": "Reviewed provider tag",
      "code": "reviewed-requirement",
      "label": "Restricted requirement",
      "kind": "DIETARY"
    }
  ]
}
```

Both API/OAuth origins must be exact HTTPS origins and their exact hosts must be present in
`INTEGRATION_OPENTABLE_ALLOWED_HOSTS`. Use the environment-specific origins issued during OpenTable partner
onboarding; do not assume the illustrative OAuth origin above.

The protected credential endpoint accepts only:

```json
{
  "credentialType": "OAUTH_CLIENT_CREDENTIALS",
  "secret": {
    "clientId": "<issued-client-id>",
    "clientSecret": "<issued-client-secret>"
  }
}
```

The client secret is encrypted by the existing connection credential store. Access tokens remain in worker
memory for their bounded lifetime and are not persisted.

## Mapping and privacy rules

OpenTable IDs do not become winery-owned codes automatically.

- Every returned experience must have an `experienceMappings` entry.
- Every selected experience add-on must have an `addOnMappings` entry.
- Missing mappings fail the page with a bounded operator-facing code instead of silently discarding an
  operational requirement or leaking an OpenTable identifier downstream.
- Only explicitly configured visit tags become requirements. Unmapped tags are ignored.
- `guest_request`, venue notes, OpenTable notes, provider add-on names/descriptions, and other free text are
  never copied into the Booking projection.
- The adapter does not call the OpenTable Guest endpoint. In `NONE` mode even the guest reference is removed.

Experience duration is winery-owned mapping data because the Sync reservation response does not guarantee an
end time. When `durationMinutes` is absent, canonical `endAt` remains unknown.

## Polling and reconciliation

OpenTable uses local scheduled-time filters and a UTC `updated_after` filter. VinAgent converts its UTC window
to the configured IANA time zone and tests both standard/daylight offsets. The adapter uses the local observation
time as its checkpoint because the page does not expose a server watermark; the existing incremental overlap
therefore remains mandatory to cover updates racing a poll.

The adapter calculates the next offset from the validated response and never follows `nextPageUrl`. A terminal
reconciliation page attests completion for the requested bounded window. Absence still does not imply deletion:
only an explicit OpenTable `Cancelled` observation becomes a canonical tombstone.

VinAgent's disabled-by-default durable Booking scheduler can queue these incremental and reconciliation reads
after hydration and manager activation. OpenTable-specific cadence and minimum spacing are operator policy,
configured outside this adapter after the issued partner rate limits are confirmed. See
`BOOKING_SYNC_SCHEDULER.md`.

Webhook v3 ingestion is not part of this slice. Polling/reconciliation remains the recovery authority until a
signed/credential-verified webhook receiver and hydration-on-notification path are implemented.

## Activation checklist

1. Obtain OpenTable partner approval with Sync Reservations API access for the intended Sandbox/Production tier.
2. Confirm the issued API origin, OAuth origin, token flow, restaurant ID, rate limits, and permitted data use.
3. Add only those exact hosts to `INTEGRATION_OPENTABLE_ALLOWED_HOSTS`.
4. Catalogue the pilot restaurant's active experience, selected add-on, and operational visit-tag IDs; approve
   winery-owned mappings with the cellar-door manager.
5. Create the `opentable` connection in `shadowMode=true` and `guestDataMode=NONE`, then store the OAuth client
   credential through the protected endpoint.
6. Verify access and hydrate a short non-actioning Sandbox window. Review counts, unmapped failures, locations,
   sensitive-data boundaries, and canonical Booking output.
7. Complete an incremental poll and reconciliation in Sandbox, including confirmed/change/cancel cases.
8. Repeat the bounded shadow review with the approved production restaurant before manager activation.

Until these checks are completed with real partner access, documentation and deployment preflight must describe
the connector as implemented but unverified—not live.
