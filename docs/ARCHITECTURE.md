# ARCHITECTURE.md

This document describes the high-level architecture of the VinAgent backend. It is designed so that a new developer or an AI coding agent can quickly understand how the system fits together, how data flows, and where new code should live.

The focus here is conceptual structure, not low-level implementation details.

## 1. System Overview

VinAgent is a backend service that:

* Receives inbound messages from external systems (SMS, email, voice)
* Interprets those messages to understand intent
* Creates structured Tasks in a database
* Allows human managers to review and approve those Tasks
* Executes safe operations (e.g. update address, send confirmations)

At a high level, the system consists of:

* **HTTP API Layer** (Express)
* **Authentication & Authorization** (Firebase Auth)
* **Message Ingestion Layer** (Webhooks)
* **Triage Engine** (Intent + Task creation)
* **Task Management** (Queue + Status changes)
* **Execution Layer** (safe DB updates + outbound messages)
* **Database** (MySQL via Sequelize)
* **Logging & Observability**
* **External Integrations** (Twilio, Retell, etc.)

## 2. High-Level Data Flow

A typical end-to-end flow looks like this:

1. **Customer sends a message**
    * Example: SMS saying "Hi, I need to update my address".
2. **External provider forwards to VinAgent**
    * Twilio sends an HTTP POST to `/webhooks/sms` with message details.
3. **API Layer receives the request**
    * Express route handler parses the payload.
    * Basic validation is performed.
4. **Message Ingestion Layer normalises the message**
    * Maps raw provider payload to an internal `Message` model.
    * Links the message to a `Member` and `Winery` when possible.
5. **Triage Engine processes the message**
    * Uses rules and/or AI to detect intent (e.g. `ADDRESS_CHANGE`).
    * Creates a new `Task` with:
        * Type
        * Status (e.g. `PENDING_REVIEW`)
        * References to Member, Winery, and Message.
6. **Manager reviews Tasks via Dashboard or API**
    * Frontend (later) calls `GET /tasks`.
    * Manager decides to approve, edit, or reject.
7. **Execution Layer performs the action**
    * On approval, the system:
        * Applies safe changes in the database (e.g. update address).
        * Generates outbound communication (SMS/email reply).
8. **Logging & Auditing**
    * All steps are logged through the shared logger.
    * Task status transitions are recorded for audit.

This architecture ensures that **AI suggestions always pass through a human-review gate** before any real-world changes occur.

## 3. Backend Service Layout

The backend is a single Node.js/Express application, structured into clear layers:

* **Routes** – Define URL endpoints and map them to controllers.
* **Controllers** – Handle HTTP specifics (request/response), input validation, error translation.
* **Services** – Contain business logic (triage, task creation, execution rules).
* **Models** – Sequelize models that define database tables and relationships.
* **Middleware** – Shared Express middleware (auth, logging, error handlers).
* **Utils** – Pure functions and helpers (parsers, formatters, etc.).

Planned directory layout under `/src`:

```text
/src
  /config        # Configuration (DB, logger, environment)
  /routes        # Route definitions
  /controllers   # HTTP controllers
  /services      # Business logic
  /models        # Sequelize models + index
  /middleware    # Express middleware
  /utils         # Helpers and pure functions
  /tests         # Test files (may mirror src structure)
```

Controllers should be kept thin; services should hold the core logic.

## 4. Core Components

### 4.1 Authentication & Authorization

* **Technology:** Firebase Authentication
* **Purpose:** Verify user identity and assign roles (e.g. admin, manager).

**Flow:**

1. Incoming API requests carry a Firebase ID token (e.g. in Authorization header).
2. A middleware verifies the token with Firebase.
3. The decoded user info is attached to the request context.
4. Authorization checks occur in controllers/services as needed.

The backend does not manage passwords directly; it trusts Firebase as the identity provider.

### 4.2 Message Ingestion Layer

**Endpoints (examples):**

* `POST /webhooks/sms` – for SMS from Twilio or similar.
* `POST /webhooks/email` – for email via provider.
* `POST /webhooks/voice` – for call events from Twilio/Retell.

**Responsibilities:**

* Validate incoming payloads.
* Normalise provider-specific data into an internal `Message` shape.
* Store `Message` in DB.
* Trigger the Triage Engine.

This layer should not contain business logic beyond simple validation and mapping.

### 4.3 Triage Engine

The Triage Engine is responsible for deciding "what this message is about".

**Inputs:**
* Normalised `Message` object
* Optional member/winery context

**Outputs:**
* A `Task` object created in the database, with:
    * `type` (e.g. `ADDRESS_CHANGE`, `PAYMENT_ISSUE`, `BOOKING_REQUEST`, `GENERAL_QUERY`)
    * `status` (e.g. `PENDING_REVIEW`)
    * `payload` (structured details extracted from the message)

**Implementation details:**
* Initially: simple rule-based logic (e.g. keyword matching) for MVP.
* Later: AI-based classification using OpenAI.

The engine itself is encapsulated in a service module so it can be easily replaced or extended.

### 4.4 Task Management

Tasks are central to VinAgent.

**Responsibilities:**

* Create Tasks when triage detects an actionable intent.
* Expose APIs for listing, filtering, and viewing Tasks.
* Track status transitions (e.g. `PENDING_REVIEW` → `APPROVED` → `EXECUTED`).
* Record who approved or rejected actions.

**Example endpoints:**

* `GET /tasks` – list tasks for a winery.
* `GET /tasks/:id` – get a single task.
* `PATCH /tasks/:id` – approve, reject, or modify a task.

Status transitions and actions should be logged for full auditability.

### 4.5 Execution Layer

Once a Task is approved, the Execution Layer:

1. Applies database updates (e.g. change member address).
2. Triggers outbound messages (SMS/email confirmation) if required.

This layer should:
* Implement clear, explicit rules for each task type.
* Avoid hidden side effects.
* Handle errors gracefully and log them.

**Example:**
`ADDRESS_CHANGE` task → update `Member.address` in DB → send confirmation SMS.

### 4.6 Integration Layer (New)

The system uses an **Adapter Pattern** to connect with external Winery Systems (CRM, POS, Reservations).

**Structure:**
* `src/services/integrations/booking/`: Adapters for Tock, SevenRooms, etc.
* `src/services/integrations/crm/`: Adapters for Commerce7, WineDirect, etc.

Each integration type has a **Factory** that inspects `WinerySettings` and returns the correct **Provider** instance.

**Example:**
* `booking.adapter.js`: Defines `createReservation()`.
* `providers/tock.js`: Implements Tock API.
* `services/execution.service.js`: Calls `factory.getProvider(id).createReservation()`.

### 4.7 Database Layer

* **Technology:** MySQL
* **Access:** Sequelize ORM

**Key entities** (see `DOMAIN_MODEL.md` for full detail):
* User
* Winery & WinerySettings
* Member
* Message
* Task
* TaskAction

**General rules:**
* Use Sequelize models for all DB access.
* Avoid raw SQL unless absolutely necessary.
* Use migrations for schema changes.

### 4.8 Logging & Observability

A single shared logger is used across the app (e.g. Winston or Pino).

**Requirements:**

* Structured logs (JSON-friendly)
* Include:
    * timestamp
    * log level
    * request ID (where available)
    * message
    * relevant context (task ID, user ID, etc.)

**Do not log:**
* Full credit card numbers
* Raw authentication tokens
* Sensitive PII beyond what is necessary to debug

Errors should be logged at `error` level with stack traces. Expected business conditions (e.g. "member not found") should use lower levels (info/warn).

## 5. External Integrations

### 5.1 Twilio (SMS and Voice Routing)

**Used for:**
* Receiving SMS (webhook to `/webhooks/sms`)
* Receiving call events (webhook to `/webhooks/voice`)
* Sending outbound SMS (e.g. confirmations, magic links)

The backend will:
* Expose webhook endpoints for Twilio.
* Validate Twilio signatures (later, for security).
* Use Twilio SDK or HTTP API for outbound messages.

### 5.2 Retell (Voice AI)

**Used for:**
* Handling inbound calls with a voice AI agent.

**Flow:**
Caller → Twilio → Retell (voice agent) → backend webhooks for events and actions.

Backend may receive callbacks for events like "caller asked to update address".
Details will be defined in `API_SPEC.md` and integration-specific docs later.

### 5.3 OpenAI (Triage + Drafting)

**Used for:**
* Intent classification in the Triage Engine (later phase).
* Drafting suggested replies to members.

**Interaction pattern:**
* A service module will call OpenAI APIs via an internal helper.
* No direct calls to OpenAI from controllers.
* All prompts and models should be centrally configured.

## 6. Security & Privacy

**Key principles:**

1. **Least Privilege**
   Only necessary data is stored and processed.

2. **No Sensitive Data in Logs**
   Avoid logging any secrets, card numbers, or full personal details.

3. **Separation of Concerns**
   Authentication handled by Firebase.
   Payment details handled by Stripe or other PCI-compliant services (later).

4. **Environment Variables**
   Secrets (API keys, DB passwords) are stored only in `.env` and never committed.

5. **Compliance-aware Messaging**
   Outbound messages should respect anti-spam laws.
   Transactional vs marketing messages are handled differently.

More detailed security notes will live in `ENGINEERING_GUIDE.md` and any future `SECURITY_PRIVACY.md` if created.

## 7. Service Boundaries & Rules

To keep the codebase maintainable and agent-friendly:

* **Controllers:**
    * Only handle HTTP concerns.
    * Use services for real work.
    * Validate input and produce consistent HTTP responses.

* **Services:**
    * Contain the main business rules.
    * Can call other services or models.
    * Do not know about HTTP specifics.

* **Models:**
    * Only represent DB tables and relations.
    * Do not contain business logic beyond simple helpers.

* **Utils:**
    * Pure, reusable functions.

This separation should be followed consistently and reinforced in `ENGINEERING_GUIDE.md`.

## 8. Thin Vertical Slice Strategy

To validate the architecture and give coding agents concrete examples, the first implemented feature will be a thin end-to-end slice:

1. `POST /webhooks/sms` receives a simple SMS payload.
2. Ingestion normalises it into a `Message` record.
3. Triage uses simple rule-based logic to create a `Task` of type `GENERAL_QUERY`.
4. `GET /tasks` returns the created task.

This slice will:
* Prove the routing, models, and basic flow.
* Provide real code patterns for controllers, services, models, and tests.

Once this is working and tested, additional task types and AI-based triage will be layered in.

## 9. Open Questions / To Be Defined

The following details will be fully specified in other docs:

* Exact field definitions and relations for User, Winery, Member, Message, Task, TaskAction (see `DOMAIN_MODEL.md`).
* Exact request/response shapes and error formats for all endpoints (see `API_SPEC.md`).
* Exact logging format (fields and structure).
* Task type enum (full list of supported task types).
* Detailed integration flows with Twilio, Retell, and OpenAI.

As those documents are created, this architecture file should remain consistent with them.

## 10. Summary

VinAgent is a single backend service built around a clear flow: **Ingest → Triage → Task → Human Review → Execution**.

The architecture emphasises clean layering, strong boundaries, and human-in-the-loop control.
External systems (Twilio, Retell, OpenAI, Firebase, Stripe later) are all integrated through well-defined service modules.

This document gives the big-picture mental model; detailed contracts live in `DOMAIN_MODEL.md` and `API_SPEC.md`.

New contributors and AI agents should read this file early to understand how all moving parts connect.
