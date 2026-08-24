# Booking Sync Scheduler

Status: durable provider-neutral Booking polling scheduler implemented; disabled by default

Last reviewed: 2026-08-19

## Purpose

The Booking scheduler turns an approved canonical Booking connection into ongoing incremental and
reconciliation reads. It does not contain provider API logic. It creates the same `BOOKING_INCREMENTAL` and
`BOOKING_RECONCILE` durable jobs used by the protected manager endpoints, so every registered Booking read
adapter continues through the same validation, projection, activation, retry, and automation boundaries.

The Booking scheduler is registered through the provider-neutral integration scheduler registry. The worker
invokes all registered domain schedulers before claiming its normal job batch, so a newly scheduled job can run
in the same worker cycle without the worker containing Booking-specific branching. See
`INTEGRATION_SCHEDULER_REGISTRY.md`.

## Eligibility gates

A stream is considered only when all of these remain true at scheduling time:

- its connection is `CONNECTED`;
- it has a completed initial Booking hydration and a source watermark;
- its operational stream status is `ACTIVE`, not manager-paused;
- the manager-approved Booking domain activation is still `ACTIVE`;
- both `bookings.read.shadow` and `bookings.canonical.events.live` are enabled, available, polling-capable
  connection capabilities;
- the stream is due according to `IntegrationSyncState.nextScheduledAt`;
- no incremental or reconciliation job for the same stream is pending, retrying, or running.

Connection edits, credential rotation/revocation, and activation invalidation already disable these gates.
The scheduler does not reconnect, reactivate, or expand a connection's scope.

Managers can pause and resume one stream without disabling its connection. Pause state is rechecked under the
same stream lock used for scheduling, and queued work for that stream is cancelled atomically. See
`INTEGRATION_OPERATIONAL_CONTROLS.md`.

## Cadence and windows

The default policy schedules an incremental read every five minutes and a reconciliation every 24 hours. A
reconciliation is due only after the activation or the last successful reconciliation has aged past its
configured interval. Reconciliation takes precedence for that cycle; incremental and reconciliation jobs are
never intentionally queued against the same stream checkpoint at once.

Each job receives a rolling UTC window. The defaults are 24 hours behind observation time and 30 days ahead,
which is exactly the Booking adapter's maximum 31-day window. Incremental requests retain the existing
five-minute overlap, clipped to the manager-approved activation watermark.

`IntegrationSyncState.nextScheduledAt` is owned by the scheduler. Successful handlers preserve it; only a
bounded partial page run requests immediate continuation. Job retry timing remains owned by `IntegrationJob`.

## Durable concurrency and provider controls

Scheduling is database coordinated:

- each candidate sync state is re-read under a row lock;
- job uniqueness supplies a second idempotency boundary based on stream, activation, mode, and cadence slot;
- `IntegrationProviderScheduleState` holds one global `(domain, providerKey)` permit row through the shared
  integration provider schedule service;
- the provider permit advances transactionally with job insertion, enforcing a minimum gap even when more
  than one worker replica is running;
- a durable fixed-window provider allowance and overall scheduler batch limit prevent a large connection set
  from flooding one provider;
- job leases, sync-stream leases, lease heartbeats, bounded attempts, and exponential retry remain in the
  existing worker/job services.

The global provider permit is intentionally conservative because many vendor rate limits apply to the partner
application rather than one winery connection. Provider-specific values are operational policy, not connector
code, and should be set only after confirming the provider's issued limits.

## Configuration

The independent gate is `INTEGRATION_BOOKING_SCHEDULER_ENABLED=false`. Enabling it in production also requires
`INTEGRATION_WORKER_ENABLED=true` and `INTEGRATION_CREDENTIALS_ENABLED=true`; production environment validation
fails otherwise.

| Variable | Default | Boundary |
| --- | ---: | --- |
| `INTEGRATION_BOOKING_SCHEDULER_BATCH_SIZE` | 20 | 1–100 jobs per scan |
| `INTEGRATION_BOOKING_INCREMENTAL_INTERVAL_SECONDS` | 300 | 60–86400 |
| `INTEGRATION_BOOKING_RECONCILIATION_INTERVAL_SECONDS` | 86400 | 3600–2592000 |
| `INTEGRATION_BOOKING_PROVIDER_MINIMUM_SPACING_SECONDS` | 5 | 1–3600 |
| `INTEGRATION_BOOKING_PROVIDER_RATE_WINDOW_SECONDS` | 60 | 1–3600 |
| `INTEGRATION_BOOKING_PROVIDER_MAX_JOBS_PER_RATE_WINDOW` | 12 | 1–1000 |
| `INTEGRATION_BOOKING_WINDOW_LOOKBACK_HOURS` | 24 | 0–168 |
| `INTEGRATION_BOOKING_WINDOW_HORIZON_HOURS` | 720 | 1–744; total window at most 744 hours |
| `INTEGRATION_BOOKING_INCREMENTAL_OVERLAP_MINUTES` | 5 | 0–1440 |
| `INTEGRATION_BOOKING_SCHEDULER_MAX_PAGES` | 10 | 1–50 |
| `INTEGRATION_BOOKING_SCHEDULER_MAX_ATTEMPTS` | 10 | 1–100 |
| `INTEGRATION_BOOKING_SCHEDULER_RETRY_BACKOFF_SECONDS` | 30 | 1–86400 |

`INTEGRATION_BOOKING_SCHEDULER_PROVIDER_POLICIES_JSON` may contain at most 50 normalized provider keys. Each
value can override `incrementalIntervalSeconds`, `reconciliationIntervalSeconds`, `minimumSpacingSeconds`, and
`rateWindowSeconds` and `maxJobsPerRateWindow`. Unknown fields, malformed JSON, invalid provider keys, and
out-of-range values fail closed.

Example:

```json
{
  "opentable": {
    "incrementalIntervalSeconds": 900,
    "reconciliationIntervalSeconds": 43200,
    "minimumSpacingSeconds": 15,
    "rateWindowSeconds": 60,
    "maxJobsPerRateWindow": 4
  }
}
```

## Operations

`GET /api/integration-management/runtime` reports generic scheduler-registry status and a retained Booking
compatibility view with the scheduler gate and policy version plus tenant-scoped
eligible, due, degraded, paused, and outstanding Booking-stream counts. Normal job and sync-run APIs remain the source
for attempt history and results. A deterministic scheduling failure records a bounded generic error and next
attempt time on the sync state; provider diagnostics and credentials are never copied there.

Deployment sequence:

1. Apply migrations, including `20260818500000-create-integration-sync-scheduler.js`.
2. Keep the scheduler off while verifying the worker, credential store, host allowlists, hydration, authority
   policy, and activation with manual bounded runs.
3. Confirm provider rate limits and choose conservative cadence/spacing values.
4. Enable the scheduler for the worker resource, then inspect runtime counts, queued jobs, sync runs, provider
   permit state, and canonical outbox results.
5. Exercise credential rejection, provider throttling, worker restart, stale activation, and reconciliation
   recovery before treating the pilot as unattended.

This slice provides automatic polling, not webhooks or provider certification. The OpenTable adapter remains
pending real partner Sandbox/Production verification.
