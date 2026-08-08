# Operational safeguards

This document describes the API checks that protect a pilot deployment. They
are deliberately split into process health, runtime readiness, startup safety,
and a deeper operator-run preflight so an optional provider outage or disabled
module does not make the whole API unavailable.

## Health endpoints

| Endpoint | Meaning | Dependency checks |
| --- | --- | --- |
| `GET /health/live` | The Node process can answer HTTP. | None |
| `GET /health` | Compatibility alias for liveness. | None |
| `GET /health/ready` | The instance may receive application traffic. | Production configuration, database, migration state, and attachment storage |
| `GET /api/health` | Legacy liveness compatibility alias. Its response points callers to `/health/ready`. | None |

`/health/ready` returns `200` only when every required check passes, and `503`
otherwise. Responses contain fixed status codes, not database errors, paths,
credentials, or provider responses. Readiness checks are coalesced and cached
for `HEALTH_READINESS_CACHE_MS` (2 seconds by default), and bounded by
`HEALTH_READINESS_TIMEOUT_MS` (5 seconds by default).

The `/health/*` routes are mounted before production HTTPS enforcement. This
allows a Coolify probe to call the private HTTP listener at
`http://localhost:3000/health/ready`. All ordinary application routes still
redirect to the configured public HTTPS origin and use Express's trusted-proxy
HTTPS detection.

During `SIGTERM` or `SIGINT`, readiness changes to `503` before schedulers stop.
The server then drains HTTP connections and closes Sequelize. The bounded
shutdown window is configured with `SHUTDOWN_TIMEOUT_MS` (10 seconds by
default).

## Startup and migration safety

In production the API does not listen until all of these checks pass:

1. `NODE_ENV=production` and the other required production environment
   variables are present and structurally valid. `PUBLIC_URL`,
   `PUBLIC_APP_URL`, and `CORS_ORIGIN` must each be one
   exact HTTPS origin with no credentials, path, query, fragment, or
   comma-separated alternatives.
2. The database accepts a connection.
3. `ATTACHMENT_STORAGE_ROOT` passes the persistent-storage checks below.
4. Every migration file in the application image has an exact matching entry
   in `SequelizeMeta`, with no pending or unknown applied migration names.

The application never runs migrations automatically. Apply them as an explicit
release step before starting the new image:

```text
npm run db:migrate
npm run db:migrate:status
```

Failing closed avoids accepting traffic against an older schema and avoids two
replicas racing to mutate the schema during a rolling deployment.

## Persistent attachment storage

Production requires `ATTACHMENT_STORAGE_ROOT` to be an explicit absolute path.
The directory must already exist, must be a directory, and must be readable and
writable by the API process. The filesystem root itself is rejected.

For the Coolify API image, mount a persistent volume at a path such as
`/app/data/attachments` and configure:

```text
ATTACHMENT_STORAGE_ROOT=/app/data/attachments
```

Startup, readiness, and preflight use only filesystem metadata and access
checks. They do not create, overwrite, or delete a probe file. These checks can
verify access but cannot prove that a container path is backed by durable
storage; the volume mount remains an operator responsibility.

## Read-only deployment preflight

After migrations and configuration are in place, run:

```text
npm run preflight:deployment
```

The command exits `0` only when all checks pass and `1` otherwise. It reads
configuration, connects to the database, reads migration metadata and the
deployment winery's settings, and checks storage access. It does not update the
database, run migrations, write attachment probes, contact Firebase or any
message provider, or send SMS/email/voice traffic. Its JSON output contains
only fixed codes and counts; it never prints configured secret values or
customer records.

It also requires at least one active `admin` row in the deployment winery with
a nonempty stored `firebaseUid`. This is a database-only binding check: it does
not contact Firebase or disclose the UID. Missing or unreadable admin state
fails with a fixed deployment-admin code.

Provider checks cover the enabled winery capabilities:

- selected Twilio and SendGrid/Outlook configuration;
- Outlook compatibility when mailbox sync is enabled;
- Retell authentication and trusted routing metadata when voice is enabled;
- whether enabled booking/CRM modules and area overrides have a production
  adapter.

Provider checks are intentionally preflight checks, not `/health/ready`
dependencies. A disabled or not-yet-integrated optional module therefore does
not take the core task application offline. The preflight does not verify live
third-party credentials; controlled staging sends remain a separate human
release gate.

The current booking and CRM factories do not have production execution
adapters. For a pilot that does not use those actions, a manager or admin can
disable the affected modules through the authenticated winery-settings API:

```http
PUT /api/winery/settings
Authorization: Bearer <firebase-token>
Content-Type: application/json

{
  "enableBookingModule": false,
  "enableWineClubModule": false,
  "enableOrdersModule": false
}
```

The response is `200` with the persisted winery-scoped settings:

```json
{
  "success": true,
  "data": {
    "wineryId": 1,
    "enableBookingModule": false,
    "enableWineClubModule": false,
    "enableOrdersModule": false
  }
}
```

Rerun `npm run preflight:deployment` after changing module or provider
configuration. Enabling one of these modules later should be paired with its
implemented live adapter, tests, and a successful preflight.

For local development, the repository examples use backend port `4000` and
frontend port `3000`. Coolify overrides the API container port to `3000`.
