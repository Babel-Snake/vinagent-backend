# Usage metering and billing-readiness

## Purpose

VinAgent records winery usage from the start of the pilot without taking payment or enforcing a plan. The metering layer is provider-independent so a later payment integration can export selected facts without changing the operational domains.

The system deliberately separates:

* immutable, idempotent usage events for commercially meaningful facts
* hourly counter buckets for high-volume operational traffic
* authoritative daily gauge snapshots for seats, members, and storage
* daily aggregate user engagement without clickstream or customer-content collection

OpenTelemetry and application logs remain observability tools. They are not an invoice source.

## Measurement contract

| Metric | Definition | Storage | Pricing status |
| --- | --- | --- | --- |
| `seat.active` | Current `User` rows with `isActive = true` | daily gauge | pricing candidate |
| `seat.activated`, `seat.deactivated` | Staff activation transitions | immutable event | audit/supporting evidence |
| `user.engaged_seconds` | Visible, focused dashboard time while interaction occurred in the preceding five minutes | event + daily aggregate | analytics only |
| `api.requests` | Authenticated API responses grouped by allowlisted route, method, status, role, and auth mode | hourly counter | operations only |
| `task.created` | Durable Task creation | immutable event and Task source record | value/reporting metric |
| `message.received`, `message.sent` | Durable Message rows separated by direction and channel | immutable event and Message source record | outbound is a pricing candidate |
| `ai.request` | Completed provider request | immutable event | cost metric |
| `ai.input_tokens`, `ai.output_tokens`, `ai.total_tokens` | Provider-reported tokens per completion | immutable event | cost metric |
| `attachment.uploaded_bytes`, `attachment.deleted_bytes` | Attachment lifecycle byte changes | immutable event | supporting evidence |
| `attachment.storage_bytes` | Current non-deleted attachment byte total | daily gauge | pricing candidate |
| `automation.executed` | Successful managed automation execution | immutable event | possible value metric |
| `member.active` | Current winery Member rows | daily gauge | reporting only |

Time and raw internal API request volume must not be used for pilot invoicing. They measure adoption and technical load, not necessarily customer value.

## Data model

### `UsageEvents`

Append-only facts with a UUID, winery, optional actor, metric and schema version, quantity and unit, occurrence time, source reference, tenant-scoped idempotency key, and allowlisted scalar dimensions. There is no update API. Later corrections must be compensating events rather than edits.

The unique `(wineryId, idempotencyKey)` index prevents provider retries, repeated heartbeats, and transaction retries from double counting while allowing separate wineries to use the same external reference.

### `UsageCounterBuckets`

Hourly aggregates for noisy measurements. API paths are reduced to an allowlisted first-level route group. Query strings, record IDs, request bodies, response bodies, email addresses, phone numbers, and customer names are never stored.

### `UsageGaugeSnapshots`

One winery-local daily value per metric/dimension combination. The hourly scheduler uses an idempotent upsert, so restarts or multiple passes update the same daily snapshot rather than producing duplicates.

### `UserActivityDaily`

Per-user daily engaged seconds, session count, request count, and last-active timestamp. The manager API returns only winery aggregates; it does not expose a staff ranking or individual activity history.

### `WineryBillingProfiles`

Provider-independent commercial state. Fresh pilot bootstrap creates `PILOT` / `pilot` / `none` with a `meteringStartedAt` boundary. Nullable provider customer/subscription columns are reserved for a future billing adapter and are not returned by the usage summary API.

### `UsageExportDeliveries`

Reserved outbox state for a future payment or central billing export. Each event/destination pair is unique and records only delivery state and fixed error codes. No exporter runs in the pilot build.

## Engagement heartbeat

The authenticated dashboard creates an in-memory UUID for each browser tab and sends at most one heartbeat per minute. A heartbeat is sent only while:

* the document is visible
* the browser window is focused
* a click, key, pointer, touch, or scroll interaction occurred within five minutes

The server authenticates the user, ignores client winery fields, clamps every interval to 60 seconds, normalizes the route to an allowlisted group, and deduplicates `(user, session, sequence)`. The browser does not record coordinates, keys, selected records, typed content, or raw URLs.

This is an engagement estimate, not payroll, attendance, surveillance, or billable time.

## API

* `POST /api/usage/activity` — any authenticated user; accepts the bounded heartbeat
* `GET /api/usage/summary` — manager/admin; returns aggregate current, period, event, counter, and gauge data
* `POST /api/usage/snapshot` — manager/admin; captures current authoritative gauges
* `POST /api/usage/reconcile` — admin only; compares Task and Message source records with the immutable ledger and refreshes gauges

Summary windows default to 30 days and cannot exceed 366 days. Responses use `Cache-Control: no-store` and exclude payment-provider identifiers and individual staff activity.

## Reconciliation and operations

The server captures gauges immediately after startup and then at `USAGE_SNAPSHOT_INTERVAL_MS` (default one hour). Scheduler failures are logged with winery and fixed error metadata; they do not stop staff workflows.

Before relying on a pilot usage report:

1. Run migrations and confirm `20260808000000-create-usage-metering` is up.
2. Confirm the winery has a `WineryBillingProfile` and a sensible `meteringStartedAt`.
3. Capture a snapshot.
4. Run admin reconciliation.
5. Investigate any Task or Message discrepancy rather than editing ledger rows.
6. Compare AI token totals with the provider dashboard for a controlled sample.
7. Verify attachment storage bytes against the mounted volume.

Events are best-effort during the non-paying pilot so an unavailable metering table cannot interrupt winery operations. Reconciliation makes omissions visible. Before metered charges are enabled, selected billable event writes must become a monitored delivery contract with an agreed correction and late-event policy.

## Future payment adapter

A later adapter should:

* create provider customers/subscriptions without changing winery identity
* map only approved internal metric keys to provider meters
* use the existing event ID/idempotency key as the outbound unique identifier
* write `UsageExportDeliveries` transactionally before delivery and retry safely
* ingest signed, idempotent subscription webhooks into `WineryBillingProfile`
* enforce features through a local entitlement service with a grace period
* never query the payment provider on normal staff requests

Pricing configuration and money amounts must remain outside `UsageEvents`; the ledger records product facts, not a mutable price interpretation.
