# Coolify pilot deployment

This runbook deploys VinAgent as two application resources (API and web), backed by one private MySQL resource. It is intended for the first single-winery pilot. It does not authorize a production cutover or the use of placeholder credentials.

## Deployment shape

| Resource | Build source | Internal port | Public exposure |
| --- | --- | ---: | --- |
| MySQL 8 | Coolify database resource | 3306 | Private network only |
| VinAgent API | repository root, `Dockerfile` | 3000 | `https://api.<domain>` |
| VinAgent web | `frontend`, `frontend/Dockerfile` | 3000 | `https://app.<domain>` |

Both application images use Node 24.18.0 and run as non-root users. The API image includes `sequelize-cli` because migrations are a release-time operation. The web image uses the smaller Next.js standalone output.

Use one API replica. Task reminders, mailbox sync, operational-intelligence scheduling, and usage-gauge capture run inside the API process and currently have no distributed leader election. More than one API replica can therefore execute the same scheduler cycle. The web resource may be scaled independently, although one replica is sufficient for the pilot.

The exact API image command is:

```sh
docker build --file Dockerfile --tag vinagent-api:<commit> .
```

Its image start command is `node src/server.js`; do not override it in Coolify. The equivalent web build is run with `frontend` as its context:

```sh
docker build --file frontend/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=https://api.<domain> \
  --build-arg NEXT_PUBLIC_FIREBASE_API_KEY=<value> \
  --build-arg NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<value> \
  --build-arg NEXT_PUBLIC_FIREBASE_PROJECT_ID=<value> \
  --build-arg NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=<value> \
  --build-arg NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=<value> \
  --build-arg NEXT_PUBLIC_FIREBASE_APP_ID=<value> \
  --tag vinagent-web:<commit> frontend
```

Its image start command is `node server.js`; do not override it in Coolify. The frontend Dockerfile fails the build when any required browser configuration argument is empty.

## 1. Create and protect MySQL

1. Create a private MySQL 8 resource with a dedicated database.
2. Create two schema-scoped principals: a runtime API user limited to the application's required `SELECT`, `INSERT`, `UPDATE`, and `DELETE` operations, and a separate migration user allowed to create/alter/drop schema objects, perform migration backfills, and maintain Sequelize's migration metadata. Do not give the runtime API user DDL privileges.
3. Do not expose port 3306 publicly. Connect from the API through Coolify's private network and service hostname; `localhost` is incorrect from the API container.
4. Enable automated database backups to storage outside the Coolify host. Keep at least one daily backup and test restoration before onboarding the winery.
5. Store the runtime user's `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` as API runtime secrets. Keep migration credentials out of the long-running API environment and inject them only into the one-off migration command.

Use the same MySQL major version used for the rehearsal environment. Test any major-version upgrade separately before changing the pilot database.

### Bootstrap a fresh database

A migration creates schema, not a tenant or first login. For a genuinely empty pilot database, complete this explicit one-off bootstrap after migrations and before starting the API:

1. In the correct Firebase project, create the first administrator through the trusted Firebase console/admin workflow. Set and verify the email address, set the display name, ensure the account is enabled, and securely deliver its sign-in credential to that administrator. Record its immutable Firebase UID. VinAgent does not create or print the Firebase credential.
2. Choose the permanent positive integer for `DEPLOYMENT_WINERY_ID` and set the following temporary variables on the one-off API command:

   ```dotenv
   PILOT_WINERY_NAME=<legal-or-operating-name>
   PILOT_WINERY_TIME_ZONE=Australia/Adelaide
   PILOT_WINERY_CONTACT_EMAIL=<winery-contact-email>
   PILOT_ADMIN_FIREBASE_UID=<existing-firebase-uid>
   PILOT_ADMIN_EMAIL=<same-verified-firebase-email>
   PILOT_ADMIN_DISPLAY_NAME=<same-firebase-display-name>
   ```

3. With all normal API production variables also present, run:

   ```sh
   npm run pilot:bootstrap
   ```

4. Remove the six temporary `PILOT_*` variables after success. Keep `DEPLOYMENT_WINERY_ID` permanently configured.

The command looks up—but never creates—the Firebase identity. In one database transaction it creates only the explicitly numbered winery, one safe `WinerySettings` row, one deliberately disabled `WineryIntegrationConfig`, one non-charging pilot `WineryBillingProfile`, and the active admin binding. Initial settings enable secure customer links while disabling booking, Wine Club, Orders, Insights, and Voice. The integration row has `channelsEnabled: []`, empty connection metadata, and neutral `other` providers, so no outbound capability is implied. The billing profile records the metering boundary without enabling payment. Output contains only fixed resource names, never IDs, names, emails, credentials, or provider data.

The bootstrap is idempotent only when all existing identity and tenant fields match exactly. It fails closed if another winery occupies the database, the chosen ID has different winery data, settings, integration configuration, or pilot billing profile conflict, the Firebase UID/email is already bound differently, the winery already contains users without the expected admin, or the Firebase account is missing, disabled, unverified, or does not match the supplied email/display name. It never guesses, reassigns, or overwrites those conflicts. Read-only deployment preflight independently requires at least one active same-winery admin with a stored Firebase UID, so imported data without an operator login cannot be released accidentally.

Do not use this generic bootstrap over an imported winery database. For an import, preserve the winery's existing ID, verify its settings/admin bindings, set `DEPLOYMENT_WINERY_ID` to that ID, and run the read-only preflight.

## 2. Configure the API resource

Use the repository root as the build context and `Dockerfile` as the Dockerfile. Leave the start-command override empty; the image starts `node src/server.js`. Expose container port 3000 and configure the health path as `/health/ready`.

The Dockerfile already defines a Node-based readiness health check, so the slim image does not need `curl` or `wget`. If a Coolify UI health path is also entered, use `/health/ready`; the image health check remains authoritative.

Create a named persistent volume, for example `vinagent-attachments`, mounted at:

```text
/app/data/attachments
```

Set `ATTACHMENT_STORAGE_ROOT=/app/data/attachments`. The image creates this path for UID/GID 1000 (`node`). After the first mount, confirm from the API container that this user can create and remove a test file there. If a bind mount is used instead of a named volume, its host directory must be owned or writable by UID/GID 1000 before the API starts.

The API requires these production variables. Values in angle brackets are examples, not values to copy.

```dotenv
NODE_ENV=production
PORT=3000
PUBLIC_URL=https://api.<domain>
PUBLIC_APP_URL=https://app.<domain>
CORS_ORIGIN=https://app.<domain>

DB_HOST=<private-mysql-service-hostname>
DB_PORT=3306
DB_NAME=<database-name>
DB_USER=<application-user>
DB_PASSWORD=<secret>

DEPLOYMENT_WINERY_ID=<positive-existing-winery-id>
PIN_SESSION_SECRET=<at-least-32-random-characters>
ALLOW_TEST_AUTH_BYPASS=false
ALLOW_MOCK_INTEGRATIONS=false

FIREBASE_PROJECT_ID=<project-id>
FIREBASE_CLIENT_EMAIL=<service-account-email>
FIREBASE_PRIVATE_KEY=<service-account-private-key>

EMAIL_WEBHOOK_SECRET=<random-webhook-secret>
TWILIO_ACCOUNT_SID=<account-sid>
TWILIO_AUTH_TOKEN=<secret>
TWILIO_PHONE_NUMBER=<e164-number>
RETELL_API_KEY=<retell-api-key>

ATTACHMENT_STORAGE_ROOT=/app/data/attachments
TASK_DEADLINE_REMINDERS_ENABLED=true
EMAIL_SYNC_ENABLED=false
OPERATIONAL_INTELLIGENCE_SCHEDULER_ENABLED=false
USAGE_SNAPSHOT_INTERVAL_MS=3600000
```

Set `OPENAI_API_KEY` when AI is enabled. Otherwise set `AI_SKIP=true`; do not insert a dummy API key. The complete optional tuning and provider list is maintained in [`.env.example`](../.env.example). Production startup deliberately rejects test-auth bypasses, mock booking/CRM execution, malformed winery IDs, and missing required provider credentials.

`FIREBASE_PRIVATE_KEY`, session secrets, database credentials, webhook secrets, and provider tokens are runtime secrets and must never be Docker build arguments. Preserve the private-key newlines; the API accepts either literal newlines or escaped `\n` sequences.

`DEPLOYMENT_WINERY_ID` is the deployment boundary, not a user preference. It must identify the winery imported or created for this installation. Changing it is an operator action requiring a deliberate deployment/configuration change, a preflight run, and a restart. It must not be exposed to the web application.

Keep the API at one replica. For the initial pilot, leave mailbox sync and operational-intelligence scheduling disabled until their providers and expected side effects have been separately smoke-tested. Task deadline reminders and idempotent usage-gauge capture may run on the sole API replica. Follow [USAGE_METERING.md](USAGE_METERING.md) to capture a baseline snapshot and run admin reconciliation before onboarding users.

### Disable unsupported live-execution modules for the pilot

The current booking and CRM factories have no production-ready live adapters. Consequently, `npm run preflight:deployment` deliberately reports `BOOKING_LIVE_ADAPTER_UNAVAILABLE` while Bookings is enabled, and `CRM_LIVE_ADAPTER_UNAVAILABLE` while Wine Club or Orders is enabled.

After the deployment winery and its `WinerySettings` row have been provisioned or imported, run this deliberate one-off command from the API image before the first final preflight and API start:

```sh
npm run pilot:disable-unsupported-modules
```

The command requires a valid `DEPLOYMENT_WINERY_ID` and existing matching winery/settings rows. It fails instead of guessing a winery or silently creating configuration. Within a transaction it sets only `enableBookingModule`, `enableWineClubModule`, and `enableOrdersModule` to `false`. It is idempotent and prints only the before/after capability names—no tenant data or secrets. This is not an automatic startup mutation.

The change is reversible through the authenticated manager/admin settings endpoint once real adapters have been implemented and tested. For an already running installation, the same pilot scope can be applied explicitly with:

```http
PUT /api/winery/settings
Authorization: Bearer <manager-or-admin-token>
Content-Type: application/json

{
  "enableBookingModule": false,
  "enableWineClubModule": false,
  "enableOrdersModule": false
}
```

The endpoint returns HTTP 200 with the persisted settings. Rerun `npm run preflight:deployment` after either method. Do not re-enable these modules for the pilot: doing so correctly makes provider preflight fail until live adapters are available.

## 3. Configure the web resource

Use `frontend` as the build context and `frontend/Dockerfile` as the Dockerfile. Leave the start-command override empty. Expose port 3000 and use `/` as its health path.

The frontend image also carries its own Node-based health check for `/`.

The following values are Docker build arguments because Next.js embeds `NEXT_PUBLIC_*` variables in the browser bundle during `npm run build`:

```dotenv
NEXT_PUBLIC_API_URL=https://api.<domain>
NEXT_PUBLIC_FIREBASE_API_KEY=<firebase-web-api-key>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<firebase-auth-domain>
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<firebase-project-id>
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=<firebase-storage-bucket>
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=<firebase-sender-id>
NEXT_PUBLIC_FIREBASE_APP_ID=<firebase-app-id>
```

`NEXT_PUBLIC_API_URL` is the API origin without a trailing `/api`. These values are intentionally public browser configuration; never add Firebase Admin credentials, database credentials, provider secrets, or `DEPLOYMENT_WINERY_ID` to a `NEXT_PUBLIC_*` variable. Rebuild the web image whenever one of these values changes—a container restart alone does not replace values already compiled into the bundle.

## 4. Migrate and release

Migrations are intentionally not part of the API startup command. Running them automatically in every replica can race and makes a failed release harder to reason about.

For each release:

1. Put the pilot into a short maintenance window if a migration or restore can affect active writes.
2. Take a paired database and attachment-volume backup.
3. Build the new API image using the exact commit being released.
4. Run this once from the new API image with the private MySQL connection and migration principal injected as `DB_USER`/`DB_PASSWORD` for this command only:

   ```sh
   npm run db:migrate
   ```

   Do not place the migration principal in the long-running API resource. Remove the one-off secret injection as soon as the migration command exits.

5. Restore/use the runtime API principal and confirm all migrations are `up`:

   ```sh
   npm run db:migrate:status
   ```

6. On a fresh empty database only, create and bind the explicit winery/settings/integration/admin records as described in **Bootstrap a fresh database**:

   ```sh
   npm run pilot:bootstrap
   ```

   Skip this command for imported data unless every protected field is already an exact match.

7. For an imported pilot—or any database where unsupported flags were later re-enabled—apply the explicit pilot scope:

   ```sh
   npm run pilot:disable-unsupported-modules
   ```

8. Run the read-only deployment check. It validates the database, migration state, attachment path, tenant lock, and configured providers without sending messages or writing business data:

   ```sh
   npm run preflight:deployment
   ```

9. Deploy exactly one API replica, wait for `/health/ready` to return HTTP 200, then deploy the web image.
10. Run the smoke checks below before inviting users.

Require a `ready` preflight result for fresh and imported deployments before continuing. Use Coolify's pre-deployment or one-off command facility for steps 4-8 when available. Do not run the same migration or bootstrap command concurrently in multiple containers.

The generic bootstrap creates an explicit integration configuration with every outbound channel disabled, so provider assessment is ready without pretending a provider is connected. When a real SMS or email channel enters pilot scope, an authenticated manager/admin must deliberately select it, provide the actual supported provider/from address, run a controlled provider smoke, and rerun preflight. For example, enabling only a fully configured SMS channel begins with:

```http
PUT /api/winery/integration-config
Authorization: Bearer <manager-or-admin-token>
Content-Type: application/json

{
  "channelsEnabled": ["sms"],
  "smsProvider": "twilio",
  "smsFromNumber": "+61..."
}
```

Do not enable a channel merely to make it visible: selected capabilities must have complete runtime credentials and a successful preflight before use.

## 5. Smoke checks

From outside the host, confirm:

```text
GET https://api.<domain>/health/live   -> 200
GET https://api.<domain>/health/ready  -> 200
GET https://app.<domain>/              -> 200
```

Then exercise the authenticated browser smoke suite documented in [FRONTEND_QA_RUNBOOK.md](FRONTEND_QA_RUNBOOK.md) and manually confirm:

- a valid staff account for the deployment winery can sign in;
- a staff account from any other winery is rejected;
- a manager can create and assign a task only to staff/customers in the deployment winery;
- an attachment survives an API container redeploy;
- a generated customer confirmation link opens the public confirmation flow and cannot be reused after success;
- no booking/CRM action is offered as successfully completed while its real adapter is disabled;
- API and web responses are HTTPS, and the browser has no CORS or mixed-content errors.

Do not send real SMS, email, voice, booking, or CRM traffic during deployment validation unless the winery has approved the recipient and the provider is intentionally in scope.

## 6. Backup and restore

Database rows and attachment files form one logical dataset. Back them up as a pair and label both artifacts with the same UTC timestamp and application commit.

Preferred database backup: Coolify's scheduled MySQL backup to off-host object storage, with encryption and retention enabled. For a controlled manual backup, run `mysqldump` from a trusted MySQL client using an interactive password prompt or protected option file; include `--single-transaction`, routines, triggers, and events. Do not put the password directly on the command line or in a shell-history file.

Back up the named attachment volume using a short-lived trusted backup container or host-level snapshot while application writes are paused. Archive the contents rooted at `/app/data/attachments`, preserving directory structure and ownership. Check that both backup artifacts are non-empty and copy them off the Coolify host.

Test restoration at least once before pilot onboarding:

1. Create an isolated MySQL resource and empty attachment volume.
2. Restore the paired artifacts into those isolated resources.
3. Point a temporary API deployment at them with outbound providers disabled or sandboxed.
4. Run `npm run db:migrate:status`, `npm run preflight:deployment`, and the read-only/browser smoke checks.
5. Verify representative tasks, members, notices, and attachments, then destroy the isolated rehearsal resources according to the data-retention policy.

Never test a restore over the live pilot database.

## 7. Rollback

Retain the previous known-good API and web images by immutable commit tag. If the release fails before a migration, redeploy both previous images.

After a migration, prefer fixing forward when the schema remains backward compatible. Do not run `db:migrate:undo` blindly: some security migrations intentionally transform or discard sensitive representations, and reversing application code does not reconstruct the former values. If an incompatible migration or data corruption requires full rollback:

1. stop API writes and schedulers;
2. preserve the failed database and attachment volume for investigation;
3. restore the paired pre-release database and attachment backups;
4. deploy the matching previous API and web images;
5. run readiness, preflight, and smoke checks before reopening access.

Record the released commit, migration status, backup identifiers, operator, and smoke result for every pilot deployment.

## Coolify references

- [Dockerfile and application health checks](https://coolify.io/docs/knowledge-base/health-checks)
- [Persistent volume and bind-mount destination paths](https://coolify.io/docs/knowledge-base/persistent-storage)
- [Scheduled database and S3 backups](https://coolify.io/docs/databases/backups)
