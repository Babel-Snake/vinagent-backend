# Provider-Neutral Webhook Intake

Status: canonical connection-scoped intake, endpoint lifecycle, durable dispatch, and Booking recovery implemented

## Purpose

Provider webhooks are notification signals, not authoritative VinAgent facts. A provider may omit fields,
deliver notifications out of order, retry the same event, or stop retrying before VinAgent has recovered a
missed change. This slice therefore accepts only a bounded **change hint**, records it durably, and schedules a
provider read through the same canonical projection path used by polling and reconciliation.

The older `/api/webhooks/integration/:wineryId/:domain` bridge remains available for compatibility. The new
canonical path is `/api/webhooks/providers/:endpointKey`; it is connected to an `IntegrationConnection`, does
not expose a winery ID, and never trusts a webhook body as a complete Booking projection.

## Runtime flow

```text
provider or approved bridge
  -> opaque endpoint lookup
  -> adapter-owned signature verification over exact raw bytes
  -> strict change-hint normalization
  -> idempotent IntegrationEvent receipt (raw payload omitted)
  -> PROVIDER_WEBHOOK_DISPATCH durable job
  -> canonical-domain recovery registry
  -> provider-rate-governed read job
  -> normal evidence, projection, canonical event, and automation path
```

Booking is the first registered recovery domain. Its dispatcher:

- requires the connection to be connected, hydrated, and manager-activated;
- honours a paused Booking stream;
- coalesces into an outstanding incremental or reconciliation job;
- consumes the shared `(BOOKING, providerKey)` spacing/rate-window permit before scheduling a new read;
- queues `BOOKING_INCREMENTAL` with the receipt as its source event; and
- leaves webhook hints ineligible for automation so only recovered canonical facts can trigger rules.

If a connection is still awaiting credentials, hydration, or activation, receipt intake can be configured and
tested, but the durable dispatch job retries and eventually reaches the normal dead-letter controls rather
than projecting incomplete webhook data.

## Common change-hint contract

The built-in adapter key is `vinagent.hmac-change-hint`, version `1`, contract
`vinagent.integration-webhook-adapter.v1`. It is a provider-neutral bridge envelope. A later native provider
adapter can verify its vendor-specific signature and emit the same normalized shape.

```json
{
  "schemaVersion": "vinagent.webhook-change-hint.v1",
  "eventId": "stable-provider-event-id",
  "eventType": "booking.changed",
  "occurredAt": "2026-08-20T05:00:00.000Z",
  "providerEventVersion": "7",
  "correlationId": "optional-provider-correlation",
  "changes": [
    {
      "resourceType": "BOOKING",
      "externalId": "provider-booking-id",
      "changeKind": "UPSERT"
    }
  ]
}
```

`eventId` is required and provides replay protection within the endpoint/connection stream. Each request is
limited to 20 change hints. Change kinds are `UPSERT`, `DELETE`, or `UNKNOWN`; the read/reconciliation result,
not the hint, determines the canonical outcome. Every resource type in one request must match the endpoint's
canonical domain.

## HMAC signing

The manager API returns a generated 256-bit secret only when an endpoint is created or rotated. The sender
sets:

- `x-vinagent-webhook-timestamp`: ten-digit Unix seconds;
- `x-vinagent-webhook-signature`: `sha256=<lowercase hex HMAC>`.

The signed bytes are:

```text
timestamp + "." + exact HTTP request body bytes
```

The default replay window is 300 seconds and may be configured from 30 to 3600 seconds. Signature comparison
is timing-safe. A bad signature creates no event or job. Rotation invalidates the previous secret immediately.

## Protected endpoint lifecycle

Manager/admin routes:

- `GET /api/integration-management/webhook-adapters`
- `GET /api/integration-management/connections/:id/webhook-endpoints`
- `POST /api/integration-management/connections/:id/webhook-endpoints`
- `POST /api/integration-management/connections/:id/webhook-endpoints/:endpointId/rotate`
- `POST /api/integration-management/connections/:id/webhook-endpoints/:endpointId/lifecycle`

Create body:

```json
{
  "domain": "BOOKING",
  "adapterKey": "vinagent.hmac-change-hint",
  "configuration": { "maxAgeSeconds": 300 }
}
```

Lifecycle actions are `DISABLE`, `ENABLE`, and `REVOKE`. Revocation deletes the encrypted verification
material and is irreversible. A disabled connection cannot create, enable, or receive through an endpoint.
Only one active endpoint is allowed for a connection/domain/adapter tuple.

Verification material uses the existing integration credential keyring and AES-256-GCM, but has separate AAD
and storage in `IntegrationWebhookEndpoints`. It is never placed in connection configuration, an event, a job,
logs, or a listing response. Configure the `INTEGRATION_CREDENTIAL_*` environment settings documented in
`.env.example` before creating endpoints.

## Stored receipt and privacy boundary

An accepted hint creates an `IntegrationEvent` with:

- `intakeMethod = provider_webhook` and `eventClass = INTAKE`;
- connection-scoped `eventScopeKey` plus provider `eventId` idempotency;
- only the normalized resource hints in `normalizedPayload`;
- `rawPayload = null` and a SHA-256 body digest in bounded metadata;
- `automationEligible = false`; and
- adapter/endpoint lineage without any verification material.

New receipts return HTTP `202`; exact replays return HTTP `200` with the original receipt and dispatch job.
The receipt and job are committed in one database transaction.

## Adding a provider or canonical domain

Native provider support has two independent registrations:

1. An integration webhook adapter verifies the provider's documented signature scheme and returns the strict
   normalized change-hint contract. It must not project provider payloads directly.
2. A canonical recovery handler converts a verified hint into a safe read/reconciliation job for its domain,
   preserving connection scope, activation, pause, idempotency, provider-rate, and canonical projection rules.

An adapter may support several domains, but endpoint creation is refused until that canonical domain has a
registered recovery handler. This prevents a webhook from being accepted into a pipeline that can never
recover its authoritative facts.

OpenTable remains polling-only in this repository until approved partner documentation and credentials reveal
its actual webhook availability and signature contract. No guessed OpenTable webhook adapter is registered.

## Verification coverage

Automated coverage includes exact-byte HMAC verification, timestamp expiry, payload/domain rejection,
encrypted secret storage, one-time disclosure, tenant-scoped management, replay deduplication, raw-payload
omission, rotation, disablement, durable dispatch creation, Booking provider permits, and outstanding-job
coalescing.
