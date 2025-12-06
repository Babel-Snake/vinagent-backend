# DOMAIN_MODEL.md

This document defines the core domain entities for the VinAgent backend.

For each entity we define:

* Purpose
* Fields (name, type, notes)
* Relationships
* Privacy/PII notes

This is the source of truth for Sequelize models and for API request/response shapes.

---

## 1. User

### 1.1 Purpose

Represents an authenticated person who can use the VinAgent system (e.g. winery admin, manager).

Authentication is handled by Firebase; the `User` record stores local metadata and role information.

### 1.2 Fields

* `id` (UUID or INT, primary key)
* `firebaseUid` (STRING, unique)
  The UID from Firebase Authentication.
* `email` (STRING)
* `displayName` (STRING, nullable)
* `role` (ENUM: `admin`, `manager`, `staff`)
* `wineryId` (FK → Winery.id, nullable for global admins)
* `createdAt` (DATETIME)
* `updatedAt` (DATETIME)

### 1.3 Relationships

* Many `User` records belong to one `Winery` (except system/global admin users).
* A `User` may be referenced in `TaskAction` as the actor.

### 1.4 Privacy/PII

* `email` is PII and must be handled carefully.
* Should not be logged in full; if needed, prefer partial masking.

---

## 2. Winery

### 2.1 Purpose

Represents a winery using VinAgent.

Includes configuration that affects how messages are handled and how replies are drafted.

### 2.2 Fields

* `id` (UUID or INT, primary key)
* `name` (STRING)
* `region` (STRING, optional)
* `contactEmail` (STRING, optional)
* `contactPhone` (STRING, optional)
* `brandVoiceConfig` (JSON, optional)
  E.g. tone, formality, signature lines.
* `timeZone` (STRING, e.g. `Australia/Adelaide`)
* `createdAt` (DATETIME)
* `updatedAt` (DATETIME)

### 2.3 Relationships

* One `Winery` has many `Users`.
* One `Winery` has many `Members`.
* One `Winery` has many `Messages`.
* One `Winery` has many `Tasks`.

### 2.4 Privacy/PII

* Mostly business data; lower sensitivity than member data but still not for broad logging.

---

## 3. Member

### 3.1 Purpose

Represents a wine club member or customer associated with a winery.

### 3.2 Fields

* `id` (UUID or INT, primary key)
* `wineryId` (FK → Winery.id)
* `firstName` (STRING)
* `lastName` (STRING)
* `email` (STRING, nullable)
* `phone` (STRING, nullable)
* `addressLine1` (STRING, nullable)
* `addressLine2` (STRING, nullable)
* `suburb` (STRING, nullable)
* `state` (STRING, nullable)
* `postcode` (STRING, nullable)
* `country` (STRING, nullable, default `Australia`)
* `notes` (TEXT, nullable)
* `externalRef` (STRING, nullable)
  ID used in external systems (Commerce7, WineDirect, etc.)
* `createdAt` (DATETIME)
* `updatedAt` (DATETIME)

### 3.3 Relationships

* One `Member` belongs to one `Winery`.
* One `Member` has many `Messages`.
* One `Member` has many `Tasks`.
* One `Member` has many `MemberOrder` records (Phase 2+).

### 3.4 Privacy/PII

* Contains PII (address, email, phone).
* Must not be dumped into logs.
* Derived identifiers (e.g. member ID) should be used in logging instead.

---

## 4. Message

### 4.1 Purpose

Represents a normalised communication between a member/customer and the winery.

This may be an SMS, email, or voice-transcribed message.

### 4.2 Fields

* `id` (UUID or INT, primary key)
* `wineryId` (FK → Winery.id)
* `memberId` (FK → Member.id, nullable)
* `source` (ENUM: `sms`, `email`, `voice`)
* `direction` (ENUM: `inbound`, `outbound`)
* `subject` (STRING, nullable)
  Mostly for email.
* `body` (TEXT)
  The main text content (or transcript for voice).
* `rawPayload` (JSON, nullable)
  Raw provider payload (or a safe subset) for debugging; must not contain secrets.
* `externalId` (STRING, nullable)
  Provider-specific message ID (Twilio SID, email provider ID, etc.).
* `receivedAt` (DATETIME, nullable)
  For inbound messages.
* `createdAt` (DATETIME)
* `updatedAt` (DATETIME)

### 4.3 Relationships

* One `Message` belongs to one `Winery`.
* One `Message` may belong to a `Member` (if matched successfully).
* One `Message` may be referenced by one or more `Tasks`.

### 4.4 Privacy/PII

* `body` can contain PII and sensitive information.
* Avoid logging full message content unless necessary; consider truncation or redaction.

---

## 5. Task

### 5.1 Purpose

Represents a unit of work derived from one or more Messages that requires review and/or execution.

Examples: address change, payment issue, tasting booking request, general query.

The Task holds both the **intent** and the **proposed action** (e.g. a drafted reply) that a human can later review and approve.

### 5.2 Fields

* `id` (UUID or INT, primary key)
* `wineryId` (FK → Winery.id)
* `memberId` (FK → Member.id, nullable)
* `messageId` (FK → Message.id, nullable)
* `type` (ENUM, e.g.):

  * `GENERAL_QUERY`
  * `ADDRESS_CHANGE`
  * `PAYMENT_ISSUE`
  * `BOOKING_REQUEST`
  * `DELIVERY_ISSUE`
  * (Extendable later)
* `status` (ENUM):

  * `PENDING_REVIEW`
  * `APPROVED`
  * `AWAITING_MEMBER_ACTION`
  * `REJECTED`
  * `EXECUTED`
  * `CANCELLED`
* `payload` (JSON, nullable)
  Structured data derived from the message, e.g. new address fields, preferred booking time.
* `suggestedChannel` (ENUM: `sms`, `email`, `none`, nullable)
  How the system proposes to respond or deliver the secure action link.
* `suggestedReplySubject` (STRING, nullable)
  Mainly for email; may be null for SMS.
* `suggestedReplyBody` (TEXT, nullable)
  Draft reply content generated by the system (e.g. wording that includes a link).
* `requiresApproval` (BOOLEAN, default `true`)
  Whether this task must be approved by a human before execution.
* `priority` (ENUM or INT, optional)
  E.g. `low`, `normal`, `high`.
* `createdBy` (FK → User.id, nullable)
  Typically null for auto-created tasks.
* `updatedBy` (FK → User.id, nullable)
  Last user who modified this task.
* `createdAt` (DATETIME)
* `updatedAt` (DATETIME)

### 5.3 Relationships

* One `Task` belongs to one `Winery`.
* One `Task` may belong to one `Member`.
* One `Task` may reference one `Message` as its source.
* One `Task` has many `TaskAction` entries.
* One `Task` may have one or more `MemberActionToken` entries (for secure links).

### 5.4 Privacy/PII

* `payload` and `suggestedReplyBody` may contain member data.
* Avoid logging these fields in full; prefer referencing by IDs.

---

## 6. TaskAction

### 6.1 Purpose

Represents an action taken on a Task, forming an audit trail.

Examples: task created, approved, rejected, execution initiated, execution completed, payload updated, note added.

### 6.2 Fields

* `id` (UUID or INT, primary key)
* `taskId` (FK → Task.id)
* `userId` (FK → User.id, nullable)
  Null for automated/system actions.
* `actionType` (ENUM), e.g.:

  * `CREATED`
  * `APPROVED`
  * `REJECTED`
  * `EXECUTION_TRIGGERED`
  * `EXECUTED`
  * `UPDATED_PAYLOAD`
  * `NOTE_ADDED`
* `details` (JSON, nullable)
  Additional metadata about the action (e.g. reason for rejection, token id, final outbound message metadata such as provider, channel, outboundMessageId, truncated body).
* `createdAt` (DATETIME)

### 6.3 Relationships

* One `TaskAction` belongs to one `Task`.
* One `TaskAction` may reference a `User`.

### 6.4 Privacy/PII

* `details` should avoid storing full PII (e.g. full addresses or full message bodies); reference members and messages by ID where possible.

---

## 7. MemberOrder and OrderItem (Phase 2+)

These entities support tracking member purchase history and preferences over time. They are **planned for Phase 2+** and do not need to be implemented in the initial MVP, but are defined here to keep the schema forward-compatible.

### 7.1 MemberOrder (Order)

#### Purpose

Represents a single order placed by a member with a winery (online, cellar door, club shipment, etc.).

#### Fields

* `id` (UUID or INT, primary key)
* `wineryId` (FK → Winery.id)
* `memberId` (FK → Member.id)
* `externalOrderId` (STRING, nullable)
  ID from external systems (e.g. Commerce7, WineDirect).
* `orderDate` (DATETIME)
* `totalAmount` (DECIMAL)
* `currency` (STRING, default `AUD`)
* `channel` (ENUM: e.g. `cellar_door`, `online`, `club_shipment`, `other`)
* `notes` (TEXT, nullable)
* `createdAt` (DATETIME)
* `updatedAt` (DATETIME)

#### Relationships

* One `MemberOrder` belongs to one `Winery`.
* One `MemberOrder` belongs to one `Member`.
* One `MemberOrder` has many `OrderItem` rows.

#### Privacy/PII

* Contains transaction data tied to a member.
* Log using IDs and high-level descriptors, not full contents.

---

### 7.2 OrderItem

#### Purpose

Represents an individual line item within an order (e.g. a specific wine SKU).

#### Fields

* `id` (UUID or INT, primary key)
* `orderId` (FK → MemberOrder.id)
* `sku` (STRING, nullable)
* `name` (STRING)
* `varietal` (STRING, nullable)
* `vintage` (STRING or INT, nullable)
* `quantity` (INT)
* `unitPrice` (DECIMAL)
* `totalPrice` (DECIMAL)
* `createdAt` (DATETIME)
* `updatedAt` (DATETIME)

#### Relationships

* One `OrderItem` belongs to one `MemberOrder`.

#### Privacy/PII

* Product-level data only; low sensitivity, but still tied to a member indirectly through the order.

---

## 8. MemberActionToken (Phase 1+)

### 8.1 Purpose

Represents a secure, single-use token that allows a member to complete a specific action (e.g. confirm an address change) via a link or flow delivered over SMS, email, or voice.

This supports the pattern:

* Staff/AI create and approve a Task.
* System sends a secure link or action flow to the member.
* Member completes the action themselves.
* System validates the token and applies the change.

### 8.2 Fields

* `id` (UUID or INT, primary key)
* `memberId` (FK → Member.id)
* `wineryId` (FK → Winery.id)
* `taskId` (FK → Task.id, nullable but recommended)
* `type` (ENUM), e.g.:

  * `ADDRESS_CHANGE`
  * (Future: `PAYMENT_METHOD_UPDATE`, `PREFERENCE_UPDATE`, etc.)
* `channel` (ENUM: `sms`, `email`, `voice`)
  How the link or token is delivered/used.
* `token` (STRING, unique, opaque)
  Random, unguessable value used in URLs or voice flows.
* `target` (STRING, nullable)
  Where the link/token was sent (e.g. phone number, email address) or identifier for a voice flow.
* `payload` (JSON, nullable)
  Optional extra context (e.g. parsed candidate address).
* `expiresAt` (DATETIME)
* `usedAt` (DATETIME, nullable)
* `createdAt` (DATETIME)
* `updatedAt` (DATETIME)

### 8.3 Relationships

* One `MemberActionToken` belongs to one `Member`.
* One `MemberActionToken` belongs to one `Winery`.
* One `MemberActionToken` may reference one `Task`.

### 8.4 Privacy/PII

* Do not log raw `token` values.
* Log only the `id` or high-level context (e.g. `{ memberId, taskId, type }`).
* `payload` should avoid full PII where possible; reference IDs instead.

---

## 9. (Optional) MessageMetadata / IntegrationConfig (Future)

These are optional future entities, noted here for forward compatibility.

### 9.1 MessageMetadata (future)

**Purpose:** Store derived attributes from messages (sentiment, detected entities, etc.) without bloating the main `Message` table.

Fields (tentative):

* `id`, `messageId`, `sentiment`, `tags` (JSON), etc.

### 9.2 IntegrationConfig (future)

**Purpose:** Store provider-specific configuration for each winery.

Fields (tentative):

* `id`, `wineryId`, `provider` (e.g. `twilio`), `config` (JSON).

---

## 10. Task Type and Status Reference

To keep enum usage consistent across the system.

### 10.1 Task Types (initial set)

* `GENERAL_QUERY`
* `ADDRESS_CHANGE`
* `PAYMENT_ISSUE`
* `BOOKING_REQUEST`
* `DELIVERY_ISSUE`

These can be expanded as new flows are added.

### 10.2 Task Statuses

* `PENDING_REVIEW` – Task created, waiting for human review.
* `APPROVED` – Approved by a user; ready to trigger member-facing action (e.g. secure link).
* `AWAITING_MEMBER_ACTION` – Member-facing link/flow sent; waiting for the member to complete the action.
* `REJECTED` – Rejected; no execution will occur.
* `EXECUTED` – Action completed successfully (e.g. member confirmed change and data updated).
* `CANCELLED` – No longer relevant.

---

## 11. ID Strategy

For simplicity, the initial implementation can use auto-increment INTs as primary keys. If needed, this can later be migrated to UUIDs.

Key points:

* Primary keys must be stable and never reused.
* Foreign key relationships should be enforced via Sequelize associations and migrations.

---

## 12. Logging Guidance by Entity

When logging events related to domain entities:

* Prefer logging IDs and high-level descriptors over full objects.
* Example log context:
  `{ taskId, wineryId, memberId, actionType }`
* Avoid logging:

  * Full `Member` objects
  * Full `Message.body`
  * Full `payload` with addresses
  * Raw `MemberActionToken.token` values

This DOMAIN_MODEL is the canonical reference for Sequelize models and for data schemas referenced in API_SPEC and TEST_PLAN.

Any change to core fields or relationships should be reflected here first, then propagated to models, migrations, tests, and API docs.
