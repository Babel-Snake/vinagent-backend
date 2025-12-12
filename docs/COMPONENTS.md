# COMPONENTS.md

This document breaks the VinAgent backend into clear components.

Each component includes:

* Purpose
* Responsibilities
* Inputs / Outputs
* Dependencies
* Definition of Done (DoD)
* Related tests

These components are the units of work for development sprints (human + agentic).

---

## 0. Project Bootstrap Components

These are the foundation pieces that must exist before any real features.

### 0.1 Core Project Skeleton

**Purpose:** Provide a working Node.js/Express project with basic tooling.

**Responsibilities:**

* Initialize Node project (`package.json`)
* Add Express server entrypoint
* Add basic `/health` endpoint
* Add Jest config
* Add ESLint + Prettier configs
* Add shared logger wiring
* Add `.env.example`

**Inputs / Outputs:**

* Input: None (fresh repo)
* Output: Running dev server and passing trivial test

**Dependencies:** None

**Definition of Done:**

* `npm run dev` starts server
* `GET /health` returns 200 with JSON
* `npm test` runs at least one passing test
* Lint script runs without fatal errors

**Related Tests:**

* `src/tests/health.controller.test.js`

---

### 0.2 Database + Sequelize Setup

**Purpose:** Provide a working MySQL connection via Sequelize.

**Responsibilities:**

* Configure Sequelize connection using `.env`
* Set up `sequelize` CLI integration (migrations)
* Create initial migration (e.g. for a simple `User` or `Winery` table)

**Inputs / Outputs:**

* Input: DB credentials from `.env`
* Output: Successful connection and migration

**Dependencies:**

* Core Project Skeleton

**Definition of Done:**

* `npx sequelize db:migrate` runs successfully
* DB connection works when starting server

**Related Tests:**

* Simple integration test to confirm DB query succeeds

---

## 1. Auth & User Management

### 1.1 Firebase Auth Integration

**Purpose:** Authenticate API requests using Firebase ID tokens.

**Responsibilities:**

* Verify Firebase tokens on incoming requests
* Attach decoded user info to `req.user`
* Reject unauthorized requests with 401

**Inputs / Outputs:**

* Input: HTTP request with `Authorization: Bearer <token>` header
* Output: `req.user` populated (or 401 response)

**Dependencies:**

* Core Project Skeleton

**Definition of Done:**

* Middleware function `requireAuth` implemented
* Protected routes use `requireAuth`
* Invalid tokens return 401 with consistent error shape

**Related Tests:**

* Unit tests for auth middleware (mock Firebase)
* Integration tests for a protected route

---

### 1.2 User & Role Model

**Purpose:** Represent users and roles in the DB.

**Responsibilities:**

* Define `User` model
* Store role info (e.g. `admin`, `manager`)
* Link users to a `Winery` where needed

**Inputs / Outputs:**

* Input: Data from Firebase or admin setup
* Output: User records in DB

**Dependencies:**

* Database Setup

**Definition of Done:**

* `User` model + migration exist
* Can create/read users via a simple service function

**Related Tests:**

* Unit tests for user service
* Integration test for DB persistence

---

## 2. Wineries & Members

### 2.1 Winery Model & Service

**Purpose:** Store winery-level configuration (name, region, brand voice settings).

**Responsibilities:**

* Define `Winery` model
* Store contact info and preferences
* Provide a service API to fetch winery settings by ID

**Inputs / Outputs:**

* Input: Creation data (name, address, config)
* Output: Winery records

**Dependencies:**

* Database Setup

**Definition of Done:**

* `Winery` model + migration created
* Basic CRUD service methods implemented (at least create, getById)

**Related Tests:**

* Unit tests for winery service
* Integration tests for winery persistence

---

### 2.2 Member Model & Service

**Purpose:** Represent wine club members and their key details.

**Responsibilities:**

* Define `Member` model
* Store contact details (name, email, phone, address)
* Link to `Winery`
* Provide lookup utilities (by phone, email, etc.)

**Inputs / Outputs:**

* Input: Member creation/update data
* Output: Member records

**Dependencies:**

* Winery Model

**Definition of Done:**

* `Member` model + migration created
* Basic service functions: create, update, findById, findByPhoneEmail

**Related Tests:**

* Unit tests for member service
* Integration tests for persistence and lookups

---

## 3. Message Ingestion Layer

### 3.1 SMS Webhook Ingestion

**Purpose:** Accept inbound SMS from Twilio and convert to internal `Message` objects.

**Responsibilities:**

* Define `POST /webhooks/sms` endpoint
* Validate Twilio payload (shape only at first)
* Normalise into an internal `Message` structure
* Store `Message` in DB
* Trigger Triage Engine

**Inputs / Outputs:**

* Input: Twilio SMS webhook payload
* Output: New `Message` record and created `Task`

**Dependencies:**

* Member model (for lookup where possible)
* Triage Engine

**Definition of Done:**

* Endpoint exists and returns 200 for valid payload
* Invalid payloads return 400
* Message records created in DB
* Triage service called for each message

**Related Tests:**

* Unit tests for controller normalisation
* Integration test hitting `/webhooks/sms` and asserting DB state

---

### 3.2 Email Ingestion (Later)

**Purpose:** Accept inbound emails and convert to `Message` objects.

**Responsibilities:**

* Define `POST /webhooks/email` endpoint
* Normalise provider payload to `Message`
* Trigger Triage Engine

**Dependencies:**

* Message model
* Triage Engine

**Definition of Done:**

* Endpoint exists with test payloads defined

**Related Tests:**

* Similar to SMS ingestion tests

---

### 3.3 Voice Call Events (Later)

**Purpose:** Handle call-related webhooks (e.g. from Retell/Twilio).

**Responsibilities:**

* Define `POST /webhooks/voice` endpoint
* Receive call transcripts or events
* Store as `Message`
* Trigger Triage Engine

**Dependencies:**

* Message model
* Triage Engine

**Definition of Done:**

* Endpoint wired, basic test payload supported

**Related Tests:**

* Integration tests with sample voice events

---

## 4. Message & Task Domain

### 4.1 Message Model

**Purpose:** Store normalised inbound communication.

**Responsibilities:**

* Define `Message` model (source, content, direction, raw payload reference)
* Link to `Member` and `Winery` where possible

**Inputs / Outputs:**

* Input: Normalised data from ingestion layer
* Output: Stored `Message` rows

**Dependencies:**

* Member, Winery models

**Definition of Done:**

* `Message` model + migration defined
* Ingestion components use it for persistence

**Related Tests:**

* Integration tests verifying message storage

---

### 4.2 Task Model

**Purpose:** Represent work to be reviewed and executed.

**Responsibilities:**

* Define `Task` model (type, status, payload, references)
* Store links to `Message`, `Member`, `Winery`

**Inputs / Outputs:**

* Input: Data from Triage Engine
* Output: `Task` records

**Dependencies:**

* Message, Member, Winery models

**Definition of Done:**

* `Task` model + migration created
* Core fields defined (type, status, payload JSON, createdBy, etc.)

**Related Tests:**

* Integration tests for task creation and fetching

---

### 4.3 TaskAction / Audit Trail

**Purpose:** Track changes and decisions made about Tasks.

**Responsibilities:**

* Define `TaskAction` model (who did what, when)
* Record approvals, rejections, execution steps

**Inputs / Outputs:**

* Input: User actions on tasks
* Output: `TaskAction` records

**Dependencies:**

* Task, User models

**Definition of Done:**

* `TaskAction` model + migration created
* Service functions to create actions

**Related Tests:**

* Integration tests verifying audit trail on task updates

---

## 5. Triage Engine

### 5.1 Rule-Based Triage (MVP)

**Purpose:** Provide deterministic intent detection for the first thin slice.

**Responsibilities:**

* Analyse `Message` content
* Decide Task type using simple rules (keywords, patterns)
* Create a `Task` for each actionable message

**Inputs / Outputs:**

* Input: `Message` object
* Output: `Task` created with basic type (e.g. `GENERAL_QUERY`)

**Dependencies:**

* Message and Task models

**Definition of Done:**

* `triage.service.js` with a clear `triageMessage` function
* Unit tests for different message examples
* Integration test confirming Task creation from SMS

**Related Tests:**

* Triage unit tests
* End-to-end test: `/webhooks/sms` → Task

---

### 5.2 AI-Based Triage (Later Phase)

**Purpose:** Use OpenAI to classify intent more accurately.

**Responsibilities:**

* Build prompts using message + context
* Parse AI response into Task type + payload

**Inputs / Outputs:**

* Input: Message text + optional member/winery context
* Output: Structured `Task` info

**Dependencies:**

* OpenAI integration service

**Definition of Done:**

* AI triage path implemented
* Fallback to rule-based triage if AI fails

**Related Tests:**

* Unit tests with mocked OpenAI responses

---

## 6. Task Management API

### 6.1 List & Retrieve Tasks

**Purpose:** Allow managers to view tasks.

**Responsibilities:**

* Implement `GET /tasks` and `GET /tasks/:id`
* Filter by winery and status

**Inputs / Outputs:**

* Input: Authenticated request
* Output: JSON list of tasks or single task

**Dependencies:**

* Auth middleware
* Task service

**Definition of Done:**

* Endpoints implemented
* Only tasks for user’s winery returned

**Related Tests:**

* Integration tests for listing and retrieving tasks

---

### 6.2 Update Task (Approve/Reject/Edit)

**Purpose:** Let managers decide what happens with tasks.

**Responsibilities:**

* Implement `PATCH /tasks/:id`
* Allow status changes (e.g. APPROVED, REJECTED)
* Optionally allow payload edits (e.g. corrected address)
* Create `TaskAction` entries

**Inputs / Outputs:**

* Input: JSON patch payload
* Output: Updated Task

**Dependencies:**

* Task & TaskAction models
* Auth middleware

**Definition of Done:**

* Endpoint supports core transitions
* Validation ensures only allowed changes

**Related Tests:**

* Integration tests for approval/rejection flows

---

## 7. Execution Layer

### 7.1 Address Update Execution

**Purpose:** Safely update member address data when a task is approved.

**Responsibilities:**

* On APPROVED `ADDRESS_CHANGE` task:

  * Update `Member` record
  * Log change via `TaskAction`
  * Optionally queue confirmation message

**Inputs / Outputs:**

* Input: Approved Task
* Output: Updated `Member`, updated Task status

**Dependencies:**

* Task & Member models

**Definition of Done:**

* Service function for executing address changes
* Update is idempotent and validated

**Related Tests:**

* Unit tests for execution logic
* Integration tests verifying DB state

---

### 7.2 Confirmation Messaging (Basic)

**Purpose:** Send simple confirmation SMS/email for certain actions.

**Responsibilities:**

* Integrate with Twilio/email provider (later)
* Define simple templates

**Inputs / Outputs:**

* Input: Completed Task
* Output: Outbound message request

**Dependencies:**

* Messaging integration service

**Definition of Done:**

* A stub or basic implementation exists

**Related Tests:**

* Unit tests for template generation (outbound request structure)

---

## 8. Logging & Observability

### 8.1 Logger Setup

**Purpose:** Centralise logging.

**Responsibilities:**

* Configure logger (e.g. Winston/Pino)
* Provide logger instance to rest of app

**Inputs / Outputs:**

* Input: Log messages from code
* Output: Structured log entries

**Dependencies:**

* Core project setup

**Definition of Done:**

* Logger configured
* All controllers/services use logger

**Related Tests:**

* Optional: unit tests verifying logger wrapper

---

### 8.2 Request & Error Logging Middleware

**Purpose:** Track incoming requests and errors.

**Responsibilities:**

* Log basic request info (method, path, duration)
* Log unhandled errors with context

**Inputs / Outputs:**

* Input: HTTP requests and errors
* Output: Log entries

**Dependencies:**

* Logger setup

**Definition of Done:**

* Middleware added to Express
* Errors use central handler

**Related Tests:**

* Integration tests confirming error handler responds correctly

---

## 9. Testing & Tooling

### 9.1 Jest Configuration & Helpers

**Purpose:** Provide a standard environment for tests.

**Responsibilities:**

* Configure Jest
* Provide setup/teardown for DB
* Provide helpers for creating test data

**Inputs / Outputs:**

* Input: Test files
* Output: Stable test runs

**Dependencies:**

* DB setup

**Definition of Done:**

* Jest config file exists
* Tests can reset DB between runs

**Related Tests:**

* Meta: tests passing reliably

---

## 10. Sprint Ordering (Suggested)

A recommended build order:

1. **Core Project Skeleton** (0.1)
2. **Database + Sequelize Setup** (0.2)
3. **Winery + Member Models** (2.1, 2.2)
4. **Message + Task Models** (4.1, 4.2)
5. **Logger Setup + Error Middleware** (8.1, 8.2)
6. **Rule-Based Triage Engine** (5.1)
7. **SMS Webhook Ingestion** (3.1)
8. **Task List & Retrieve API** (6.1)
9. **Task Update (Approve/Reject)** (6.2)
9. **Task Update (Approve/Reject)** (6.2)
10. **Address Update Execution** (7.1)
11. **Notification Service** (9.1)
12. **Booking Integration** (10.2)
13. **CRM Integration** (10.3)

After this thin vertical slice is working end-to-end, expand:

* Additional ingestion channels (email, voice)
* AI-based triage
* Confirmation messaging
* More task types
* Real Provider Implementations (Tock, Commerce7)

---

This COMPONENTS.md file is the blueprint for implementation sprints. Each component can be handed to an agent or a human developer along with the relevant sections of TEST_PLAN.md and DOMAIN_MODEL.md to implement safely and consistently.
