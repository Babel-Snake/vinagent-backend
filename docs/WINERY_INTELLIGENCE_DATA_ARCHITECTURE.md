# VinAgent Winery Intelligence Data Architecture

Status: canonical domain foundation, semantic facts, bounded cross-domain contexts, health, and guarded activation implemented

Last reviewed: 2026-08-20

## 1. Purpose

VinAgent should become the operational intelligence layer between a winery's customer, booking, wine-club, commerce, stock, delivery, workforce, communication, and internal-work systems.

That does not mean copying every field from every connected application. The target is a bounded operational twin:

- external applications remain authoritative for the records they own;
- VinAgent stores provider-neutral projections of facts needed for joins, schedules, automation, reconciliation, and staff context;
- volatile facts are timestamped and refreshed or checked live when necessary;
- every important assertion retains its source, effective time, freshness, and derivation;
- VinAgent owns cross-system interpretation, manager-approved rules, and operational work;
- Tasks, Notices, Requests, Notes, Projects, and Calendar Events remain the staff action and memory layer.

The guiding decision is therefore:

> Design the complete canonical winery map now, then implement typed projections incrementally around proven operational use cases.

### 1.1 Implementation status

The first additive Phase 1 slice (Batch A1) is implemented in migration
`20260818000000-create-integration-data-foundation.js` and its matching Sequelize models. It adds:

- Winery Locations;
- first-class Integration Connections, Scopes, and Capabilities;
- durable per-stream Sync States and auditable Sync Runs;
- External Resource References and normalised External Resource Observations;
- reviewable, de-duplicated Projection Issues;
- additive source, provenance, idempotency, ingestion-purpose, and automation-eligibility fields on Integration Events;
- bounded application registries and deterministic scope/event/fingerprint key builders.

This slice is intentionally storage-only. Existing `WineryIntegrationConfig`, area integration configuration,
derived Winery Settings, `EmailSyncState`, and legacy Integration Event dispatch remain authoritative at runtime.
No connector is switched to the new tables by this migration, and no legacy connection row is guessed or
backfilled without the governance decisions in section 21.

The second additive Phase 1 slice (Batch A2 safety core) is implemented in migration
`20260818100000-create-integration-safety-foundation.js`. It adds versioned authority policies, lease-based
Integration Jobs, the transactional Canonical Event Outbox, Customer Merge Redirects, Location/Area links,
and tenant-validated Operational Resource links. Supporting services now provide:

- atomic canonical Integration Event plus outbox persistence;
- non-actioning hydration and reconciliation defaults;
- expiring job/outbox claims, bounded retry, and ownership-checked completion;
- deterministic location/area/winery authority precedence and atomic policy activation;
- customer-reference retargeting and redirect-chain collapse inside the existing merge transaction;
- allowlisted, tenant-checked links from staff work to available canonical resources.

A bounded Phase 1 operational-control slice is now also implemented:

- a dedicated integration-worker process with lease-based polling, non-overlapping cycles, bounded drain, and
  configuration that is disabled by default;
- an explicit job-handler registry, with no provider handlers registered implicitly and permanent failure for
  unknown job kinds;
- manager/admin APIs for locations, location/area relationships, connections and scopes, versioned authority
  policies, and tenant-scoped queue/outbox visibility;
- guarded connection lifecycle transitions that cannot claim a connection is authenticated or connected;
- recursive rejection of secret-like connection configuration, response redaction, location-cycle prevention,
  and preservation of at least one scope per connection.

The worker is not part of the API-server process and does nothing unless `INTEGRATION_WORKER_ENABLED=true`.
The first reviewed handler package is registered for protected read-only `vinagent-booking-feed`
verification, bounded hydration, guarded incremental polling, and completeness-checked reconciliation. It
schema-validates and data-minimizes provider-neutral pages, retains source evidence, and projects typed
Booking, Item, Requirement, Area Link, and Status Event state with a transactional canonical outbox.

Hydration remains non-actioning. Incremental and material reconciliation changes require a manager-approved
authority policy and activation watermark, both rechecked at worker execution. The first bounded context pack,
`booking.readiness.v1`, and a draft-by-default truffle preparation rule template now prove creation of one
linked human stock-check Task without inventing inventory or roster conclusions. Remaining connection work
includes controlled compatibility cutover, production worker/scheduler activation, pilot verification of the
registered native OpenTable translator and its real webhook contract, lifecycle handlers beyond the first Booking Task,
and per-winery one-writer cutover. The provider-neutral Booking scheduler is implemented behind a separate
disabled-by-default gate, with durable stream cadence and global provider spacing/burst policy.

Provider-neutral webhook intake is now implemented as a change-hint/recovery pipeline. Opaque
connection-scoped endpoints keep independently encrypted verification material, adapter-owned verification
produces a bounded canonical hint, and a durable dispatch job schedules a provider read through a domain
recovery registry. Booking is the first recovery registration. Raw webhook bodies are not retained and hints
cannot action automations directly; native OpenTable verification remains pending real provider documentation.

The conservative compatibility inventory/backfill is also implemented. It reads winery and area integration
JSON, applies the explicit legacy-domain map, creates only credential-less `PENDING` candidates, merges only on
exact account/location evidence, and persists weak-identity or collision issues. It leaves legacy runtime
authority untouched; one-writer cutover remains a later manager-controlled phase.

The remaining canonical winery graph is now implemented in provider-neutral shadow slices: Customer,
Wine Club, Commerce, optional Business Entity Links, Customer rollups, Catalogue/Inventory, Fulfilment,
Workforce, and Communication lineage. Registered temporal Intelligence Facts, privacy-bounded cross-domain
contexts, an aggregated integration-health view, default-off common domain activation, and a reusable
non-Booking connector conformance contract are also implemented. Real provider adapters, credentials,
scheduled sync registrations, and legacy configuration cutovers remain deliberately separate.

### 1.2 Operational controls and runtime

The dedicated worker is started independently from the API:

```text
npm run start:worker
```

Its relevant environment settings are:

| Setting | Default | Purpose |
| --- | --- | --- |
| `INTEGRATION_WORKER_ENABLED` | `false` | Explicit activation gate |
| `INTEGRATION_WORKER_ID` | host and process ID | Lease ownership identity |
| `INTEGRATION_WORKER_INTERVAL_MS` | `5000` | Poll interval, bounded from 1 second to 5 minutes |
| `INTEGRATION_WORKER_JOB_BATCH_SIZE` | `10` | Job claim size, bounded from 1 to 100 |
| `INTEGRATION_WORKER_OUTBOX_BATCH_SIZE` | `20` | Outbox claim size, bounded from 1 to 100 |
| `INTEGRATION_WORKER_LEASE_SECONDS` | `60` | Recoverable claim duration, bounded from 5 seconds to 1 hour |
| `INTEGRATION_WORKER_RUN_IMMEDIATELY` | `true` | Whether to run once before the first interval |

Domain scheduler settings are exposed beneath `workerConfig.schedulerConfigs`. The generic scheduler registry
currently registers Booking and is the extension point for Wine Club, Commerce, Inventory, Fulfilment, and
Workforce. Shared provider permits remain durable per `(domain, providerKey)`. See
`docs/INTEGRATION_SCHEDULER_REGISTRY.md`.

All management endpoints are below `/api/integration-management` and require a winery-scoped manager or admin.
They cover runtime counts, connector manifests, jobs, outbox metadata, locations, connection
definitions/scopes, protected credential metadata/mutation, read verification, bounded booking hydration,
incremental and reconciliation runs, authority-policy versioning/activation, Booking-domain activation, and
canonical Booking queries. They now also expose domain health, common non-Booking activation readiness,
registered fact materialization/history, and bounded cross-domain Customer, Club, and Area contexts. The
provider-neutral operations surface also exposes safe stream pause/resume,
queued-job cancellation, terminal-job replay, failed-outbox replay, and append-only intervention history. It
does not expose credential references or encrypted material, arbitrary queue injection, mutable job payloads,
or provider write commands. The connector contract and runbook are in
`docs/BOOKING_SHADOW_CONNECTOR.md`; the first live context/rule path is in
`docs/BOOKING_LIVE_READINESS.md`, and recovery semantics are in
`docs/INTEGRATION_OPERATIONAL_CONTROLS.md`.
Provider webhook adapter manifests and encrypted endpoint lifecycle are described in
`docs/PROVIDER_NEUTRAL_WEBHOOK_INTAKE.md`.
Legacy inventory/backfill behavior and cutover boundaries are described in
`docs/LEGACY_INTEGRATION_BACKFILL.md`.

## 2. The intelligence questions the model must answer

The model is successful when VinAgent can answer questions such as:

- What is happening today and over the next seven, thirty, and ninety days?
- What must be prepared for each booking, event, club release, order, or delivery?
- Do we have enough stock, equipment, time, and appropriately skilled staff?
- Which commitments have changed, failed, become late, or lost their owner?
- Who is this customer across all systems, and what is the history of the relationship?
- Where is the customer in the lifecycle from enquiry to visit, purchase, club membership, repeat engagement, or lapse?
- Which bookings led to visits, purchases, memberships, complaints, or missed opportunities?
- Which club allocations, orders, and shipments will affect customers or stock next?
- Which facts are confirmed, inferred, stale, conflicting, or unavailable?
- What work already exists for this customer or business resource, so a rule does not create duplicate noise?
- Which source system owns a proposed change, and does that change need human approval?

The highest-value cross-domain lifecycle is:

```text
enquiry -> booking -> visit -> purchase -> club membership
        -> allocation/order -> shipment -> repeat visit or lapse
```

VinAgent should make that lifecycle queryable through explicit identities and relationships rather than repeatedly guessing it from task payloads.

## 3. Current VinAgent position

VinAgent already has a strong action layer:

- `Winery` is the current tenant boundary.
- `OperationalArea` and `UserAreaMembership` provide responsibility, visibility, and management boundaries.
- `Member` is the local customer root and already supports conservative identity matching and merges.
- `Task`, `Notice`, `OperationalRequest`, and `OperationalRecord` are the four staff-facing operational objects.
- Projects and Calendar Events coordinate work without replacing source workflows.
- `IntegrationEvent` provides an external-event intake and review ledger.
- `IntegrationSyncState`, integration jobs/outbox, and immutable operator events provide stream containment,
  dead-letter recovery, and replay lineage independently of any one provider.
- `AutomationRule`, `AutomationRun`, and capability steps provide deterministic manager-approved automation.
- `OperationalIntelligenceSignal` provides reviewable internal signals.
- `WineryProduct`, `AreaProductListing`, `WineryBookingType`, policies, FAQs, SOPs, and contacts provide useful winery-owned context.

The complete planned canonical shadow graph now exists beneath the workflow system: Booking, Customer,
Wine Club Membership/Allocation, Sales Order, Catalogue/Inventory, Shipment, Workforce, and Message delivery
lineage. Cross-domain reads and semantic facts use those records, while current legacy booking/club analytics
have not all cut over to canonical queries. No unverified provider adapter or shadow projection is allowed to
claim live authority.

### 3.1 Current and proposed connector catalogue

The status below describes this repository, not whether a vendor offers an API.

| Connection family | Providers already represented | Current VinAgent status | Canonical resources expected |
| --- | --- | --- | --- |
| SMS | Twilio, MessageMedia | Twilio inbound/outbound is implemented; MessageMedia is configuration-only | Messages, delivery results, contact observations |
| Email | Outlook/Microsoft 365, SendGrid, Mailgun, AWS SES | Outlook inbox sync and outbound send are implemented; SendGrid outbound is implemented; others are configuration-only; email-forwarded notice intake is planned | Messages, threads later, delivery results, contact observations |
| Voice | Twilio voice, Retell; Vapi is planned; other voice agents can use generic intake | Twilio currently creates Message/Task records directly; Retell uses signed canonical Integration Event intake | Calls/interactions, summaries, customer references, resulting work |
| Booking | SevenRooms, Resy, OpenTable, Now Book It; Tock remains in legacy settings | Protected feed/projection/activation/readiness/Task lifecycle, durable scheduling, and a registered OpenTable Sync read adapter are implemented; scheduler production activation, partner/pilot verification, webhook intake, a second native provider, and analytics cutover are not live | Bookings, experiences, add-ons, requirements, attendance, availability |
| CRM / wine club | Commerce7, WineDirect, eCellar | Adapter interface and development mock only; no live CRM adapter | Customers, identities, club programs, memberships, allocations, orders, products |
| POS / commerce | Square, Shopify, Vend, Lightspeed | Configuration-only | Orders, lines, payment summaries, products, variants, inventory |
| Delivery / postage | Australia Post, Shippit, StarTrack | Configuration-only | Shipments, packages, tracking events, exceptions |
| Workforce | Deputy | Generic intake example; a native adapter is planned when required | Staff identities, shifts, leave, coverage |
| Automation bridges | Zapier, Make | Provider-neutral signed webhooks and authenticated intake exist | Bridge events only; canonical projections still require contracts |

One connected app may expose several domains. Commerce7, WineDirect, Shopify, and similar systems must be represented as one account connection with several capabilities, not as duplicated credentials in unrelated domain slots.

The current product does not define a standalone payment, accounting, marketing, or external-calendar connector. Payment data in the initial model is therefore a deliberately limited summary received from commerce/club systems; the other domains remain discovery items rather than assumed integrations.

Firebase authentication and the OpenAI adapter are platform dependencies rather than winery business-data sources, so they are governed by their own identity/AI controls and do not create canonical operational projections.

Pilot seed data mentions OpenTable/Groove OpenTable and a Shopify-based public shop, while demo area data also mentions Now Book It, Square, Lightspeed, Commerce7, and Shippit. These are discovery signals, not proof of API access or live adapters. Actual pilot accounts, commercial permissions, API coverage, webhooks, and rate limits must be confirmed before selecting the first providers.

### 3.2 Connector-to-value map

| Connected domain | Highest-value operational intelligence |
| --- | --- |
| Booking | preparation deadlines, requirements, group/VIP attention, changes/cancellations, capacity and attendance |
| CRM / wine club | customer identity, current membership, allocation deadlines, payment holds, skips/cancellations, lifecycle state |
| POS / commerce | visit-to-purchase context, order exceptions, product demand, fulfilment and customer-value rollups |
| Catalogue / inventory | available-to-promise stock, booking/allocation demand, shortage-by dates, location mapping |
| Delivery / postage | delayed/exception shipments, promised-date variance, affected customers and orders |
| Workforce | role/skill coverage for bookings and events, roster-change impact, responsible assignee resolution |
| SMS/email/voice | enquiries, customer issues, delivery failures, communication recency, consent-aware follow-up |
| Internal VinAgent work | open obligations, ownership, blockers, decisions, SOP context, duplicate-work prevention and outcomes |

## 4. Target architecture

```text
Provider APIs, webhooks, files, and bridge events
                         |
                         v
       Connector control plane and capability manifests
                         |
                         v
       Source events, sync runs, cursors, and raw evidence
                         |
                         v
       External identities and typed canonical projections
                         |
                         v
       Freshness-aware facts, relationships, and context packs
                         |
              +----------+----------+
              |                     |
              v                     v
     Automation and signals     AI assistance
              |                     |
              +----------+----------+
                         |
                         v
       Tasks, Notices, Requests, Notes, Projects, Calendar
                         |
                         v
             Governed provider commands when approved
```

### 4.1 Seven distinct data layers

| Layer | Purpose | Existing foundation | Target additions |
| --- | --- | --- | --- |
| Connection control | Which app/account is connected, where it applies, and what it can do | Winery/area integration JSON | First-class connections, scopes, capabilities, health |
| Source evidence | What the provider sent and when VinAgent saw it | `IntegrationEvent`, `EmailSyncState` | Connection-scoped events, generic sync runs/cursors, retention metadata |
| External identity | Which provider object corresponds to which VinAgent object | `Member.externalRef` only | Provider-scoped resource references for every canonical type |
| Canonical projections | Current operational state in stable schemas | Member, products, booking types | Bookings, memberships, orders, inventory, shipments, shifts |
| Semantic facts | Resolved or derived assertions with time and provenance | Limited mutable member aggregates | Versioned, expiring intelligence facts and lifecycle milestones |
| Signals and rules | Decide whether something deserves attention | Intelligence signals and automation engine | Cross-domain context resolver and lifecycle reconciliation |
| Staff action | Communicate, decide, act, record, and coordinate | Mature VinAgent operational objects | Direct links back to canonical business resources |

These layers must remain separate. An `IntegrationEvent` is evidence that something was received; it is not the current Booking. A Task is work about a stock shortage; it is not the Inventory Position. An inferred churn risk is not a source-reported Membership status.

## 5. Core design rules

### 5.1 Canonical IDs are owned by VinAgent

Provider IDs must never become VinAgent primary keys. Every external identity is scoped by a stable connection:

```text
(connectionId, resourceType, externalId)
```

This prevents collisions when one winery connects multiple accounts or locations from the same provider and allows provider replacement without changing canonical IDs.

### 5.2 Typed projections are primary

Bookings, orders, shipments, memberships, and inventory belong in typed relational tables. Fields used for filtering, joining, scheduling, permissions, or automation must be typed and indexed. A bounded `providerExtensions` JSON field may preserve uncommon provider data.

A universal entity-attribute-value table must not become the primary business database.

### 5.3 Store useful facts, not complete APIs

A provider field is persisted only when it supports at least one of:

- an operational rule or scheduled check;
- a staff-facing context view;
- a cross-domain relationship or aggregate;
- reconciliation, idempotency, or provider writeback;
- an audit, privacy, or retention requirement.

Fields outside those needs remain in short-lived redacted source evidence or are queried live.

### 5.4 Authority is explicit

Each domain or field group has one active, versioned authority policy. Provider overlap is resolved by policy, not last-write-wins. For example, a booking platform owns booking status, a carrier owns tracking state, and VinAgent owns Tasks and manager-confirmed internal requirements.

Policy lookup is deterministic: exact location scope, then exact operational-area scope, then winery default. A policy may declare ordered fallbacks, but two active defaults at the same specificity are invalid. Ties, missing authority, or conflicting provider assertions produce `UNKNOWN` and a projection issue rather than an arbitrary winner.

### 5.5 Freshness is part of truth

A stored value is not simply present or absent. It also has a business-effective time, provider update time, observation time, and sync time. A connection or authority policy may define a baseline freshness SLA for dashboards, but each context/capability caller supplies its own `maxAge`. The resolver evaluates that requirement at read time and snapshots the requested maximum age and policy version in the automation run. A value too old for that caller becomes `UNKNOWN`; one persisted `staleAt` must not pretend every use has the same risk tolerance.

### 5.6 Operational areas are not physical locations

`OperationalArea` is a team, responsibility, visibility, and ownership boundary. A restaurant may currently be represented as an area, but an external booking venue or stock warehouse is a different concept.

Introduce a nullable, initially flat `WineryLocation` mapping only where the pilot has a confirmed physical/provider-facing place such as a venue or warehouse. Locations may link to one or more Operational Areas without changing their security semantics. A hierarchy and richer location types can be added when multiple sites require them; location mapping must not block a single-site booking projection.

### 5.7 Inference is visibly different from assertion

Use explicit quality classes:

- `SOURCE_ASSERTED`
- `MANAGER_CONFIRMED`
- `DETERMINISTICALLY_DERIVED`
- `AI_INFERRED`
- `CONFLICTING`
- `UNKNOWN`

Confidence scores are meaningful for identity matches and inference. A provider-reported booking status should be source-asserted, not assigned an artificial confidence of `1.0`.

### 5.8 Common projection metadata

Every canonical projection follows one metadata convention, whether it is a Booking, Membership, Order, Shipment, or Shift:

- `wineryId`, relevant `areaId`/`locationId`;
- resolved canonical status and `resolvedAt`;
- quality state and the authority/resolution policy version used;
- optional `primarySourceReferenceId` when one provider is authoritative;
- optional canonical tombstone state;
- bounded, sensitivity-classified `providerExtensions`.

Provider version/ETag, source hash, provider timestamps, observation/sync timestamps, source tombstone, and ordering guards live on each `ExternalResourceReference`. This is essential for Members, products, or other canonical objects that may have several external sources. A source-native projection may expose one nullable primary reference as a convenience, but that pointer is not a second required mapping edge and must never discard additional references.

Canonical money is stored as integer minor units plus ISO currency. Instants are stored in UTC while retaining the source timezone needed to interpret local winery schedules. Quantities always carry an explicit unit and conversion rules; floating provider values must not be compared without unit normalisation.

### 5.9 Extensible vocabularies

Provider keys, capability keys, resource types, canonical domains, issue types, relationship types, and fact keys are bounded strings validated against versioned code registries or lookup tables. Do not use MySQL ENUMs for vocabularies deliberately expected to grow as new winery domains arrive. SQL ENUMs are reserved for genuinely stable local lifecycle states where a schema migration is desirable when semantics change.

## 6. Shared canonical foundation

These tables should be created before domain projections so every connector follows the same identity and synchronization rules.

### 6.1 `IntegrationConnection`

Represents one authorised external application account.

Core fields:

- `id`, `wineryId`
- `providerKey`, `displayName`, `manifestVersion`
- `externalAccountId`, optional default `externalLocationId`
- `status`: `PENDING | CONNECTED | DEGRADED | REAUTH_REQUIRED | DISABLED | ERROR`
- `authReference` to protected credentials; never raw credentials
- non-secret `configuration` and bounded `providerExtensions`
- `connectedAt`, `disabledAt`, `lastHealthCheckedAt`, `lastHealthyAt`, `lastErrorCode`, `lastErrorSummary`

The current `WineryIntegrationConfig.providerConnections` and `OperationalAreaIntegrationConfig.providerConnections` JSON should remain during a compatibility period. `WinerySettings.bookingProvider/bookingConfig` and `crmProvider/crmConfig` are also current execution dependencies and must remain temporary derived compatibility state through `syncExecutionSettings()`; they must not be interpreted as separate mock connections.

Backfill uses an explicit legacy-domain-to-canonical-domain map and conservative account/location matching. It must not merge two entries merely because their provider names match. Ambiguity creates a mapping issue. Existing metadata and webhook hashes do not prove usable API authentication, while some live credentials remain environment-based; backfilled rows without verifiable credentials start `PENDING` or `DEGRADED` and require secure credential onboarding before becoming `CONNECTED`. Retell's operations-managed routing is inventoried separately and preserved.

Connection configuration uses a per-winery cutover state and one writer:

1. Before cutover, existing JSON remains authoritative while candidate connection rows are populated and verified.
2. At cutover, the manager API writes first-class connection rows transactionally and projects sanitized compatibility JSON plus derived Winery Settings in one direction.
3. Runtime reads prefer verified connection rows; legacy fallback is permitted only when that winery/domain has not cut over.
4. Direct legacy JSON/Winery Settings writes are rejected after cutover so two stores cannot diverge.
5. Rollback can restore legacy reads from the last projected compatibility snapshot, but never enables two independent writers.

This control plane is now implemented by `IntegrationConfigurationAuthority`, with
`LEGACY_PRIMARY | PREPARED | CANONICAL_PRIMARY | ROLLED_BACK` lifecycle state, fresh preview hashes,
idempotent audited manager transitions, sanitized compatibility projection, legacy-write rejection, and
rollback guards around canonical dependencies. Booking is the first registered readiness/projection handler;
the deployment gate remains off and unregistered domains fail closed. See
`INTEGRATION_CONFIGURATION_CUTOVER.md`.

### 6.2 `IntegrationConnectionScope`

Defines where a connection is available. Authority is a separate versioned policy.

Core fields:

- `connectionId`, `wineryId`
- `domain`: `CUSTOMER | BOOKING | CLUB | COMMERCE | CATALOG | INVENTORY | FULFILMENT | WORKFORCE | COMMUNICATION`
- required deterministic `scopeKey`: `winery`, `area:<id>`, or `location:<id>`
- optional `areaId` and optional `locationId`
- `priority`, `isDefault`, `isActive`

Use uniqueness on `(connectionId, domain, scopeKey)`. An area/location-specific scope overrides availability at a winery default without duplicating the connection or credentials. `locationId` is nullable. Existing area-level `externalLocationId` values remain unmapped provider metadata until a physical Winery Location is known or manager-confirmed; an Operational Area must never be converted into a physical location by assumption.

### 6.3 `DataAuthorityPolicy`

Defines which connection or VinAgent-owned source resolves one domain/field group for one scope.

Core fields:

- `wineryId`, required deterministic `scopeKey`, optional `areaId`, optional `locationId`
- `domain`, `fieldGroup`, `version`, `status`, effective range
- resolution strategy and baseline freshness SLA
- actor, approval, and audit metadata

`DataAuthorityPolicySet` owns the unique `(wineryId, scopeKey, domain, fieldGroup)` key and points to one active policy version. `DataAuthorityPolicySource` child rows store connection ID, `PRIMARY | FALLBACK`, and deterministic order with foreign-key integrity. Each active version has exactly one primary source unless its strategy is explicitly VinAgent-owned. Exact location wins over area, which wins over the winery default. A locked transaction changes the set's active-version pointer, preserving history while making concurrent activation deterministic and explainable to automation.

### 6.4 `IntegrationConnectionCapability`

Persists which capabilities the connection can currently satisfy.

Core fields:

- `connectionId`, `capabilityKey`, `kind: READ | WRITE`
- `contractVersion`, `enabled`, `availabilityStatus`
- `maxProjectionAgeSeconds`, `supportsWebhook`, `supportsPolling`
- `lastVerifiedAt`, `unavailableReason`

The adapter manifest remains the code-level declaration and always wins over stale database state. Use uniqueness on `(connectionId, capabilityKey, contractVersion)`. Connection reconciliation upserts manifest capabilities, disables rows removed from code, and supersedes old contract versions; a persisted row can never make an adapter claim support its current manifest does not provide.

### 6.5 `IntegrationSyncState`

Stores the durable cursor/watermark for one connection and resource stream.

Core fields:

- `connectionId`, `resourceType`, required deterministic `streamKey`
- encrypted or protected `cursor`, `watermarkAt`
- `initialBackfillStatus`, `lastSuccessfulSyncAt`, `nextScheduledAt`
- `consecutiveFailures`, `lastErrorCode`, `lastErrorAt`
- lease owner and lease expiry for multi-worker safety

Use uniqueness on `(connectionId, resourceType, streamKey)`. The existing `EmailSyncState` is the precedent. Each mailbox migrates with a one-writer cutover; old and new cursor stores must never advance the same stream concurrently.

### 6.6 `IntegrationSyncRun`

Records each backfill, incremental poll, reconciliation, or webhook-recovery run.

Core fields:

- connection, resource type, mode, status, start/end times
- cursor/watermark before and after
- fetched, created, updated, unchanged, tombstoned, failed counts
- rate-limit and retry metadata
- bounded error summary and trace/correlation ID

### 6.7 Durable jobs and transactional outbox

Backfills, polling, reconciliation, retries, projection, and event delivery require a worker-backed durable queue rather than timers owned only by an API process.

`IntegrationJob` stores:

- job kind, connection/resource/stream scope, payload schema version;
- stable idempotency key, priority, scheduled time, attempt count;
- status, lease owner/expiry, retry/backoff, result/error summary;
- optional sync run, source event, and correlation references.

`CanonicalEventOutbox` is inserted in the same database transaction as the projection change and canonical `IntegrationEvent`. It stores event ID, aggregate/resource key and revision, delivery status, attempts, and next attempt time. A worker dispatches it to automation/fact materialisation, then marks it delivered. This prevents a committed Booking update without its event, or an event being actioned before its projection commits.

### 6.8 `ExternalResourceReference`

Maps an external object to a canonical VinAgent object.

Core fields:

- `id`, `wineryId`, `connectionId`
- `resourceType`, `externalId`, optional `externalParentId`
- allowlisted `canonicalType`, nullable `canonicalId`
- `providerVersion` or ETag, `sourceHash`
- `providerCreatedAt`, `providerUpdatedAt`, `observedAt`, `lastSyncedAt`
- `deletedAtSource`, `lastSourceEventId`, `lastSyncRunId`
- bounded, classified `providerExtensions`

Required uniqueness:

```text
UNIQUE(connectionId, resourceType, externalId)
INDEX(wineryId, canonicalType, canonicalId)
```

`Member.externalRef` becomes compatibility data. One Member may have many external customer references across booking, CRM, POS, club, delivery, and communication systems.

`ExternalResourceReference` is the authoritative mapping edge. A projection may carry a nullable `primarySourceReferenceId` for fast access, but both directions are never required. The shared polymorphic resolver enforces allowlisted resource types, same-winery target existence, reverse indexes, merge/delete hooks, and consistency repair.

Before any external customer reference is enabled, add `CustomerMergeRedirect` with unique `(wineryId, sourceMemberId)`, target Member, actor/reason, and merge time. The merge transaction transfers or retargets external references and writes the redirect before the legacy source Member is removed; redirect chains are collapsed and loops rejected. Phase 1 provides this minimum late-event safety, while Phase 3 adds the full contact/address/consent/milestone transfer and eventual soft-delete policy.

### 6.9 `ExternalResourceObservation`

Preserves the normalised, source-specific state needed to rebuild a canonical record after raw payload expiry or an authority-policy change.

Core fields:

- `externalResourceReferenceId`, schema version, source revision/hash;
- bounded normalised state containing only fields eligible for canonical resolution;
- provider effective/update time, observed time, valid/superseded range;
- sensitivity/redaction profile and source-event reference.

Use uniqueness on `(externalResourceReferenceId, schemaVersion, sourceRevisionOrHash)`. Retain the current observation plus only the history justified by conflict resolution, audit, or analytics. This is not an indefinite copy of the provider response: credentials, card data, large content, and irrelevant API fields remain excluded.

### 6.10 `ProjectionIssue`

Creates a reviewable record when projection cannot safely continue.

Suggested issue types:

- `IDENTITY_AMBIGUOUS`
- `CONNECTION_MAPPING_AMBIGUOUS`
- `CONNECTION_MAPPING_STALE`
- `LOCATION_UNMAPPED`
- `PRODUCT_UNMAPPED`
- `STATUS_UNMAPPED`
- `SOURCE_CONFLICT`
- `OUT_OF_ORDER`
- `SCHEMA_INVALID`
- `MISSING_REQUIRED_FIELD`

It stores source evidence, candidates, severity, resolution, and timestamps. A stable fingerprint over connection, resource, issue type, and evidence/source version is unique within the winery, preventing every reconciliation pass from creating another copy. The same evidence reopens/updates the existing row and increments observation/materialisation counts; materially changed evidence receives a new fingerprint and supersedes the prior issue where appropriate.

The implemented manager lifecycle is `OPEN -> ACKNOWLEDGED -> RESOLVED | IGNORED`. Resolution is dispatched
through a typed registry and fails closed for unregistered issue types. Legacy compatibility mapping is the
first registered domain: it validates explicit decisions and same-winery candidate keys, then records the
decision without silently changing connections or authority. Transitions require an idempotency key and
produce evidence-free append-only audit snapshots. See `PROJECTION_ISSUE_REVIEW.md`.

This is machine/data-quality state required to block or resume projection, not a second staff work queue. When human attention is required, materialise an existing `OperationalIntelligenceSignal` or Task with a link to the issue.

### 6.11 Source events, canonical events, and `IntegrationEvent`

Retain the existing table but explicitly classify each event as `SOURCE`, `INTAKE`, `CANONICAL`, or `DERIVED`. Provider receipts are source evidence. `INTAKE` is an already-normalised operational item such as `call.intake` or `notice.imported` that has no typed business projection and may enter manager review or explicit intake rules. A projector creates the typed projection, canonical history, `CANONICAL` Integration Event, and outbox record atomically in one database transaction. Derived events identify the derivation version. Automation never consumes raw `SOURCE` events; it consumes eligible canonical events or rules explicitly scoped to eligible intake events. Machine canonical events stay out of the manager review queue.

Add, over time:

- `connectionId`
- required `eventScopeKey`
- required machine-event `idempotencyKey`
- `eventClass`
- `schemaVersion`
- `occurredAtSource`
- `providerEventVersion`
- `correlationId` and `causationId`
- `externalResourceReferenceId`
- `syncRunId`
- `rawPayloadExpiresAt` and `redactionProfile`
- `ingestionPurpose`: `LIVE | HYDRATION | RECONCILIATION | MANUAL_REPLAY`
- `automationEligible` and eligibility reason

Connection-scoped idempotency requires a staged migration:

1. Add nullable lineage fields plus a required computed `eventScopeKey` for new writes.
2. Use scopes such as `connection:<id>:source:<stream>` for source events, `canonical:<resourceType>:<resourceId>` for canonical revisions, and deterministic intake/manual/bridge scopes when no connection exists.
3. Upgrade all intake paths to dual-write the scope and backfill only unambiguous historical rows.
4. Add a required `idempotencyKey` for all machine events and uniqueness on `(wineryId, eventScopeKey, idempotencyKey)`. Source events normally derive it from the external event ID; canonical events derive it from resource identity and canonical revision.
5. Remove the legacy `(wineryId, provider, externalEventId)` constraint only after every caller migrates.

This avoids MySQL's multiple-NULL uniqueness behaviour and allows two accounts from the same provider to reuse an event ID safely. The same staged strategy will be needed for connection-scoped Message identities.

The current service evaluates active automation rules immediately after a new Integration Event commits. That direct behaviour is tolerated only for pre-foundation legacy intake. Phase 1 must add transaction-aware event persistence, gate the legacy path by class/eligibility, and make outbox delivery the sole dispatcher for canonical automation before any projector or bulk connector is enabled.

### 6.12 `OperationalResourceLink`

Links VinAgent work directly to the underlying business resource.

Core fields:

- `wineryId`
- `itemType` and `itemId` for Task, Notice, Request, Note, Project, or Calendar Event
- `resourceType` and `resourceId` using the canonical registry for Booking, Wine Club Membership/Allocation, Sales Order, Shipment, Customer/Member, Winery Product, or Roster Shift
- `linkType`: `ABOUT | GENERATED_FOR | BLOCKS | RESOLVES | FOLLOW_UP_FOR`
- optional automation rule/run and source-event provenance

This supplements, rather than replaces, `IntegrationEventItem` and `OperationalItemRelation`.

Use uniqueness on `(wineryId, itemType, itemId, resourceType, resourceId, linkType)` plus reverse indexes by resource and by item. All polymorphic links use a central resource-type registry, same-winery target validation, delete/merge hooks, and uniqueness rules. Canonical names are `CUSTOMER` (implemented by `Member`), `BOOKING`, `WINE_CLUB_MEMBERSHIP`, `WINE_CLUB_ALLOCATION`, `SALES_ORDER`, `SHIPMENT`, `WINERY_PRODUCT`, and `ROSTER_SHIFT`. UI/model names do not create competing resource keys.

### 6.13 `AutomationResourceBinding`

Separates one event/run's idempotency from the lifecycle of work managed for a business resource.

Core fields:

- `wineryId`, `ruleId`, `resourceType`, `resourceId`, `purposeKey`
- generated `itemType`, `itemId`
- `lifecycleState`, source revision, last reconciled run/event
- fields still managed by automation and a snapshot of last applied values
- `humanOverrideAt`, override actor/reason
- reconciliation policy and timestamps

Required uniqueness:

```text
UNIQUE(wineryId, ruleId, resourceType, resourceId, purposeKey)
```

Rule policy chooses among `UPDATE_MANAGED`, `ANNOTATE`, `CANCEL_IF_UNTOUCHED`, or `NOOP`. Reassignment, content edits, workflow progress, or completion can mark a human override. Automation never silently rewrites human-owned fields, cancels edited work, or reopens completed work; it annotates or escalates when its normal reconciliation is unsafe.

## 7. Canonical domain model

### 7.1 Organisation, location, staff, and knowledge

Preserve:

- `Winery` as the tenant boundary;
- `OperationalArea` as responsibility and visibility;
- `User` as authenticated staff identity;
- `WineryContact` as organisation knowledge;
- Winery/area policies, booking settings, products, FAQs, SOPs, and contacts.

Add:

#### `WineryLocation`

- winery, VinAgent-owned stable code, name, type, timezone, address, active state
- nullable parent only when a confirmed multi-site hierarchy needs it
- every provider location ID maps through `ExternalResourceReference`, never a provider ID column on the location

#### `LocationAreaLink`

- location, operational area, relationship such as `PRIMARY_OPERATOR | SUPPORTS | STOCK_OWNER`

#### `StaffIdentity`

- canonical staff identity with optional one-to-one `User` and optional one-to-one `WineryContact` links
- may temporarily represent an unresolved external roster worker without granting login or area membership
- external workforce records map to this identity through `ExternalResourceReference`

The link reconciles, rather than replaces, authenticated Users and Winery Contacts. External roster identity must never grant authentication, role, or area authority.

### 7.2 Customers and relationships

Keep `Member` as the canonical customer root. Do not create a parallel Customer table.

Add or evolve:

#### `CustomerContactPoint`

- member, type (`EMAIL | PHONE`), normalised value, display value
- verification state and time, primary flag, source reference
- validity and suppression state

#### `CustomerAddress`

- member, type, address fields, source reference, primary/valid state

#### `CustomerConsent`

- member, channel, purpose, state, effective time, collection source, evidence reference
- append-only changes rather than one unexplained boolean

#### `CustomerLifecycleMilestone`

- member, milestone key, occurred time, source resource, derivation type/version
- examples: `FIRST_ENQUIRY`, `FIRST_BOOKING`, `FIRST_VISIT`, `FIRST_PURCHASE`, `CLUB_JOINED`, `CLUB_LEFT`, `REENGAGED`

Current fields such as `lifetimeSpend`, `totalOrders`, `visitCount`, `isWineClubMember`, and recency timestamps may remain as cached rollups during migration, but their source, currency, calculation time, and rebuild logic must become explicit.

Customer child-table cutover is staged:

1. Backfill contact and address rows from Member while retaining Member as the write authority.
2. Backfill consent as `UNKNOWN` unless source evidence proves a specific purpose/channel opt-in; never convert the current merged boolean into affirmative consent by assumption.
3. Dual-write identity, secure address changes, and customer CRUD while comparing both representations.
4. Move identity matching and outbound-message policy to contact/consent read-through services.
5. Keep primary contact/address projections on Member for compatibility until all callers migrate.
6. Extend customer merge to transfer external references, contacts, addresses, consent history, milestones, and facts; conflicts become review issues.
7. Retain a canonical redirect/tombstone for merged/deleted Members so late provider events can be remapped safely.

Stage 1 is now implemented: additive contact, address, consent, and milestone tables; a stale-protected,
idempotent legacy Member backfill; manager relationship reads with drift indicators; and merge transfer with
contact/address deduplication. Backfilled marketing consent is always `UNKNOWN`, and Member remains the writer.
See `CANONICAL_CUSTOMER_PROFILE.md`.

Do not force trade accounts, tour operators, distributors, or corporate bookers into a person-only shape. Add `CustomerOrganisation` and member/contact relationships when a confirmed B2B or group-booking use case is prioritised; it is deliberately outside the first migration batches.

Useful customer context:

- confirmed external identities and contact points;
- consent and preferred channel;
- active club plan/status;
- booking, attendance, purchase, and fulfilment history;
- preferences, restrictions, complaints, and open work;
- lifecycle milestones and freshness-aware engagement/lapse facts.

### 7.3 Experiences, bookings, and visits

Continue using `WineryBookingType` as the winery-owned experience definition unless a later rename is justified.

Add a manager-visible, winery-owned stable `code` with uniqueness on `(wineryId, code)`. Backfill a deterministic slug from the current name with collision handling, then allow manager confirmation before activating rules. Provider experience IDs/codes map through `ExternalResourceReference`; they never become the canonical code merely because one adapter arrived first.

Add:

#### `ExperienceRequirement`

Defines what an experience needs independently of any booking provider:

- booking type, optional area/location
- requirement kind: `PRODUCT | CONSUMABLE | EQUIPMENT | ROLE | SKILL | SPACE | PREPARATION`
- optional mapped product/variant or structured requirement code
- quantity per booking or per guest, unit, buffer percentage
- lead time, preparation time, responsible area/role
- effective dates and manager-confirmed source

#### `Booking`

Core queryable fields:

- winery, optional location, member, primary booking type
- canonical status and original provider status
- reference/display code, source channel
- `startAt`, `endAt`, source timezone
- party size and optional adult/child counts
- `bookedAt`, `confirmedAt`, `cancelledAt`, `checkedInAt`, `completedAt`
- non-sensitive total/deposit/payment-status summary and currency
- common canonical projection and resolution metadata
- bounded provider extensions

Suggested canonical statuses:

```text
TENTATIVE | CONFIRMED | CHECKED_IN | IN_PROGRESS | COMPLETED | NO_SHOW | CANCELLED | UNKNOWN
```

#### `BookingAreaLink`

- booking, operational area, relationship `PRIMARY | LINKED`
- the join is the authoritative area placement, with at most one `PRIMARY` row; Booking does not duplicate a `primaryAreaId`
- primary/linked area placement follows the existing Task, Notice, Request, and Note patterns
- visibility is based on explicit Booking links, not every area associated with its physical location
- requirement-level sensitivity may further restrict dietary/accessibility detail

#### `BookingItem`

- booking, type (`EXPERIENCE | ADD_ON | PRODUCT | FEE`)
- booking type or nullable product/variant link where mapped
- description, quantity, unit price summary, fulfilment state

Product/variant and role/skill foreign keys remain nullable until their later domain tables exist. Early records retain validated structured codes and mapping issues; additive migrations attach foreign keys after mappings are available.

#### `BookingRequirement`

- booking, kind (`DIETARY | ACCESSIBILITY | CELEBRATION | SEATING | TRANSPORT | PRODUCT | OTHER`)
- structured code, description, quantity/unit, importance
- fulfilment status, responsible area, source or manager confirmation

Dietary and accessibility data require restricted exposure and explicit retention policy.

#### `BookingStatusEvent`

- booking, from/to status, effective time, source event, reason
- captures change/cancellation history without relying on the current row alone

#### `VisitAttendance`

- booking/member, actual arrival/departure, guest count, attendance outcome
- created only when provider or human evidence exists

Do not create a local person record for every unnamed guest. A future `BookingParticipant` is justified only when an individually identified attendee has an operational, consent, safety, or relationship use case.

Useful booking context:

- what, where, when, party size, customer, and current status;
- add-ons and special requirements;
- stock/equipment/skill requirements;
- deposit/payment attention without storing card data;
- staffing and venue coverage;
- existing Tasks/Notices and preparation deadlines.

### 7.4 Wine club

Add:

#### `WineClubProgram`

- winery, name/code, tier, cadence, benefits summary, active state

#### `WineClubMembership`

- member, program, canonical and provider status
- joined, activated, paused, next review/charge, cancelled, ended times
- cancellation/hold reason, preferences, delivery/pickup method
- common canonical projection/resolution metadata

Suggested statuses:

```text
PENDING | ACTIVE | PAUSED | PAYMENT_HOLD | CANCELLING | CANCELLED | EXPIRED | UNKNOWN
```

#### `WineClubMembershipEvent`

- membership, event type, effective time, source event, reason

#### `WineClubAllocation`

- membership/program, cycle code, open/close/charge/fulfil dates
- canonical status, total summary, fulfilment method, nullable `salesOrderId` when known

#### `WineClubAllocationItem`

- allocation, nullable product variant, provider SKU/description, quantity, substitutions, price summary

Useful club context:

- current membership and tenure;
- upcoming charge/allocation obligations;
- payment holds, skips, pauses, and cancellations;
- allocation composition and stock demand;
- order, shipment, customer issue, and retention relationships.

### 7.5 Catalogue, products, and inventory

Keep `WineryProduct` as the winery-owned product identity and current presentation/catalogue record. Existing vintage, tasting, award, price, and area-listing behaviour remains authoritative during the additive migration.

Add:

#### `ProductVariant`

- product, SKU, barcode, format/volume, pack size, unit of measure
- sellable/active state and `isDefault`
- provider products/variants link through `ExternalResourceReference`

Backfill one default Product Variant per existing Winery Product without changing the current UI. Vintage remains on Winery Product initially; price remains on Winery Product/Area Product Listing until a demonstrated provider requires variant-specific pricing. Only then add variant price/listing overrides and deliberately deprecate legacy fields. This avoids silently redefining existing products as timeless families.

#### `StockLocation`

- winery location, name/code, type, active state
- maps provider stock locations without conflating them with Operational Areas

#### `InventoryPosition`

The latest resolved position for one variant and stock location:

- on-hand, available, reserved, incoming, damaged/held quantities
- unit, source assertion time, observed time, stale time
- authoritative source reference, observation time, authority-policy version, and quality state

Unique current key:

```text
(wineryId, stockLocationId, productVariantId)
```

#### `InventorySnapshot`

- append-only or sampled history of material quantity changes
- retained at a resolution justified by forecasting and audit needs

#### `InventoryCommitment`

Represents expected demand created by another domain:

- product variant, stock location, quantity/unit, required-at time
- source type/id: booking, club allocation, sales order, or internal event
- required `purposeKey`
- status: `EXPECTED | RESERVED | CONSUMED | RELEASED | CANCELLED`
- confidence/derivation and source timestamps

Use uniqueness on `(wineryId, sourceType, sourceId, productVariantId, stockLocationId, purposeKey)` so recomputation updates one commitment rather than multiplying demand.

This provides the bridge for available-to-promise calculations without pretending a source stock system has reserved items it has not actually reserved.

The existing coarse `stockStatus` fields remain useful merchandising overrides, but they must not be treated as reliable inventory quantities.

### 7.6 Commerce and payments

Use `SalesOrder` rather than a generic `Order` name to keep the business meaning clear.

#### `SalesOrder`

- winery, area/location, member, channel, canonical/provider status
- external order number, placed/paid/cancelled/completed times
- currency and subtotal/discount/tax/shipping/total summaries in minor units
- payment and fulfilment summary statuses
- optional booking or `VisitAttendance` link when confirmed; allocation links in the reverse direction through `WineClubAllocation.salesOrderId`
- common canonical projection/resolution metadata

#### `SalesOrderLine`

- order, nullable product/variant mapping, provider description/SKU
- quantity, fulfilled/refunded quantity, unit/discount/tax/total summaries

#### `PaymentSummaryEvent`

- order, status, non-sensitive provider transaction reference
- amount/currency, effective time, failure category, source event
- no card number, full bank data, CVV, or unnecessary payment credentials

#### `RefundSummary`

- order/line links, amount/currency, reason category, status, effective time

Useful commerce context:

- purchases and product preferences;
- booking-to-purchase and visit conversion;
- unpaid, failed, refunded, or unfulfilled orders;
- club allocation order links;
- stock demand and shipment state.

### 7.7 Fulfilment, shipments, and postage

#### `Shipment`

- winery, member, sales order/allocation, carrier/service
- tracking number or protected reference, canonical/provider status
- shipped, estimated delivery, delivered, returned times
- destination region summary and restricted address link
- latest exception code/summary and common canonical projection/resolution metadata

#### `ShipmentPackage`

- shipment, package reference, weight/dimensions where operationally needed

#### `ShipmentItem`

- shipment/package, order line/product variant, quantity

#### `ShipmentTrackingEvent`

- shipment/package, canonical/provider event code
- occurred time, location summary, description, exception category

Useful fulfilment context:

- promised versus current delivery timing;
- latest carrier state and exception;
- affected customer, order, allocation, and products;
- prior contact and existing resolution work.

### 7.8 Workforce and roster

#### `RosterShift`

- required canonical staff identity link; the identity may or may not yet resolve to a User
- location and operational area
- start/end time, role, skills, status, published state
- common canonical projection/resolution metadata

#### `StaffAvailabilityEvent`

- staff identity, availability/leave type, effective range, status, source

#### `RoleSkillDefinition` and `UserSkill`

- winery-owned role/skill vocabulary and manager-confirmed staff mappings

Useful workforce context:

- expected coverage by location, area, role, and skill;
- shift changes affecting a booking or event;
- responsible staff member for preparation and exception work.

Workforce tables should be implemented only after the pilot confirms a roster use case and source system. Deputy is the currently documented candidate.

### 7.9 Communications and interactions

Retain `Message` as the communication record for SMS, email, and voice-linked case timelines. Add connection-scoped external references and delivery-state events before introducing a second message store.

A `Conversation` or `Thread` projection is justified later only if provider threads must exist independently from Tasks. Retell/Vapi calls should normalize into an interaction/message and source event where possible rather than forming an isolated customer-history silo.

### 7.10 Future winery domains

The architecture must allow later connectors for:

- suppliers and procurement;
- vineyard and production operations;
- cellar lots/batches and compliance;
- wholesale/trade accounts and distributors;
- marketing campaigns and audience membership;
- accounting summaries;
- maintenance, assets, and facilities.

Do not create detailed canonical tables for these domains until a real provider and operational decision can validate the vocabulary. Their future records still use the same connection, external-resource, sync, location, provenance, fact, and work-link foundations.

## 8. Cross-domain relationships

Use direct foreign keys for known, stable relationships:

- Booking -> Member, Location, Booking Type
- Membership -> Member, Program
- Allocation -> Membership and optional Sales Order
- Sales Order -> Member and optional Booking/VisitAttendance; Allocation owns the optional reverse order link
- Sales Order Line -> Product Variant
- Shipment -> Sales Order/Allocation/Member
- Inventory Position -> Product Variant and Stock Location
- Roster Shift -> Staff Identity/Location/Area

Use a bounded `BusinessEntityLink` only for optional, inferred, or many-provider relationships that cannot be represented safely by a direct foreign key. It should store relationship type, evidence, derivation, confidence, human confirmation, and validity. Examples include `BOOKING_RESULTED_IN_ORDER` or a tentative duplicate-customer relationship.

Generic links must not replace relational integrity where a typed foreign key is available.

## 9. The VinAgent fact layer

### 9.1 Five kinds of fact

1. **Observed source fact**: directly asserted by a provider, such as a carrier tracking state.
2. **Canonical resolved state**: the selected current value after mapping or source reconciliation.
3. **Deterministic derived fact**: calculated from known inputs, such as total truffle demand.
4. **Inferred fact**: AI or heuristic output, such as likely lapse risk.
5. **Decision/action fact**: a manager confirmation, rule match, generated Task, or completed outcome.

Typed projections own categories one and two. A selected semantic overlay supports categories three and four. Existing audit and workflow records cover category five.

### 9.2 `IntelligenceFact`

This is an append-only or temporally versioned semantic assertion, not a replacement for typed projections.

Core fields:

- `wineryId`, optional `areaId`
- allowlisted `subjectType`, `subjectId`, `factKey`
- typed `value`, optional `unit`, and value schema version
- `qualityClass`, optional confidence
- `effectiveFrom`, `effectiveTo`, `observedAt`, `staleAt`, `supersededAt`
- source connection/event/resource references
- derivation type and deterministic rule/model version
- bounded evidence references, sensitivity classification

Fact keys are registered in code with a description, subject types, value schema, freshness requirements, sensitivity, and derivation owner. Managers cannot invent arbitrary executable fact keys.

Fact subjects use the same canonical resource-type registry and same-winery resolver as external and operational links, with reverse indexes and merge/delete hooks compensating for the lack of ordinary polymorphic foreign keys.

Early domain phases may return deterministic derived values inside a versioned context pack without persisting them. `IntelligenceFact` is materialised only when history, expiry, scheduling, repeated reuse, or explanation value justifies a durable row; Phase 7 expands that selective materialisation into a cross-domain product.

### 9.3 Initial fact catalogue

| Subject | High-value fact keys |
| --- | --- |
| Customer | lifecycle stage, current club state, last visit/purchase/contact, spend window, engagement/lapse state, open service issue count |
| Booking | readiness state, open requirement count, deposit attention, preparation deadline, stock shortfall, staffing gap |
| Area/location | upcoming covers, experience demand, capacity utilisation, unresolved readiness count |
| Membership/allocation | next obligation, payment attention, allocation shortfall, fulfilment risk, lapse/retention state |
| Product/variant | available-to-promise, committed demand, incoming quantity, shortage-by date, observation freshness |
| Order | payment attention, fulfilment risk, customer-impact state |
| Shipment | delayed/exception state, promised-date variance, contact-needed state |
| Workforce | role/skill coverage gap, shift change impact |
| Winery | near-term obligations, cross-area blockers, demand/stock imbalance, unresolved customer-impact count |

Deterministic facts should be preferred. AI-derived facts must be labelled, versioned, expiring, and explainable through evidence.

### 9.4 Facts, signals, rules, and work are different

- An `IntelligenceFact` states something with provenance and time.
- An `OperationalIntelligenceSignal` packages a pattern or exception for review.
- An `AutomationRule` determines whether context should produce an action.
- A Task, Notice, Request, or Note is the authoritative staff object.

For example, `inventory.available_to_promise = 4` is a fact; `booking stock shortfall = 2` is a derived fact; the shortfall signal is reviewable intelligence; and “Order two truffle portions” is a Task.

The current Operational Intelligence Signal type is a closed SQL enum focused on internal workflow analytics. Before cross-domain signal types are materialised, migrate it safely to the shared bounded signal-type registry (or add a versioned extensible key) without rewriting existing signal history.

## 10. Bounded context packs

Rules and AI should request a named, bounded context pack rather than query every connected application.

Initial packs:

### `booking.readiness`

- Booking, experience, customer, party size, and requirements
- Experience requirements and preparation deadlines
- Fresh inventory positions and commitments
- Roster coverage by required role/skill
- Existing work linked to the Booking

### `customer.relationship`

- Resolved identity/contact/consent
- Membership and lifecycle state
- Visit, booking, purchase, and fulfilment summaries
- Preferences/restrictions and open customer-impact work
- Recency and derived engagement facts

### `club.fulfilment`

- Membership and allocation state
- Allocation items and stock commitments
- Payment summary, linked order, and shipment
- Open exceptions and customer contact history

### `shipment.exception`

- Latest carrier event and expected timing
- Order/allocation/customer/product relationships
- Existing work and prior contact attempts

### `area.capacity`

- Upcoming booking demand
- venue/resource and roster capacity
- stock/equipment requirements
- blocked or overdue operational work

Every pack declares required freshness. A projection can satisfy it when fresh; otherwise VinAgent refreshes through a read capability or returns `UNKNOWN`.

The code-level Context Pack registry/resolver now includes `booking.readiness.v1` and the bounded
cross-domain packs described above, with versioned input/output schemas and capability composition. Selected
facts are materialised only where history, reuse, and explanation justify durable versions.

## 11. Source authority and conflict policy

Initial defaults must be winery-configurable where providers overlap.

| Fact group | Default authority |
| --- | --- |
| Booking status, schedule, party, provider add-ons | Designated booking connection |
| Customer master fields | Designated CRM/customer connection; newer verified contact evidence may become a candidate |
| Club membership and allocation | Designated club connection |
| Sales order/payment summary | Transaction-owning POS/commerce/CRM connection |
| Product identity/catalogue | Winery-owned catalogue plus designated external catalogue mappings |
| Inventory quantity per location/SKU | One designated stock authority per location and variant |
| Shipment/tracking state | Carrier or designated delivery aggregator |
| Roster/leave | Designated workforce connection |
| Tasks, decisions, SOPs, internal requirements | VinAgent |

Conflict handling:

1. Preserve each external identity and source observation.
2. Apply configured authority and provider-version rules.
3. Never let an older event overwrite newer state.
4. Record a `ProjectionIssue` when the conflict affects identity, automation, or staff decisions.
5. Treat unresolved conflicts as `UNKNOWN` for consequential rules.
6. Record manager resolution and do not destroy the underlying evidence.

## 12. Synchronisation lifecycle

### 12.1 Supported modes

- `WEBHOOK`: low-latency provider changes.
- `INCREMENTAL_POLL`: cursor/watermark-based change retrieval.
- `RECONCILIATION`: periodic comparison to recover missed webhooks or deletes.
- `BACKFILL`: bounded initial history import.
- `ON_DEMAND`: refresh for a capability with a strict freshness requirement.
- `MANUAL_IMPORT`: controlled files or bridge events through the same contracts.

Most durable domains should use webhook plus polling/reconciliation where the provider supports both.

### 12.2 Projection sequence

```text
authenticate source
-> persist/redact source evidence
-> validate provider payload
-> map provider statuses, units, money, and times
-> resolve connection-scoped external identity
-> resolve customer/product/location mappings
-> reject or quarantine unsafe ambiguity
-> upsert typed projection with ordering guard
-> append canonical status/history events
-> emit versioned canonical event
-> materialise affected facts/context
-> reconcile existing rule-generated work
```

The provider receipt is a `SOURCE` Integration Event. The projection upsert, history row, `CANONICAL` Integration Event, and outbox record commit in one transaction. A worker later delivers the outbox record to fact/context materialisation and automation. Source and canonical events share correlation/causation IDs, but only the eligible canonical event runs normal business rules.

### 12.3 Backfill, replay, and automation eligibility

- `HYDRATION` events default to `automationEligible = false`.
- A connection/domain activation watermark marks when live operational automation begins.
- Events before that watermark can populate projections, history, facts, and analytics but cannot create work unless a manager starts a bounded explicit replay.
- `RECONCILIATION` emits an eligible canonical event only when it discovers a material current-state change after activation.
- `MANUAL_REPLAY` records actor, reason, date/resource bounds, target rule versions, estimated action count, and a dry-run preview before execution.
- Importing history never silently sends communications or invokes provider writes.
- Canonical event eligibility, purpose, source revision, and policy version are snapshotted in every resulting Automation Run.

### 12.4 Required behaviours

- Every write stream has a named idempotency key backed by database uniqueness; uniqueness is a mechanism, not the key definition itself.
- Provider versions, ETags, hashes, or source timestamps prevent out-of-order overwrite.
- Unknown provider status is preserved and maps to canonical `UNKNOWN`, not a guessed state.
- Missing records in one incremental page do not imply deletion.
- Confirmed provider deletion creates a tombstone before retention/anonymisation policy runs.
- Retries use bounded backoff and respect provider limits.
- Sync runs are resumable and visible to managers/operations at an appropriate level.
- One malformed resource does not silently abort or discard an otherwise valid batch.
- Connection disablement stops new reads/writes without destroying canonical history.

Initial stream keys include:

| Stream | Idempotency identity |
| --- | --- |
| External resource | connection, resource type, external ID |
| Canonical status/history event | source reference plus provider event/version or canonical transition revision |
| Shipment tracking event | connection plus external tracking-event ID/version |
| Inventory snapshot | source reference, provider version/observed bucket, location, variant |
| Payment/refund event | connection plus external transaction/event ID |
| Intelligence fact | subject, fact key, effective time, derivation version, evidence hash |
| Projection issue | connection/resource, issue type, evidence/source version fingerprint |
| Integration job | job kind plus connection/stream/resource and requested watermark |
| Inventory commitment | source resource, product variant, stock location, purpose key |
| Automation-managed work | rule, canonical resource, purpose key through `AutomationResourceBinding` |

### 12.5 Provider writes

External source-owned fields are not edited locally as if VinAgent were authoritative. A write follows:

```text
manager/rule proposes command
-> policy and permission check
-> fresh precondition read
-> idempotent provider command
-> command result audit
-> webhook/poll confirmation
-> projection reconciliation
```

High-impact changes such as refunds, membership cancellation, booking cancellation, or shipment mutation need explicit risk and approval policies. Internal Task/Notice creation remains a separate, lower-risk permission.

## 13. Canonical event and capability contracts

### 13.1 Event envelope

```json
{
  "eventType": "booking.confirmed",
  "eventClass": "CANONICAL",
  "schemaVersion": 1,
  "occurredAt": "2026-09-01T02:30:00.000Z",
  "observedAt": "2026-09-01T02:30:04.000Z",
  "connectionId": 12,
  "resource": {
    "type": "booking",
    "id": 845,
    "externalId": "bk_123"
  },
  "areaId": 3,
  "locationId": 4,
  "ingestionPurpose": "LIVE",
  "automationEligible": true,
  "changedFields": ["status", "startAt", "partySize"],
  "data": {
    "status": "CONFIRMED",
    "startAt": "2026-09-12T03:00:00.000Z",
    "partySize": 6,
    "experienceCode": "TRUFFLE_PAIRING"
  }
}
```

Rules should prefer the canonical resource and context capabilities over arbitrary raw provider paths.

This is a logical envelope, not a second opaque payload. Event/lineage fields map to typed Integration Event columns and `data` maps to the canonical `normalizedPayload`. During migration the evaluator exposes both `event.normalizedPayload` and a versioned `event.data` alias so existing immutable rule versions continue to execute unchanged.

### 13.2 Initial event catalogue

- Existing intake compatibility: `call.intake`, `notice.imported`, `task.suggested`, `message.imported`, `file.imported`, `unknown.received`
- Customer: `customer.created`, `customer.updated`, `customer.merged`, `customer.consent_changed`
- Booking: `booking.created`, `booking.confirmed`, `booking.changed`, `booking.cancelled`, `booking.checked_in`, `booking.completed`, `booking.no_show`
- Club: `club.membership_started`, `club.membership_paused`, `club.membership_resumed`, `club.membership_cancelled`, `club.payment_failed`, `club.allocation_opened`, `club.allocation_changed`, `club.allocation_fulfilled`
- Commerce: `order.placed`, `order.paid`, `order.changed`, `order.cancelled`, `order.refunded`, `order.fulfilled`
- Inventory: `inventory.position_changed`, `inventory.receipt_expected`, `inventory.mapping_changed`
- Fulfilment: `shipment.created`, `shipment.in_transit`, `shipment.delayed`, `shipment.exception`, `shipment.delivered`, `shipment.returned`
- Workforce: `roster.shift_created`, `roster.shift_changed`, `roster.shift_cancelled`, `roster.leave_changed`
- Communication: `message.received`, `message.delivery_failed`, `call.completed`

Derived events such as `inventory.shortage_predicted` must identify the derivation version and must not masquerade as provider events.

### 13.3 Initial capability catalogue

Read examples:

- `bookings.get`, `bookings.list_upcoming`, `bookings.availability.check`
- `customers.profile.get`, `customers.search`
- `wine_club.membership.get`, `wine_club.allocations.list`
- `orders.get`, `orders.list_recent`
- `inventory.position.get`, `inventory.availability.check`
- `shipments.status.get`, `shipments.events.list`
- `workforce.shifts.list`, `workforce.coverage.check`
- `experience.requirements.get`
- `operations.open_work.for_resource`

Write examples, disabled for unattended enrichment:

- `bookings.create`, `bookings.change`, `bookings.cancel`
- `customers.update`
- `wine_club.membership.change`
- `orders.refund`
- `shipments.change`

Every capability has versioned input/output schemas, a risk kind, freshness behaviour, availability probe, and provider contract tests.

The existing `customers.get` capability remains a versioned alias while `customers.profile.get` is introduced. Existing immutable rule versions and `event.normalizedPayload` snapshots are never rewritten. A rule migration creates a new rule version, maps the new canonical envelope into evaluator context, and returns the rule to draft for manager activation. Event/capability aliases have explicit deprecation windows and usage telemetry.

## 14. Worked cross-domain scenarios

### 14.1 Paired truffle tasting

This is the full target scenario after Booking, inventory, and optional workforce phases. The Booking reference phase initially creates and reconciles a human stock-check/preparation Task from the canonical Booking and Experience Requirement; automated available-to-promise and roster-gap decisions arrive only when those projections are implemented.

1. A booking provider confirms a six-person `TRUFFLE_PAIRING` booking.
2. The adapter updates `Booking`, `BookingItem`, and any guest `BookingRequirement` rows.
3. Winery-owned `ExperienceRequirement` specifies truffle quantity per guest, buffer, lead time, and responsible area.
4. `InventoryCommitment` records expected demand for the booking.
5. A fresh `InventoryPosition` or live read supplies available-to-promise stock.
6. `booking.stock_shortfall` and `booking.preparation_deadline` facts are derived deterministically.
7. One rule-bound Task is created for the correct area/assignee and linked directly to the Booking.
8. A party-size change updates the commitment and reconciles the Task rather than creating another.
9. Cancellation releases the commitment and cancels or closes the generated Task according to the rule lifecycle policy.

### 14.2 Wine-club release readiness

1. Upcoming Allocations create dated product demand commitments.
2. On-hand and incoming Inventory Positions are compared by SKU/location.
3. Payment holds and membership skips remove or qualify demand.
4. Shortfalls create one reviewable signal and, when approved by rule policy, assigned replenishment Tasks.
5. Fulfilled allocations link to Sales Orders and Shipments, allowing customer-impact follow-up when delivery fails.

### 14.3 Shipment exception

1. A carrier event updates a Shipment and appends a Tracking Event.
2. Context resolves the Order, Allocation, Customer, promised date, contact preference, and existing work.
3. A rule creates either a staff Notice or customer-resolution Task based on severity and existing work.
4. Delivery or return events reconcile the open work.

### 14.4 Customer lifecycle opportunity

1. A completed `VisitAttendance` links to a Member and later same-day Sales Order through confirmed or evidence-based matching.
2. Lifecycle milestones record first visit and first purchase.
3. Club state and communication consent are read from their authoritative sources.
4. VinAgent may suggest compliant follow-up work, but does not infer consent or mutate club membership automatically.

### 14.5 Roster coverage change

1. A published shift is changed or cancelled.
2. `area.capacity` recomputes required versus scheduled roles for upcoming bookings/events.
3. A genuine coverage gap creates one linked staffing Task; ordinary roster churn creates no noise.

## 15. Data governance, security, and retention

### 15.1 Data classes

| Class | Examples | Handling |
| --- | --- | --- |
| Public winery data | opening hours, public venue details | normal application controls |
| Internal operational | SOPs, stock levels, roster coverage | authenticated and area-aware |
| Customer personal | identity, contact, booking/order history | tenant-scoped, least privilege, retention-controlled |
| Sensitive requirement | dietary, accessibility, complaint details | restricted display, purpose-limited retention |
| Financial summary | totals, payment/refund status | store minimum summary; no card data |
| Credentials/secrets | API keys, refresh tokens, webhook secrets | protected secret reference/encryption; never projection JSON |
| Raw provider evidence | payloads, transcripts, provider extensions | redacted, access-controlled, bounded retention |
| AI/inferred | summaries, risk labels, inferred preferences | labelled, versioned, expiring, evidence-linked |

### 15.2 Retention principles

- Define retention per domain and data class, not one global duration.
- Raw successful payloads should normally have much shorter retention than canonical state and audit metadata.
- Failed/quarantined payloads may need a separate bounded diagnostic window.
- Expire large automation context snapshots or redact sensitive fields while retaining decision evidence.
- Retain only the shipment address detail required for current operations; use region-level facts for long-term analytics where possible.
- Customer deletion/anonymisation must traverse external references, projections, facts, snapshots, and generated work according to the applicable business retention policy.
- Derived facts expire or are superseded when their evidence is deleted, stale, or corrected.
- Preserve non-personal aggregate metrics only when they cannot be used to reconstruct deleted identities.

Exact durations require a product privacy/retention policy and confirmation against each winery's legal and accounting obligations before production rollout.

### 15.3 Tenant and area rules

- Every new row carries `wineryId`, including join and audit tables, for explicit tenant filtering.
- Resolve tenant identity from authenticated or trusted connection context only.
- Canonical data visibility follows its sensitivity and linked operational areas; raw provider data is more restricted than routine projections.
- Area scope never grants access across wineries.
- Counts, search, facts, and AI context apply visibility before aggregation or ranking.
- Connector operations users may need a separate support boundary; ordinary managers must never receive raw secrets.
- Canonical projections and machine Projection Issues are non-collaborative in the first implementation. Human discussion, files, decisions, and audit stay on linked Tasks, Notices, Requests, Notes, or Signals using existing infrastructure; do not create a parallel ungoverned comment/attachment system.

## 16. Booking as the reference implementation

Bookings should prove the complete pattern before other domains are built.

### 16.1 Build sequence

1. Approve the common connection, identity, sync, optional location, authority, and projection metadata contracts.
2. Add the common foundation, durable job/outbox, and canonical-event eligibility path while preserving current JSON/Winery Settings compatibility.
3. Define versioned Booking, Booking Item, Booking Requirement, and Booking Status Event schemas.
4. Define provider-neutral booking event and capability schemas.
5. Add a projector that accepts validated canonical booking input and performs idempotent, out-of-order-safe upserts.
6. Add non-actioning backfill, activation watermark, incremental sync, webhook handling, reconciliation, tombstones, and mapping-issue flows.
7. Expose canonical booking queries and `booking.readiness.v1` using Booking, experience requirements, customer, area, and existing linked work.
8. Move the truffle workflow from raw event paths to a canonical human stock-check/preparation Task; defer automated stock/roster conclusions.
9. Add `AutomationResourceBinding` so changed and cancelled bookings reconcile generated work without overwriting human edits.
10. Validate the same fixtures and outcomes through two meaningfully different provider adapters.

Current position: steps 1-5 are implemented. Step 6 is implemented for hydration, polling,
reconciliation, explicit tombstones, activation, projection issues, and provider-neutral webhook
change-hint recovery. Native OpenTable webhook verification remains pending its real provider contract.
Steps 7-9 are implemented for the provider-neutral feed and first truffle Task, including managed updates,
untouched cancellation, and staff-override annotation. Step 10 now has a versioned adapter boundary, reusable
runner, and two structurally different fixture translators that prove equivalent normalized event/lifecycle
inputs. The registered OpenTable Sync adapter now passes the same corpus and protected onboarding path. Step 10
is not complete until OpenTable is verified with approved pilot access and a second actual provider passes.

### 16.2 Provider selection

Repository/pilot clues select OpenTable/Groove OpenTable as the first implementation. A read-only OpenTable Sync
adapter is now registered with OAuth client credentials, offset pagination, status/time mapping, and explicit
winery-owned experience/add-on/tag mappings. It has not been verified with Sidewood partner access or a real
restaurant ID, so it is not yet a live pilot connection. SevenRooms, Resy, Now Book It, and legacy Tock remain
future provider work. The `vinagent-booking-feed` remains available for an approved gateway/translator.

The second provider should differ structurally in statuses, pagination, add-ons, and webhook behaviour. A canonical Booking contract is not considered stable until both adapters produce equivalent facts and automation outcomes.

### 16.3 Booking exit criteria

- The same booking can be replayed without duplicate projections or work.
- Older events cannot overwrite newer booking state.
- A provider swap does not change rule definitions.
- Customer, location, experience, and requirement ambiguity is explicit and reviewable.
- Booking changes update requirements and linked work.
- Cancellation reconciles untouched generated work and preserves/annotates human-overridden work.
- Historical hydration creates no work unless a manager runs an explicit bounded replay.
- Inventory/roster fields requested before those domains exist return `UNKNOWN`; they are not Phase 2 acceptance dependencies.
- Two provider contract suites pass against the same canonical fixture corpus.
- Backfill and reconciliation metrics are visible and recoverable.
- Sensitive guest requirements do not leak into routine logs or unrestricted context.

## 17. Phased delivery plan

### Phase 0 - Catalogue and governance decisions

Deliverables:

- confirmed pilot connection/account list and provider API access;
- provider-to-capability matrix;
- canonical glossary, status maps, units, money, and time rules;
- source-authority and freshness matrix;
- data classification and retention policy;
- source/canonical event, hydration/replay eligibility, and generated-work reconciliation policies;
- ranked automation/use-case catalogue;
- initial event, capability, and context-pack contracts.

Exit criterion: every stored field has a named operational use, authority, freshness need, and sensitivity class.

### Phase 1 - Connection, identity, sync, and lineage foundation

Implementation state: Batch A1 storage primitives, Batch A2 safety core, dedicated runtime worker/management
surface, protected credential envelopes, and one read-only Booking Feed contract are complete. Canonical
Booking projection, activation watermarks, guarded incremental/reconciliation jobs, and the first context/rule
path plus its `AutomationResourceBinding` Task lifecycle are also implemented. Compatibility backfill, native
inventory, generic change-hint webhooks, and Booking recovery are implemented. Native provider verification,
production cadence, and one-writer cutover remain in progress; none of the phase exit
criteria should yet be treated as satisfied.

Deliverables:

- Integration Connection, Scope, Capability, Sync State, Sync Run, External Resource Reference, Projection Issue, Winery Location, and Operational Resource Link tables;
- Data Authority Policy, durable Integration Job, and Canonical Event Outbox persistence;
- normalised External Resource Observations plus minimum Customer Merge Redirect/retargeting safety;
- conservative compatibility backfill from current winery/area JSON and trusted Retell routing, while preserving derived Winery Settings without inventing authenticated connections;
- transaction-aware source/intake/canonical Integration Event persistence, connection-scoped idempotency, activation watermarks, automation eligibility, and outbox-only canonical dispatch;
- shared connector contracts, outbound HTTP/security policy, schema validation, and telemetry;
- tenant, replay, cursor, tombstone, and out-of-order tests.

Exit criterion: a mock multi-domain provider can synchronize two accounts and two locations without identity collision.

Reusable pagination/authentication/webhook helpers are extracted only after the first pilot adapter exposes a real pattern and the second provider proves it generalises.

### Phase 2 - Booking reference vertical

Deliverables:

- experience requirements, booking projections/history, customer/product/location mapping issues;
- backfill, webhook, polling, and reconciliation pipeline;
- canonical booking capabilities and booking/experience context pack;
- `AutomationResourceBinding` lifecycle for create/change/cancel and human overrides;
- two-provider conformance fixtures and adapters.

Exit criterion: both providers create the same canonical booking/experience preparation Task and reconcile changes correctly without requiring inventory or roster projections.

### Phase 3 - Customer, wine club, and commerce graph

Implementation state: the additive Customer profile foundation, safe Member backfill/merge behavior, canonical
Wine Club shadow graph, and canonical Commerce shadow graph are implemented. Both projectors are
contract-validated, source-ordered, conflict-aware, and deliberately non-actioning. Dual-write/read-through
customer cutover, provider customer/club/commerce adapters, and domain activation/automations remain. The
first evidence-backed Business Entity Link registry and manager review lifecycle are implemented but are not
yet context-pack or automation inputs. Rebuildable shadow customer relationship and per-currency monetary
rollups now retain run-scoped contribution lineage without changing legacy Member fields.

Deliverables:

- multi-source customer references, contact points, consent history, and lifecycle milestones;
- Wine Club Program, Membership, Membership Event, Allocation, and Allocation Item;
- Sales Order, Order Line, Payment Summary Event, and Refund Summary;
- traceable replacements or rollups for current Member spend/order/visit/club flags;
- staged Member contact/address/consent read/write cutover and merge/delete migration;
- minimal evidence-backed `BusinessEntityLink` for optional booking-to-order/lifecycle relationships;
- initial Commerce7/WineDirect/eCellar and POS/commerce contract fixtures based on confirmed pilot needs.

Exit criterion: VinAgent can explain a customer's current relationship and each contributing source without false identity merges.

### Phase 4 - Catalogue, inventory, and demand

Implementation state: exact Product Variant and Stock Location mappings, shadow Inventory Positions,
immutable Snapshots, deterministic Booking demand commitments, and conservative available-to-promise are
implemented. Inventory authority activation, provider translators/schedulers, Wine Club/Sales Order automatic
commitments, and shortage event emission remain.

Deliverables:

- Product Variant, Stock Location, Inventory Position/Snapshot, and Inventory Commitment;
- product/SKU/location mapping workflows;
- available-to-promise and shortage derivations with freshness limits;
- booking and club-release readiness automations, upgrading the truffle workflow from “check stock” to an evidence-backed shortage decision.

Exit criterion: cross-domain demand never reports safe stock when the source observation is stale, missing, or unmapped.

### Phase 5 - Fulfilment and delivery

Implementation state: the additive Shipment/Package/Item/Tracking Event shadow graph, strict fixture contract,
privacy-safe shipment exception context, managed exception-work lifecycle, and manager-installable draft rule
are implemented. Provider translator selection, scheduling/webhook recovery, authority activation, and
non-retroactive live event emission remain.

Deliverables:

- Shipment, Package, Shipment Item, and Tracking Event;
- order/allocation/customer relationships;
- delivery exception context and rule templates;
- initial Australia Post, Shippit, or StarTrack adapter selected by the pilot.

Exit criterion: repeated carrier events produce one current shipment and reconciled customer-impact work.

### Phase 6 - Workforce and communication depth

Implementation state: the additive workforce graph, safe Staff Identity/User boundary, manager-owned
role/skill and Booking demand mappings, strict shift/availability/complete-window projection, freshness-safe
Booking coverage context, and draft managed-gap lifecycle are implemented. Connection-scoped Message
references, immutable delivery history, privacy-bounded manager reads, and strict shadow projection are also
implemented. Workforce/communication provider selection, scheduling/recovery, authority activation, and live
canonical events remain.

Deliverables:

- staff identity links, Roster Shift, availability/leave, and role/skill mappings;
- booking/venue coverage context;
- connection-scoped Message references and delivery history;
- native workforce adapter only if pilot value supports it.

Exit criterion: a roster change creates attention only when it causes a real operational coverage gap.

### Phase 7 - Cross-domain fact and intelligence products

Implementation state: the registered fact catalogue, append-only temporal versions, audited/idempotent
materialization runs, Booking/Shipment/Message materializers, Customer relationship, Club fulfilment, Area
capacity, Booking coverage/readiness, and Shipment exception contexts are implemented. The manager health
view aggregates mapping, freshness, projection-issue, sync, activation, and fact quality by domain. All
semantic products remain privacy-bounded and non-actioning until an approved rule uses an allowlisted read.

Deliverables:

- registered Intelligence Facts and bounded Context Resolver;
- readiness, customer relationship, club fulfilment, shipment exception, and area capacity views;
- evidence-aware facts feeding Automation Rules and Operational Intelligence Signals;
- materialisation/versioning/rebuild tooling;
- data quality, stale-data, and mapping health dashboards.

Exit criterion: every surfaced conclusion can explain its canonical sources, freshness, derivation, and linked work.

### Phase 8 - Governed external commands and future winery domains

Implementation state: common read-side activation readiness and lifecycle controls are implemented for all
non-Booking canonical domains, with Booking retaining its stronger specialised flow. No generic external
write command is registered; this phase remains pending provider selection, credentials, and explicit
business approval.

Deliverables:

- risk-classified command definitions, approvals, idempotency, precondition reads, execution audit, and reconciliation;
- carefully selected booking, customer, club, refund, and fulfilment writes;
- discovery-led expansion into procurement, production, wholesale, marketing, accounting, assets, and compliance.

Exit criterion: no consequential external mutation occurs without the required authority, fresh preconditions, idempotency, and confirmation path.

## 18. Proposed migration batches

No schema migration should attempt the whole model at once.

### Batch A - Common primitives

Implementation is split to keep rollback and review bounded:

- Batch A1 is implemented by `20260818000000-create-integration-data-foundation.js`.
- Batch A2 safety core is implemented by `20260818100000-create-integration-safety-foundation.js`.
- Batch A3 protected credentials are implemented by `20260818200000-create-integration-credentials.js`.
- The Booking reference projection and domain activation watermark are implemented by
  `20260818300000-create-canonical-bookings.js`.
- Managed generated-work bindings are implemented by
  `20260818400000-create-automation-resource-bindings.js`; the truffle Booking Task is the first handler.
- Durable cross-worker provider permits for automatic sync scheduling are implemented by
  `20260818500000-create-integration-sync-scheduler.js`.
- Connection-scoped encrypted webhook endpoints are implemented by
  `20260820600000-create-integration-webhook-endpoints.js`; verified hints use durable dispatch and the shared
  provider permit before Booking recovery reads.
- Projection issue acknowledgement and typed-resolution metadata are implemented by
  `20260820700000-add-projection-issue-review-lifecycle.js`; legacy compatibility mapping decisions are the
  first fail-closed resolver registrations.
- Per-winery/domain configuration authority and rollback metadata are implemented by
  `20260820800000-create-integration-configuration-authorities.js`; Booking is the first registered
  cutover handler and remains deployment-gated.
- Canonical Customer contact/address/consent/milestone storage is implemented by
  `20260820900000-create-canonical-customer-profile.js`; Member remains authoritative during the documented
  staged migration.
- Canonical Wine Club Program/Membership/Event/Allocation/Item shadow storage is implemented by
  `20260821000000-create-canonical-wine-club.js`; projection requires explicit local identity mappings and
  cannot action automations or change the legacy Member club flag.
- Canonical Sales Order/Line/Payment Summary Event/Refund Summary shadow storage is implemented by
  `20260821100000-create-canonical-commerce.js`; payment data is summary-only, customer/product mappings are
  explicit, and projection cannot action automations or update legacy Member spend/order rollups.
- Optional cross-domain Business Entity Links and append-only evidence are implemented by
  `20260821200000-create-business-entity-links.js`; links are tenant-validated, reviewable, merge-safe,
  and remain ineligible for automation until an explicit context resolver is registered.
- Rebuildable Customer relationship/monetary rollups, calculation runs, and contribution lineage are
  implemented by `20260821300000-create-customer-rollups.js`; values remain shadow-unverified,
  per-currency, ambiguity-aware, and non-actioning.
- Exact catalogue/inventory state and manager-reviewed demand translations are implemented by
  `20260821400000-create-canonical-inventory.js` and
  `20260821410000-create-inventory-demand-mappings.js`; availability is freshness-safe and remains
  non-actioning.
- Canonical Shipment/Package/Item/Tracking Event storage is implemented by
  `20260821500000-create-canonical-fulfilment.js`; restricted delivery data is excluded from bounded
  context and shipment exception work remains dormant until separate fulfilment activation.
- Canonical Staff Identity, role/skill, roster, availability, coverage-window, and Booking workforce-demand
  storage is implemented by `20260821600000-create-canonical-workforce.js`; reliable gaps require fresh
  complete-window evidence, and external staff identity cannot grant User or area authority.
- Existing Message storage gains connection-scoped lineage, immutable delivery events, and current delivery
  summaries through `20260821700000-create-canonical-communication-lineage.js`; message content and contact
  data remain outside bounded delivery reads and projection is non-actioning.
- Registered temporal facts and audited materialization runs are implemented by
  `20260821800000-create-intelligence-facts.js`. Context packs, health, activation, and connector conformance
  are service contracts over the additive canonical tables and require no provider credential to test.
- The dedicated worker and bounded management APIs remain disabled by default; the registered Booking Feed v1
  handlers verify access, hydrate typed canonical state without actioning rules, and run guarded incremental
  or reconciliation reads only after domain activation.
- The separately gated Booking scheduler now queues due incremental/reconciliation jobs with provider limits;
  production activation, native-provider pilot verification and provider-specific webhooks, compatibility cutover, lifecycle handlers
  beyond the first Booking Task, and connection cutover remain pending.

- `WineryLocations` (flat/nullable use only)
- `IntegrationConnections`
- `IntegrationConnectionScopes`
- `DataAuthorityPolicySets`
- `DataAuthorityPolicies`
- `DataAuthorityPolicySources`
- `IntegrationConnectionCapabilities`
- `IntegrationSyncStates`
- `IntegrationProviderScheduleStates`
- `IntegrationSyncRuns`
- `IntegrationJobs`
- `ExternalResourceReferences`
- `ExternalResourceObservations`
- `CustomerMergeRedirects`
- `ProjectionIssues`
- `LocationAreaLinks`
- `OperationalResourceLinks`
- additive lineage columns on `IntegrationEvents`
- `CanonicalEventOutbox`

### Batch B - Booking reference

- additive stable `code` and unique index on `WineryBookingTypes`
- `ExperienceRequirements`
- `Bookings`
- `BookingAreaLinks`
- `BookingItems`
- `BookingRequirements`
- `BookingStatusEvents`
- `VisitAttendances`
- `AutomationResourceBindings`

### Batch C - Customer, club, and commerce

- `CustomerContactPoints`
- `CustomerAddresses`
- `CustomerConsents`
- `CustomerLifecycleMilestones`
- `WineClubPrograms`
- `WineClubMemberships`
- `WineClubMembershipEvents`
- `SalesOrders`
- `SalesOrderLines`
- `PaymentSummaryEvents`
- `RefundSummaries`
- `WineClubAllocations`
- `WineClubAllocationItems`
- `BusinessEntityLinks`

### Batch D - Catalogue, stock, and fulfilment

- `ProductVariants`
- `StockLocations`
- `InventoryPositions`
- `InventorySnapshots`
- `InventoryCommitments`
- additive product-variant mapping foreign keys on earlier booking/allocation/order lines
- `Shipments`
- `ShipmentPackages`
- `ShipmentItems`
- `ShipmentTrackingEvents`

### Batch E - Workforce and semantic facts

- `StaffIdentities`
- `RoleSkillDefinitions`
- `StaffRoleSkills`
- `RosterShifts`
- `StaffAvailabilityEvents`
- `WorkforceCoverageObservations`
- `WorkforceDemandMappings`
- `MessageDeliveryEvents`
- `IntelligenceFacts`
- `IntelligenceFactMaterializationRuns`

Each batch is additive, tenant-scoped, indexed for actual access patterns, reversible where practical, tested on MySQL as well as SQLite, and deployed before code begins writing the new tables.

Dependency rules:

```text
WineryLocation -> ConnectionScope / StockLocation / Booking
IntegrationConnection -> Scope / Capability / Sync / ExternalResource / Event
ExternalResourceReference -> optional canonical mapping edge
Booking -> BookingArea / Item / Requirement / Status / VisitAttendance / AutomationBinding
Member + Club Program -> Membership; SalesOrder + Membership -> Allocation with optional salesOrderId
WineryProduct -> ProductVariant -> Inventory and additive line-item mappings
SalesOrder -> Shipment -> Package / Item / TrackingEvent
StaffIdentity -> RosterShift / Availability / RoleSkill
Canonical resources -> IntelligenceFact / OperationalResourceLink
```

Batch B/C records may retain validated product, role, and skill codes with nullable mapping fields. Product Variant and role/skill foreign keys are added only after their target tables exist. Allocation owns the optional `salesOrderId`; Sales Order does not also own an allocation foreign key.

## 19. Connector conformance standard

A provider adapter is complete only when it passes:

- authentication and secret-redaction checks;
- pagination, cursor, rate-limit, retry, and timeout tests;
- canonical schema validation;
- status, timezone, money, quantity, and unit mapping tests;
- duplicate, replay, and out-of-order tests;
- delete/tombstone and missed-webhook reconciliation tests;
- multi-account and multi-location isolation tests;
- sensitive-data redaction and retention checks;
- common fixture equivalence against another provider in the same domain;
- capability availability and stale-data behaviour tests;
- rule outcome equivalence and generated-work lifecycle tests.

Provider-specific values may appear only inside the adapter, source evidence, external references, mapping configuration, or bounded provider extensions. They must not leak into manager rule definitions or canonical status logic.

## 20. Success measures

Architecture measures:

- percentage of projected records with a valid connection-scoped external reference;
- percentage with known area/location/product/customer mappings;
- sync freshness and reconciliation lag by domain;
- duplicate/replay rate and out-of-order rejection rate;
- provider swap contract success.

Intelligence measures:

- rules evaluating from canonical context rather than raw payload paths;
- automation match, unknown, and error rates by missing fact;
- generated-work duplicate, update, and cancellation reconciliation rates;
- percentage of surfaced facts with source, freshness, and derivation explanations;
- reduction in missed preparation, stock shortage, club fulfilment, and shipment exception work.

Product measures:

- time from source exception to responsible staff awareness;
- booking and allocation readiness completion before deadline;
- booking-to-visit, visit-to-purchase, and purchase-to-club visibility;
- customer-impact cases resolved before a repeat contact is required;
- manager acceptance/dismissal rates for signals and generated work.

## 21. Remaining decisions before live provider cutover

1. Obtain the pilot provider accounts, external account/location identifiers, API permissions, and protected
   credentials.
2. Select and prioritise the first real adapters for Club/CRM, Commerce, Inventory, Fulfilment, Workforce,
   and Communication, then add provider-specific conformance fixtures.
3. Confirm the primary/fallback authority connection for each winery domain and scope.
4. Approve domain-specific retention and staff visibility for customer history, restricted requirements,
   delivery details, and workforce availability.
5. Select a reviewed physical-capacity source before area contexts report utilisation.
6. Register each provider scheduler/webhook recovery only after verification, hydration, reconciliation, and
   health review pass.
7. Design and approve each non-Booking legacy compatibility projection/rollback snapshot before selecting
   canonical configuration authority.
8. Approve individual external write commands, their risk class, preconditions, approval path, and
   reconciliation; read activation never implies write authority.

Multi-organisation hierarchy and opaque public-ID format remain future design decisions. Neither blocks the
current winery-scoped canonical graph.

## 22. Final design principle

Store stable operational commitments and relationships locally. Observe volatile conditions with explicit freshness. Preserve the provider and derivation behind every important assertion. Keep typed business projections separate from inferred facts and staff work. Let VinAgent own the cross-system interpretation, coordination, and audit trail while connected applications remain authoritative for their source records.
