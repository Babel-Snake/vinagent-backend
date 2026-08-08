# Integration Intake Foundation

VinAgent now has a generic inbound integration event layer for operational signals that originate outside the app. The goal is to keep provider-specific parsing separate from VinAgent's core notice, task, attachment, and comment systems.

## Goals

- Receive third-party operational signals without coupling the app to one vendor.
- Store the raw event for audit/debugging.
- Create a normalized payload for review and downstream processing.
- Let managers decide whether an event becomes one or many Tasks, Notices, Requests, or Notes, an ignored item, or an archived item.
- Reuse existing notices, tasks, comments, notice-task links, and attachments.

## Data Model

`IntegrationEvent` stores the intake record:

- `provider`: source system label such as `deputy`, `retell`, `vapi`, `voice-agent`, `zapier`, or `manual`.
- `intakeMethod`: `webhook`, `api`, `automation`, `email`, `manual`, `import`, or `provider_adapter`.
- `eventType`: normalized event family, currently `call.intake`, `notice.imported`, `task.suggested`, `message.imported`, `file.imported`, or `unknown.received`.
- `externalEventId`: provider ID used for idempotency when available.
- `rawPayload`: redacted original payload.
- `normalizedPayload`: provider-agnostic internal shape.
- `status`: `RECEIVED`, `PENDING_REVIEW`, `PROCESSED`, `IGNORED`, `ARCHIVED`, `FAILED`, etc.
- `IntegrationEventItem`: one link per created or linked Task, Notice, Request, or Note, including a stable item key and `CREATED | LINKED` provenance.
- `relatedRecordType` / `relatedRecordId`: compatibility pointer to the first linked result.
- `suggestedAreaId`, `areaConfidence`, and `areaMappingSource`: optional provider/rule/AI placement suggestion.
- `confirmedAreaId`: manager-confirmed placement used when creating a task or notice.

Imported notices now also have source metadata:

- `externalSource`
- `externalId`
- `externalPostedAt`
- `externalAuthorName`
- `sourceEventId`

## API

All event review APIs are dashboard-authenticated and manager/admin only.

### `GET /api/integration-events`

Lists events for the authenticated winery.

Supported filters:

- `status`
- `eventType`
- `provider`
- `search`
- `page`
- `pageSize`

### `POST /api/integration-events`

Creates an intake event. This is currently the safe authenticated intake path for manual import, admin testing, and automation handoff.

Example notice import:

```json
{
  "provider": "deputy",
  "intakeMethod": "manual",
  "eventType": "notice.imported",
  "externalEventId": "notice-123",
  "rawPayload": {
    "title": "Saturday roster changed",
    "message": "Please check your updated shift.",
    "posted_by": "Ops Manager"
  }
}
```

Example call intake:

```json
{
  "provider": "voice-agent",
  "intakeMethod": "webhook",
  "eventType": "call.intake",
  "externalEventId": "call-123",
  "rawPayload": {
    "callerName": "Sarah Booker",
    "callerPhone": "+61400111222",
    "summary": "Sarah wants to book a tasting for six this Saturday.",
    "intent": "booking enquiry",
    "recommendedAction": "Call Sarah back to confirm availability."
  }
}
```

If `provider + externalEventId` already exists for the winery, the API returns the existing event with `duplicate: true`.

### `POST /api/integration-events/:id/review`

Applies a manager review action.

Supported actions:

- `publish_notice`: creates a VinAgent notice from `notice.imported` data and optionally links tasks via `taskIds`.
- `create_task`: creates a draft task from a call intake or generic event.
- `link_task`: marks the event processed and links it to an existing task via `taskId`.
- `create_items`: atomically creates or links up to ten Tasks, Notices, Requests, and Notes. A failed item rolls back the entire batch; replay returns the existing links.
- `ignore`: marks the event ignored.
- `archive`: marks the event archived.

### `POST /api/webhooks/integration/:wineryId/:domain`

Creates an intake event from a signed public webhook. Configure the shared secret from Winery -> Integrations for the relevant domain, then send:

- `x-vinagent-webhook-secret`: the configured shared secret
- `x-vinagent-webhook-timestamp`: the current Unix timestamp in seconds; timestamps more than five minutes from server time are rejected
- `x-vinagent-webhook-signature`: HMAC-SHA256 of `<timestamp>.<exact raw request body>` using that same secret, formatted as either `<hex>` or `sha256=<hex>`

The webhook accepts either a wrapped payload:

```json
{
  "provider": "zapier",
  "eventType": "notice.imported",
  "externalEventId": "zapier-notice-1",
  "rawPayload": {
    "title": "Distributor pickup changed",
    "body": "Pickup moved to Friday morning."
  }
}
```

or a direct payload with top-level `eventType` fields. Every webhook must supply a stable `externalEventId`. For adapter compatibility, `external_id`, `eventId`, or `id` at the top level, and `id`, `eventId`, or `externalEventId` inside `rawPayload`, are also normalized to that field. This keeps retries idempotent after the five-minute signature window. Events still land in `PENDING_REVIEW` and must be reviewed by a manager before they become notices or tasks.

### `POST /api/webhooks/integration/:wineryId/:domain/:areaId`

Uses the selected area's booking, POS, CRM, or delivery connection and its independent signing secret. The area must be active and belong to the winery. Accepted events receive `suggestedAreaId = areaId`, `areaConfidence = 1`, and `areaMappingSource = RULE`, but still pass through the normal manager review queue before conversion.

## Manager Review UI

Managers and admins can review intake events from `/integration-events` in the dashboard. The page supports:

- filtering by status, event type, provider, and search text
- creating a manual intake event from a JSON payload
- inspecting raw and normalized payloads before action
- publishing imported notices with category, priority, pinning, and task links
- creating external phone tasks from call intake summaries
- creating multiple typed operational items in a single atomic review
- opening every object created or linked by an event
- linking an event to an existing task, ignoring it, or archiving it
- filtering by operational area and confirming primary/linked areas before conversion

## Normalized Event Types

### `notice.imported`

Normalized shape:

```json
{
  "provider": "deputy",
  "title": "Saturday roster changed",
  "body": "Please check your updated shift.",
  "category": "STAFF",
  "priority": "normal",
  "postedAt": "2026-06-10T23:30:00.000Z",
  "externalAuthorName": "Ops Manager",
  "externalNoticeId": "notice-123",
  "sourceLabel": "deputy",
  "metadata": {
    "attachments": []
  }
}
```

Publishing creates a normal `Notice`, so existing comments, files, archiving, audience visibility, task links, and noticeboard UI continue to work.

### `call.intake`

Normalized shape:

```json
{
  "provider": "voice-agent",
  "callerName": "Sarah Booker",
  "callerPhone": "+61400111222",
  "callTime": "2026-06-11T02:00:00.000Z",
  "durationSeconds": 185,
  "summary": "Sarah wants to book a tasting for six this Saturday.",
  "transcript": "Full transcript if available",
  "recordingUrl": "https://example.com/recording/call-123",
  "category": "booking_enquiry",
  "urgency": "normal",
  "recommendedAction": "Call Sarah back to confirm availability.",
  "externalCallId": "call-123"
}
```

Creating a task produces an external phone task with:

- `taskOrigin: EXTERNAL`
- `inboundMethod: phone`
- requester name/phone in `payload.manualIntake`
- call details in `payload.callIntake`
- draft workflow steps for review and follow-up

## Retell Adapter

Retell is the first real provider proof for this pipeline. Retell-specific parsing lives in `src/services/integrations/inbound/providers/retell.js`; the rest of VinAgent still works with generic `IntegrationEvent` records.

Recommended Retell webhook URL:

```text
/api/webhooks/retell
```

Behavior:

- Retell verification uses `x-retell-signature: v=<unix-ms>,d=<hex-digest>` and `RETELL_API_KEY` (with `RETELL_WEBHOOK_SECRET` retained only as a legacy environment-name fallback).
- the digest covers the exact raw body followed by the timestamp; signatures outside the five-minute freshness window are rejected.
- `call_analyzed` callbacks become `call.intake` events in `PENDING_REVIEW`.
- transient callbacks such as `call_started` are acknowledged but skipped to avoid review queue noise.
- Retell retries are deduplicated by `call_id + retell event`.
- managers review the event from `/integration-events` and can create a normal external phone task.

### Operations-managed tenant mapping

Retell tenant routing is deliberately not configurable through the ordinary winery or area-manager integration API. Operations must add a dedicated `retell` entry directly through controlled admin tooling, a reviewed seed, or a migration in either `WineryIntegrationConfig.providerConnections` or `OperationalAreaIntegrationConfig.providerConnections`:

```json
{
  "retell": {
    "provider": "retell",
    "externalLocationId": "agent_...",
    "externalAccountId": "optional-retell-account-id"
  }
}
```

Accepted routing fields:

- the connection key must be exactly `retell` and `provider` must be `retell`;
- `externalLocationId` is the exact, case-sensitive Retell agent ID and is required for standard Retell call webhooks;
- `externalAccountId` is an optional additional boundary when Retell supplies a signed `account_id` field. Metadata account IDs are never trusted for routing.

Before enabling a Retell agent, verify its ID maps to exactly one winery across winery-level and area-level configs. Multiple matching records belonging to the same winery are safe; no match or matches across different wineries fail closed. Winery IDs in the URL, query string, webhook body, call metadata, or dynamic variables are ignored. The removed `/api/webhooks/retell/:wineryId` route returns `404`.

## Provider Adapter Rule

Provider-specific code should only translate provider fields into normalized payloads. The rest of the app should act on `IntegrationEvent` and normalized event types.

Recommended future adapter locations:

- `src/services/integrations/inbound/normalizers.js` for generic mapping helpers.
- `src/services/integrations/inbound/providers/<provider>.js` for provider-specific parsing once a provider has enough unique behavior.

## Rollout Plan

1. Use authenticated `POST /api/integration-events` for manual imports and low-risk automation.
2. Add a manager review UI over `/api/integration-events`.
3. Add a signed generic webhook endpoint with per-winery/domain shared secret handling.
4. Move Retell `call_analyzed` callbacks onto the event pipeline as the first real provider proof.
5. Add provider-specific adapters for Vapi, Deputy, Zapier/Make, and email-forwarded notices as needed.
6. Move existing Twilio voice/SMS paths onto the event pipeline where review-before-action makes sense.

## Security Notes

- Raw payloads are redacted for obvious secret/token fields before persistence.
- Review APIs are manager/admin-only.
- Event deduplication uses `provider + externalEventId + wineryId`.
- Call transcripts and imported staff notices should remain behind authenticated dashboard APIs.
- Public generic integration webhooks require the configured shared secret, a fresh Unix timestamp, and an HMAC signature over `<timestamp>.<raw body>`.
- Generic webhook events require a stable external event ID and are durably deduplicated by `wineryId + provider + externalEventId`.
- Raw webhook secrets are never returned by dashboard APIs; the app stores a SHA-256 hash and derives `webhookSigningConfigured` from that hash.
