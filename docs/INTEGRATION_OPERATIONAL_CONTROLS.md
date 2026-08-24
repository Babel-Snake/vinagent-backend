# Integration Operational Controls

Status: provider-neutral pause, resume, cancellation, dead-letter replay, and operator audit implemented

Last reviewed: 2026-08-19

## Purpose

These controls let a manager contain and recover integration work without editing provider data or queue rows
directly. They operate on VinAgent's generic sync streams, jobs, and canonical outbox, so the same lifecycle can
be used for Booking, Wine Club, Commerce, Inventory, Fulfilment, Workforce, and later connectors.

No live provider credential is required to deploy or test the control plane. A credential is still required
when a replayed provider job reaches its connector handler.

## Manager API

All routes require a same-winery `manager` or `admin`:

| Route | Outcome |
| --- | --- |
| `GET /api/integration-management/sync-streams` | Lists safe stream health and pause state without exposing provider cursors or leases. |
| `POST /api/integration-management/sync-streams/:id/pause` | Pauses one connection/resource/stream and cancels its pending or retrying jobs. |
| `POST /api/integration-management/sync-streams/:id/resume` | Resumes one stream and makes a completed-hydration stream immediately due. |
| `POST /api/integration-management/jobs/:id/cancel` | Cancels one pending or retrying job. |
| `POST /api/integration-management/jobs/:id/replay` | Creates a new lineage-linked job from a failed, cancelled, or completed job. |
| `POST /api/integration-management/outbox/:id/replay` | Requeues a failed canonical-event delivery. |
| `GET /api/integration-management/operations` | Lists the append-only operator intervention history. |
| `GET /api/integration-management/runtime` | Includes paused-stream and dead-letter counts. |

Every command body uses the same contract:

```json
{
  "requestId": "8fb3b8fc-ab70-4ec6-9ca4-cedca6e1dd31",
  "reason": "Provider maintenance is complete and this stream can resume."
}
```

The UUID makes retries idempotent. Reusing it for a different target under the same action is rejected.

## Pause and resume semantics

`IntegrationSyncState.operationalStatus` is the durable source of truth. A paused stream:

- is excluded from automatic scheduler discovery and rechecked under the scheduler's row lock;
- rejects new jobs that address its exact connection, resource type, and stream key;
- atomically cancels existing `PENDING` and `RETRY` jobs for that stream;
- retains its cursor, watermark, hydration status, and canonical data;
- remains visible in runtime and operations views.

The API refuses to pause while a job is already `RUNNING`. VinAgent does not kill an in-flight provider call
or leave its lease ambiguous; the operator retries the pause after that job completes. Resume clears the
current pause fields. If initial hydration is complete, it sets `nextScheduledAt` to the resume time so the
domain scheduler can continue through its normal provider rate and concurrency controls.

Disabling a connection and pausing a stream are intentionally different. Disable invalidates connection-level
availability and activation. Pause is a reversible operational containment action for one stream.

## Dead letters and replay

Terminal integration-job and canonical-outbox failures remain `FAILED`, with `deadLetteredAt` recording when
the retry budget became terminal. This preserves compatibility with existing queue status filters while making
the dead-letter state explicit.

A job replay never changes the source job. It creates a new `PENDING` job with:

- the original stable job kind, scope, schema version, bounded payload, priority, and retry policy;
- a new operator-request idempotency key and correlation ID;
- `replayedFromJobId` pointing to the original job;
- a runtime check that the job kind still has a registered handler;
- the normal paused-stream guard.

This replay also supplies the operational "force run" path when an operator needs to repeat a known bounded
job. New Booking windows continue to use the existing incremental/reconciliation run endpoints rather than
allowing arbitrary queue payloads.

The canonical event itself is immutable. Replaying its failed outbox entry resets only delivery attempts and
availability, increments `replayCount`, and records `lastReplayedAt`. It cannot replay an entry that is pending,
delivering, retrying, or already delivered.

## Audit and data safety

`IntegrationOperationAuditEvent` is append-only and records actor, action, tenant, target, connection/stream
scope, request ID, reason, safe before/after snapshots, and replay/cancellation lineage. It deliberately omits
job payloads, provider cursors, credentials, raw events, and canonical normalized payloads.

All target reads and mutations include `wineryId`; foreign resource IDs return not found. Returned replay and
cancellation receipts use bounded operational metadata and never return the copied job payload.

## Deployment

Apply `20260818600000-create-integration-operational-controls.js` after the integration scheduler migration.
The migration is resumable, backfills `deadLetteredAt` on existing failed work, and adds:

- stream operational state and pause attribution;
- job dead-letter, cancellation, and replay-lineage fields;
- outbox dead-letter and replay counters;
- the immutable operator audit table and lookup indexes.

Before an attended pilot, exercise pause/resume, pending-job cancellation, failed job replay, failed outbox
replay, duplicate request IDs, a running-job pause conflict, and tenant isolation. Provider credentials are
only needed for the final execution portion of connector jobs.
