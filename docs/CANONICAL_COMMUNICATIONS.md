# Canonical Communication Lineage and Delivery History

Status: additive provider-neutral Message lineage and immutable delivery history implemented; native provider
translators, communication authority activation, live canonical events, and delivery-failure automation remain
disabled

Last reviewed: 2026-08-20

## Purpose

VinAgent already uses Message as the authoritative SMS, email, and voice-linked communication record. The
communication slice deliberately keeps that store and adds the missing provider-neutral evidence:

- one local Message can have references from several provider accounts or systems;
- each provider message identifier is unique only inside its Integration Connection;
- delivery events form an immutable, idempotent timeline;
- Message carries a convenient current canonical delivery summary; and
- manager reads expose operational delivery evidence without exposing message content or contact details.

Migration 20260821700000-create-canonical-communication-lineage.js adds nullable lineage and current-delivery
columns to Messages and creates MessageDeliveryEvents. It does not copy or replace existing Messages.

## Connection-scoped identity

ExternalResourceReference remains the authoritative mapping edge. A communication reference uses resource and
canonical type MESSAGE and the unique tuple:

    Integration Connection + MESSAGE + external message ID

The optional Message.primarySourceReferenceId is only a convenient pointer to the first resolved source. Other
connections can map to the same Message without replacing that pointer. A provider identifier cannot be
silently reassigned to a different local Message; the reference becomes ambiguous and a blocking
CONNECTION_MAPPING_AMBIGUOUS projection issue is created.

This is essential when a delivery provider, mailbox, telephony provider, or replacement system each has a
different identifier for the same operational communication.

## Projection contract

Provider fixtures and future native translators emit message-delivery-shadow.v1. The contract requires:

- an active same-winery COMMUNICATION connection scope;
- one explicit same-winery Message ID;
- channel and direction that exactly match the Message;
- a connection-scoped external message ID;
- source revision, provider update time, and observation time; and
- one or more bounded delivery events.

Each event has a stable provider event key, canonical status, optional bounded provider status code, occurrence
time, canonical failure category, and small metadata object. Credentials, contact/address fields, subject/body
content, transcripts, recordings, payment data, and other sensitive keys are rejected recursively from
provider extensions and event metadata.

Projection is shadow-only and always returns automationEligible false.

## Immutable event and current-state rules

MessageDeliveryEvent is append-only. Its identity is source reference plus event key, so identical event keys
from two provider accounts cannot collide. Replaying identical evidence is a no-op. Reusing the same key with
different content creates a blocking SOURCE_CONFLICT issue and preserves the original evidence.

Legitimate late history is accepted even when its source update time predates the newest reference state.
Current Message delivery status is recalculated from the most recent event across every resolved source and
therefore cannot regress when an older event arrives. A deterministic status precedence resolves equal
timestamps.

Canonical statuses include received, queue/accept/send states, delivered/read/completed, transient deferred,
terminal bounced/failed/undeliverable, and unknown. Failure states require one explicit allowlisted failure
category; non-failure states require NONE.

## Manager API

Both routes require manager/admin access and are winery-scoped:

- GET /api/integration-management/message-deliveries
- GET /api/integration-management/messages/:messageId/delivery-history

The event list supports message, connection, status, failure category, failure-only, date-window, and bounded
pagination filters. The history response returns Message identity, channel/direction, customer/task IDs,
current delivery summary, and ordered events with bounded connection lineage.

Neither route returns Message subject, body, raw payload, legacy external ID, source hash, recipient address,
email address, or phone number.

## Relationship to existing ingestion

Existing webhook and outbound-notification flows continue creating Message rows as before. The projection is
an adapter-facing seam for attaching verified provider lineage and delivery evidence after a normalized
Message exists. A later provider adapter may perform this immediately after Message creation, but it must not
create a second canonical message store.

Inbound receipt, outbound send, and call records can converge on this model. A separate Conversation/Thread
projection is not justified until a real provider requires threads that exist independently from Tasks.

## Activation boundary

The schema, strict projection, idempotency, conflict handling, current-state calculation, and manager APIs can
be fully exercised with fixtures and no real credentials. Before delivery events can autonomously create
work, a separate activation slice must add:

1. native provider translators and conformance fixtures;
2. polling/webhook recovery and reconciliation ownership;
3. communication authority/readiness preview and a non-retroactive activation watermark;
4. canonical message.delivery_failed emission after activation only;
5. a bounded delivery-failure context and manager-installed draft rule/lifecycle; and
6. mapping/freshness/conflict health reporting.

No communication projection currently sends a message, changes a provider, emits an automation-eligible
event, or creates a Task or Notice.
