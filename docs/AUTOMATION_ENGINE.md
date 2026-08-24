# Tool-Agnostic Automation Engine

## Objective

The automation engine turns normalized facts from connected applications into manager-approved operational actions without coupling rules to a provider.

The boundary is capability-based:

```text
provider event -> provider adapter -> canonical IntegrationEvent
                                      |
                                      v
manager-approved AutomationRule -> optional read capabilities -> deterministic conditions
                                      |
                                      v
                              Task or Notice action
```

A rule uses `booking.confirmed`, `shipment.exception`, or another canonical event name. Enrichment steps use capabilities such as `bookings.availability.check`; they never name SevenRooms, Commerce7, or Australia Post. The capability handler resolves the active winery or area connection.

## Implemented foundation

The first backend slice includes:

- immutable `AutomationRuleVersion` definitions and draft/active/paused rule lifecycle;
- `AutomationRun` idempotency by rule and source key;
- per-capability `AutomationRunStep` input, output, failure, and timing history;
- canonical dotted integration event names beyond the original fixed event list;
- automatic evaluation of active rules after a new `IntegrationEvent` is committed;
- deterministic `all`, `any`, and `not` condition trees with explicit `MATCHED`, `NOT_MATCHED`, and `UNKNOWN` results;
- allowlisted comparison, existence, date, and relative-time operators;
- typed `{{event...}}`, `{{context...}}`, and `{{rule...}}` templates;
- relative action timing, such as a Task due 2,880 minutes before a booking start;
- read-only capability enforcement for unattended enrichment;
- transactional Task/Notice creation, source-event links, assignment notification, and automation provenance;
- rule previews that fetch context and show the proposed action without creating it;
- manager-only rule, capability, and run APIs.

Changing a definition or its area scope creates a new version and returns the rule to `DRAFT`. A manager must explicitly reactivate it.

## Rule definition

```json
{
  "trigger": {
    "eventType": "booking.confirmed",
    "providers": ["sevenrooms"]
  },
  "enrichments": [
    {
      "key": "availability",
      "capability": "bookings.availability.check",
      "required": true,
      "input": {
        "date": "{{event.normalizedPayload.date}}",
        "time": "{{event.normalizedPayload.time}}",
        "pax": "{{event.normalizedPayload.guests}}"
      }
    }
  ],
  "conditions": {
    "all": [
      {
        "path": "event.normalizedPayload.experienceCode",
        "operator": "EQ",
        "value": "TRUFFLE_PAIRING"
      },
      {
        "path": "context.availability.available",
        "operator": "EQ",
        "value": true
      }
    ]
  },
  "action": {
    "type": "TASK",
    "data": {
      "category": "OPERATIONS",
      "subType": "OPERATIONS_SUPPLY_REQUEST",
      "priority": "high",
      "assigneeId": 42,
      "suggestedAction": "Check truffle stock for {{event.normalizedPayload.bookingReference}}."
    },
    "timing": {
      "dueAt": {
        "path": "event.normalizedPayload.startAt",
        "offsetMinutes": -2880
      }
    }
  },
  "onUnknown": "SKIP"
}
```

### Conditions

Supported group operators are `all`, `any`, and `not`.

Supported leaf operators are:

- `EQ`, `NOT_EQ`, `IN`, `NOT_IN`, and `CONTAINS`;
- `GT`, `GTE`, `LT`, and `LTE`;
- `EXISTS` and `NOT_EXISTS`;
- `BEFORE`, `AFTER`, `WITHIN_NEXT_MINUTES`, and `OLDER_THAN_MINUTES`.

A missing value is `UNKNOWN` for comparisons. It is not silently treated as false. `onUnknown` controls whether the run is safely skipped or failed. A failed required enrichment also forces an unknown result even when the condition tree does not directly read its output.

### Actions

The initial unattended actions are `TASK` and `NOTICE`. They reuse the authoritative domain services so normal tenant checks, assignments, areas, notifications, audit records, and feeds remain intact.

External write tools are deliberately excluded from enrichment. A future external-action policy must distinguish:

- automatic read access;
- manager-approved internal record creation;
- externally mutating operations that require their own approval and risk policy.

## APIs

All automation endpoints require a winery manager or admin.

- `GET /api/automations/capabilities`
- `GET /api/automations/rules`
- `POST /api/automations/rules`
- `GET /api/automations/rules/:id`
- `PATCH /api/automations/rules/:id`
- `PATCH /api/automations/rules/:id/status`
- `POST /api/automations/rules/:id/preview`
- `POST /api/automations/rules/:id/execute`
- `GET /api/automations/runs`
- `GET /api/automations/runs/:id`

Preview and manual execution accept either an existing `sourceEventId` or a provider-neutral `sampleEvent`. Executing a sample event also requires a stable `sourceKey`; event-backed execution derives `integration-event:<id>`.

## Capability registry

Capabilities are registered with:

- a stable provider-neutral name;
- a description and `READ`/`WRITE` kind;
- Joi input and optional output schemas;
- an availability probe;
- a handler that receives winery, area, input, and transaction context.

Only `READ` capabilities can run as enrichments. The initial registered capabilities are:

- `bookings.availability.check`;
- `customers.get`.

They currently resolve through the existing booking and CRM write/execution factories. Mock adapters work in
tests and explicitly enabled development environments; the read-only OpenTable Sync connector does not satisfy
those write capabilities, so production-readiness checks still correctly report that live booking and CRM
execution adapters are unavailable.

## Delivery plan

The canonical projection, identity, synchronization, fact, and connector design for the phases below is specified in `docs/WINERY_INTELLIGENCE_DATA_ARCHITECTURE.md`.

### Phase 1: Foundation — implemented

- Rule, version, run, and step persistence.
- Deterministic evaluator and templates.
- Capability registry and initial factory-backed reads.
- Task/Notice actions.
- Integration-event trigger wiring.
- Manager APIs, tests, and audit history.

### Phase 2: Canonical operational contracts

- Versioned schemas for booking, wine-club membership/allocation, order, inventory, shipment, roster, and customer events.
- Canonical entity references separate from provider event IDs.
- Connector contract tests proving that two providers produce equivalent facts and capability results.
- Sensitive-field classification and per-capability snapshot/redaction policy.

### Phase 3: Live connector SDK and adapters

- A connector manifest that can expose multiple domains from one app, such as CRM, wine club, orders, and inventory from Commerce7.
- Webhook verification, cursor-based polling, rate limits, retry/backoff, and connection health.
- Initial live booking, wine-club/CRM, and shipment providers selected from the pilot winery's actual systems.
- Provider-swap tests showing unchanged rules across adapters.

### Phase 4: Scheduled and lifecycle automation

- Durable queue/worker execution rather than API-process-only scheduling.
- Scheduled queries for conditions that may become true without a new event.
- Reconciliation for missed webhooks and stale provider state.
- Update/cancellation policies for open generated Tasks and Notices.
- Lease/leader controls for multi-instance deployments and recovery for interrupted runs.

### Phase 5: Manager rule builder

- Guided trigger, context, condition, action, recipient, and timing forms.
- Capability-aware authoring that shows unavailable dependencies before activation.
- Historical preview, match counts, sample records, and estimated noise.
- Templates for high-value winery cases.
- Run history, failure triage, pause, clone, and version comparison.

### Phase 6: AI-assisted authoring and governed external actions

- Natural-language rule drafting compiled into the structured definition for manager confirmation.
- AI explanation of proposed matches and missing context without replacing deterministic runtime evaluation.
- Explicit risk classes and approval gates for booking changes, refunds, membership changes, shipment mutations, and other provider writes.

## Operational constraints

- Tool-agnostic does not mean connector-free. Each provider must implement and pass the same capability and event contracts.
- Rules should request bounded context rather than query every connected application.
- Provider outages produce unknown context, never fabricated negative results.
- A unique rule/source key prevents duplicate actions on webhook replay.
- The first slice is event-driven. Durable schedules, booking updates, cancellation reconciliation, and live provider adapters remain subsequent phases.
