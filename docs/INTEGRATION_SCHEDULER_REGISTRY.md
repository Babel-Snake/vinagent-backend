# Integration Scheduler Registry

Status: provider-neutral scheduler orchestration and provider permit service implemented

Last reviewed: 2026-08-20

## Purpose

The integration worker no longer knows that Booking is a special scheduling domain. It calls one registry
before claiming the durable job queue. Each registered domain decides which of its canonical sync streams are
eligible and creates normal `IntegrationJob` records through the shared job service.

Booking is the first registration. Wine Club, Commerce, Inventory, Fulfilment, and Workforce can now add a
scheduler without changing the worker loop or duplicating its job/outbox lifecycle.

```text
integration worker cycle
        |
        v
IntegrationSchedulerRegistry
        |
        +-- BOOKING scheduler ------> durable IntegrationJob
        +-- CLUB scheduler (later) --> durable IntegrationJob
        +-- ...
        |
        v
claim jobs -> registered handlers -> canonical outbox
```

## Registration contract

A domain registration supplies:

- `domain`: one stable value from the VinAgent integration-domain registry;
- `configKey`: the key used in `workerConfig.schedulerConfigs`;
- `getConfig(env)`: strict environment parsing for that domain;
- `schedule({ workerId, config, jobService })`: discovery and durable job creation;
- `getStatus({ wineryId, config, now })`: bounded tenant-scoped runtime health.

Registrations are unique by domain and execute in deterministic domain order. The registry aggregates examined,
scheduled, duplicate, and failed counts across domains. It never accepts arbitrary job payloads or provider
functions from an API request.

The configured registrations live in `src/services/integrationSchedulers.service.js`. A future domain should
be added there only after it has:

1. canonical resource and sync-state contracts;
2. explicit read capabilities and manager activation gates;
3. strict scheduler configuration parsing;
4. registered durable job kinds and handlers;
5. tenant-scoped runtime status;
6. tests proving pause, idempotency, concurrency, and provider-limit behavior.

## Failure isolation

One domain scheduler failure does not stop later domain schedulers, job claiming, or canonical-outbox delivery.
The aggregate result records a bounded error code and increments `schedulerFailures`; provider diagnostics and
error messages are not returned through the registry. Failures inside an individual domain's candidate loop
remain that domain's responsibility and appear in its normal failed count.

Configuration parsing remains fail-closed at worker startup. This is deliberate: an invalid enabled-domain
policy should prevent a misconfigured worker from starting, while a transient runtime problem in one domain
should not starve all other domains.

## Shared provider permits

`IntegrationProviderScheduleState` was already keyed by `(domain, providerKey)`. Its locking and policy logic is
now exposed through the generic integration provider schedule service:

- prepare a permit under the caller's database transaction;
- enforce minimum spacing and a durable fixed rate window;
- return the exact next available time when throttled;
- finalize the permit only with the durable job insertion transaction;
- increment usage only when a new job was actually created;
- preserve bounded domain metadata while protecting authoritative policy fields.

The permit and job insertion roll back together. The same provider name can have independent limits in two
domains, while all winery connections for one domain/provider share the same conservative application-level
allowance.

## Worker and runtime shape

`getIntegrationWorkerConfig()` now returns:

```json
{
  "schedulerConfigs": {
    "bookingScheduler": {
      "enabled": false,
      "policyVersion": "1"
    }
  }
}
```

Each worker-cycle `schedulingResult` contains aggregate counts plus a `domains` array. Worker logs report
registered/enabled scheduler domains and aggregate failures without logging provider payloads.

`GET /api/integration-management/runtime` now includes `schedulers`, containing registered, enabled, and
unavailable domain counts plus per-domain status. The existing `bookingScheduler` member is retained as a
compatibility view of the Booking entry while clients migrate to the generic shape.

## What remains domain-specific

The registry intentionally does not pretend all domains use the same cadence or completeness rules. A domain
still owns:

- candidate eligibility and canonical resource type;
- incremental/reconciliation mode selection;
- rolling windows and cursor semantics;
- capability and activation requirements;
- job kinds, priorities, payload schemas, and handler behavior;
- domain-specific scheduling-failure recording.

This keeps the worker and provider governance generic without weakening each business domain's correctness
contract.
