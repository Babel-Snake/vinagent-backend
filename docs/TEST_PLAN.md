# TEST_PLAN.md

Comprehensive test plan for VinAgent MVP, aligned with:

* `DOMAIN_MODEL.md`
* `GOLDEN_PATH.md` (secure-link address change flow)
* `API_SPEC.md`

The goal is to:

* Ensure the first thin slice (address change via SMS + secure link) is robust.
* Provide clear structure so AI coding agents and human devs can implement and extend tests consistently.

Stack assumptions:

* Node.js + Express
* Sequelize + MySQL
* Firebase Auth for dashboard APIs
* Jest for tests (with supertest for HTTP integration tests)
* Podman/Docker-based test DB for integration tests

---

## 1. Test Strategy Overview

We will test at three main levels:

1. **Unit tests** – Small, isolated functions and services.

   * Triage logic
   * Execution service
   * Token creation/validation helpers

2. **Integration tests** – HTTP + DB interactions.

   * `POST /webhooks/sms` → Message + Task creation
   * `GET /tasks`, `GET /tasks/:id` (with auth)
   * `PATCH /tasks/:id` → triggers execution
   * `GET /address-update/validate` & `POST /address-update/confirm`

3. **End-to-End golden path** – Simulate the full story.

   * Inbound SMS → triage → task → approval → token → member confirm → member updated → final confirmation.

Non-functional checks:

* Auth & authorization (Firebase + token-based)
* Data validation and error handling
* Logging behaviour (no PII)

Each test area below includes:

* Purpose
* Key test cases
* Example inputs/outputs

---

## 2. Unit Tests

### 2.1 Triage Service

**Module:** `triageService`

**Purpose:** Given a `Message`, classify intent and produce a `Task` payload suggestion.

**Key behaviours:**

* Recognise address change intents.
* Extract structured address data.
* Choose a reasonable suggested channel and reply stub.

**Test cases:**

1. **Address Change – Clear Pattern**

   * Input body: "Hi, I've moved. Please update my address to 12 Oak Street, Stirling 5152."
   * Expected:

     * `type = ADDRESS_CHANGE`
     * `payload.newAddress.addressLine1 = "12 Oak Street"`
     * `payload.newAddress.suburb = "Stirling"`
     * `payload.newAddress.postcode = "5152"`
     * `suggestedChannel = sms`

2. **Address Change – Missing Postcode**

   * Input body: "I moved to 12 Oak Street, Stirling."
   * Expected:

     * `type = ADDRESS_CHANGE`
     * `payload.newAddress.postcode` may be `null` or missing
     * Triage still creates a payload but may mark it as incomplete (e.g. `payload.metadata.missingFields = ["postcode"]`).

3. **Non-Address Query**

   * Input body: "What time do you open on Saturday?"
   * Expected:

     * `type = GENERAL_QUERY`
     * No `newAddress` in payload

4. **Multiple Intents – MVP Behaviour**

   * Input body: "I've moved and also my payment card changed."
   * MVP behaviour (simple):

     * Either pick one dominant intent (e.g. `ADDRESS_CHANGE`), or
     * Tag as `GENERAL_QUERY` with a note in payload.
   * Ensure logic is predictable and documented.

5. **Safety – Empty Body**

   * Input body: `""` or whitespace
   * Expected:

     * Error or fallback to `GENERAL_QUERY` with `payload.issue = "UNPARSABLE"`.

---

### 2.2 Task Service

**Module:** `taskService`

**Purpose:** Create and update tasks, enforce status transitions, record actions.

**Key behaviours:**

* Enforce allowed transitions.
* Attach correct `TaskAction` entries.

**Test cases:**

1. **Create Task From Triage**

   * Input: triage result (type, payload, suggestedChannel).
   * Expected:

     * `Task` created with `status = PENDING_REVIEW`.
     * `TaskAction(CREATED)` created with correct details.

2. **Approve Valid Transition**

   * From `PENDING_REVIEW` to `APPROVED`.
   * Expected:

     * `Task.status = APPROVED`.
     * `TaskAction(APPROVED)` recorded with correct `userId`.

3. **Reject Valid Transition**

   * From `PENDING_REVIEW` to `REJECTED`.
   * Expected:

     * `Task.status = REJECTED`.
     * `TaskAction(REJECTED)` recorded with reason in `details`.

4. **Invalid Transition**

   * From `EXECUTED` to `APPROVED`.
   * Expected:

     * Throw error (e.g. `INVALID_TASK_STATUS_TRANSITION`).

5. **Payload Update on Approve**

   * Manager modifies `payload.newAddress` before approval.
   * Expected:

     * `Task.payload` updated.
     * `TaskAction(APPROVED)` includes diff or note in `details` (optional but nice to track).

---

### 2.3 Execution Service

**Module:** `executionService`

**Purpose:** After a task is approved, handle execution:

* Create `MemberActionToken`.
* Send outbound message with link.
* Update task status.
* Record `TaskAction`.

**Test cases:**

1. **Execution for ADDRESS_CHANGE (SMS Channel)**

   * Given `Task` with:

     * `type = ADDRESS_CHANGE`
     * `status = APPROVED`
     * `suggestedChannel = sms`
   * Expected:

     * `MemberActionToken` created with `type = ADDRESS_CHANGE`, `channel = sms`, `memberId`, `wineryId`, `taskId`.
     * Token has `expiresAt` in the future.
     * SMS service called once with body containing a URL containing the token.
     * `Task.status = AWAITING_MEMBER_ACTION`.
     * `TaskAction(EXECUTION_TRIGGERED)` recorded.

2. **Execution – No Member**

   * Task has no `memberId` (e.g. message not matched to a member).
   * Expected:

     * Execution fails gracefully with error (e.g. `TASK_HAS_NO_MEMBER`).
     * Task status stays `APPROVED`.

3. **Execution – Unsupported Type**

   * Unknown `Task.type`.
   * Expected:

     * Error `UNSUPPORTED_TASK_TYPE`.

4. **Execution – Email Channel (Future-proof)**

   * `suggestedChannel = email`.
   * Expected:

     * `MemberActionToken.channel = email`.
     * Email service called instead of SMS.

---

### 2.4 MemberActionToken Service

**Module:** `memberActionTokenService`

**Purpose:**

* Create secure tokens.
* Validate and consume tokens.

**Test cases:**

1. **Create Token – Basic**

   * Input: `memberId`, `wineryId`, `taskId`, `type`, `channel`, `target`.
   * Expected:

     * Token string is random, opaque, and non-empty.
     * Record persisted with correct foreign keys.
     * `expiresAt` = now + configured TTL.

2. **Validate Token – Happy Path**

   * Token exists, not expired, unused.
   * Expected:

     * Returns linked `Member`, `Task`, and payload.

3. **Validate Token – Not Found**

   * Unknown token.
   * Expected:

     * Error `TOKEN_NOT_FOUND`.

4. **Validate Token – Expired**

   * `expiresAt` < now.
   * Expected:

     * Error `TOKEN_EXPIRED`.

5. **Validate Token – Already Used**

   * `usedAt` not null.
   * Expected:

     * Error `TOKEN_ALREADY_USED`.

6. **Consume Token – Marks usedAt**

   * After successful address update, consuming token sets `usedAt`.

---

### 2.5 Address Update Service

**Module:** `addressUpdateService`

**Purpose:**

* Given a validated token and new address, update the `Member` and associated `Task`.

**Test cases:**

1. **Happy Path**

   * Valid token + valid address.
   * Expected:

     * Member address fields updated.
     * Token `usedAt` set.
     * Task status → `EXECUTED`.
     * `TaskAction(EXECUTED)` created.

2. **Invalid Address Data**

   * Missing required fields (e.g. no `postcode`).
   * Expected:

     * Error `INVALID_ADDRESS`.
     * No changes to Member/Token/Task.

3. **Concurrency – Double Submit**

   * Simulate two confirmations using the same token.
   * Expected:

     * First call succeeds.
     * Second call fails with `TOKEN_ALREADY_USED`.

---

## 3. Integration Tests (HTTP + DB)

Integration tests use supertest against the Express app + a real test DB (via Podman). They test:

* Routing
* Controllers
* Services
* DB interactions
* Auth middleware

### 3.1 Inbound SMS Webhook → Message & Task

**Scenario:** `POST /webhooks/sms` with valid Twilio payload.

**Steps:**

1. Seed DB with winery (id 1) and member (id 42 with phone).
2. Call `POST /webhooks/sms` with realistic Twilio payload.
3. Assert:

   * `Message` row created (inbound, sms).
   * `Task` row created with `type = ADDRESS_CHANGE`, `status = PENDING_REVIEW`.
   * `TaskAction(CREATED)` created.

**Variations:**

* Phone not matched to a member → Task still created but `memberId = null` (or flow defined accordingly).
* Missing `Body` → `400 INVALID_WEBHOOK_PAYLOAD`.

---

### 3.2 GET /tasks (Auth + Filtering)

**Scenario:** Manager lists `PENDING_REVIEW` tasks.

**Steps:**

1. Seed DB:

   * `User` with role `manager`, `wineryId = 1`.
   * Several tasks with varying statuses and wineryIds.
2. Call `GET /tasks?status=PENDING_REVIEW` with valid Firebase token.
3. Assert:

   * Only tasks for `wineryId = 1`.
   * Only tasks with status `PENDING_REVIEW`.
   * Pagination info present.

**Auth Edge Cases:**

* No token → `401 UNAUTHENTICATED`.
* Token for user with different winery → returns only that winery’s tasks.

---

### 3.3 PATCH /tasks/:id (Approve)

**Scenario:** Manager approves an address-change task.

**Steps:**

1. Seed DB with:

   * `Task` id 5001, status `PENDING_REVIEW`, valid payload.
   * `User` manager for same winery.
2. Call `PATCH /tasks/5001` with body to set `status = APPROVED` and updated reply.
3. Assert:

   * `Task.status = APPROVED`.
   * `Task.payload` updated.
   * `TaskAction(APPROVED)` created with correct `userId`.

**Invalid Cases:**

* Wrong winery user tries to approve → `403 FORBIDDEN`.
* Invalid status transition → `400 INVALID_TASK_STATUS_TRANSITION`.

---

### 3.4 Approve → Execution (Token + Outbound Message)

**Scenario:** Approving a task triggers execution.

**Steps:**

1. Seed DB with APPROVABLE task.
2. Stub/mocks for SMS provider (so no real SMS).
3. Call `PATCH /tasks/5001` as above.
4. Assert:

   * `MemberActionToken` created (`type = ADDRESS_CHANGE`, `channel = sms`).
   * Outbound SMS function called once with body containing URL.
   * Outbound `Message` row created (direction outbound).
   * `Task.status = AWAITING_MEMBER_ACTION`.
   * `TaskAction(EXECUTION_TRIGGERED)` recorded.

---

### 3.5 GET /address-update/validate

**Scenario:** Member clicks secure link.

**Steps:**

1. Seed DB with:

   * `Member`, `Task`, and `MemberActionToken` (unused, not expired).
2. Call `GET /address-update/validate?token=XYZ123`.
3. Assert:

   * `200 OK`.
   * Response includes `member` (no sensitive extras), `currentAddress`, `proposedAddress`.

**Edge Cases:**

* Token missing → `400 INVALID_TOKEN`.
* Token not found → `404 TOKEN_NOT_FOUND`.
* Token expired → `400 TOKEN_EXPIRED`.
* Token already used → `400 TOKEN_ALREADY_USED`.

---

### 3.6 POST /address-update/confirm

**Scenario:** Member confirms address.

**Steps:**

1. Seed DB as above with unused token.
2. Call `POST /address-update/confirm` with valid `token` and `newAddress`.
3. Assert:

   * `200 OK` + `status: ok`.
   * `Member` address updated.
   * Token `usedAt` set.
   * `Task.status = EXECUTED`.
   * `TaskAction(EXECUTED)` created.
   * Optionally: outbound confirmation message created.

**Edge Cases:**

* Invalid address → `400 INVALID_ADDRESS`, no updates.
* Second call with same token → `400 TOKEN_ALREADY_USED`.

---

## 4. End-to-End Golden Path Test

This is the most important integration test. It simulates the full flow described in `GOLDEN_PATH.md`.

### 4.1 Scenario: Full Address Change Flow

**Steps:**

1. Seed DB with `Winery`, `Member`, `User (manager)`.
2. `POST /webhooks/sms` with Emma’s message.
3. `GET /tasks?status=PENDING_REVIEW` as manager, assert one task.
4. `PATCH /tasks/:id` to approve.
5. Inspect DB:

   * `MemberActionToken` exists.
   * `Task.status = AWAITING_MEMBER_ACTION`.
6. Simulate member clicking link:

   * `GET /address-update/validate?token=...`.
   * Assert fields correct.
7. Member confirms:

   * `POST /address-update/confirm` with token + address.
8. Final assertions:

   * Member’s address updated.
   * Token `usedAt` set.
   * Task `EXECUTED`.
   * `TaskAction` trail: `CREATED`, `APPROVED`, `EXECUTION_TRIGGERED`, `EXECUTED`.
   * Optional: outbound confirmation message.

This test should be run regularly and treated as a primary health indicator for the system.

---

## 5. Negative & Security-Focused Tests

### 5.1 Auth & Permissions

1. **Missing Auth for Dashboard Endpoints**

   * `GET /tasks` without token → `401`.
   * `PATCH /tasks/:id` without token → `401`.

2. **Wrong Winery User**

   * User from `wineryId = 2` tries to access `Task` for `wineryId = 1`.
   * `GET /tasks/:id` → `404` or `403` (decide and keep consistent).
   * `PATCH /tasks/:id` → `403 FORBIDDEN`.

3. **Role-Based**

   * If you differentiate `staff` vs `manager`, ensure only allowed roles can approve tasks.

---

### 5.2 Token Abuse

1. **Tampered Token**

   * Random string that does not exist → `TOKEN_NOT_FOUND`.

2. **Replay Attack**

   * Use same token twice on `/confirm`.
   * Second call must fail with `TOKEN_ALREADY_USED`.

3. **Cross-Winery Token Misuse**

   * Ensure token cannot be used to access/modify a different winery or member.

---

### 5.3 Data Validation

1. **Invalid Address Formats**

   * Non-string fields where strings are expected.
   * Missing essential fields (e.g. `addressLine1`, `suburb`, `state`, `postcode`).

2. **Oversized Input**

   * Very long strings for address fields.
   * Ensure they are either truncated or rejected.

---

## 6. Logging & PII Tests

Even though this is harder to test automatically, we can:

* Add tests that inspect logger calls via a mock logger.
* Assert that:

  * Logs include IDs and high-level context.
  * Logs do **not** include full message bodies, full addresses, or raw token strings.

Example test:

* Trigger a flow (e.g. create token).
* Inspect logger mock calls.
* Ensure only `tokenId`, not `token`, appears.

---

## 7. Test Organisation & Naming

**Suggested Jest folder structure:**

```
/tests
  /unit
    triageService.test.ts
    taskService.test.ts
    executionService.test.ts
    memberActionTokenService.test.ts
    addressUpdateService.test.ts
  /integration
    smsWebhook.int.test.ts
    tasksApi.int.test.ts
    addressUpdateApi.int.test.ts
    goldenPath.int.test.ts
```

Naming conventions:

* Unit tests: `*.test.ts`
* Integration tests: `*.int.test.ts`

Each test file should:

* Use clear `describe` blocks per method/endpoint.
* Use explicit `it('should ...')` descriptions that map back to the cases in this plan.

---

### 2.6 Winery Settings & Tier Logic

**Module:** `triageService` / `WinerySettings`

**Purpose:** Ensure features are gated by tier configuration.

**Test cases:**

1. **Basic Tier Downgrade**
   * Winery has `enableWineClubModule: false`.
   * Input: "Change my address".
   * Expected: `category=GENERAL`, `subType=GENERAL_ENQUIRY`.

2. **Advanced Tier Preservation**
   * Winery has `enableWineClubModule: true`.
   * Input: "Change my address".
   * Expected: `category=ACCOUNT`, `subType=ACCOUNT_ADDRESS_CHANGE`.

---

## 3. Integration Tests (HTTP + DB)

### 3.1 Inbound SMS Webhook → Message & Task
...

### 3.2 Manual Task Operations
**Scenario:** Staff manually creates a task.

1. `POST /api/tasks` with `category=INTERNAL`, `note="Call back later"`.
2. Assert `Task` created with `PENDING_REVIEW`.
3. Assert `TaskAction(MANUAL_CREATED)`.

### 3.3 PATCH Task & Tier Execution
**Scenario:** Approving a task respects feature flags.

1. Winery has `enableSecureLinks: false`.
2. `PATCH /tasks/:id` to APPROVED.
3. Assert Task is APPROVED but `MemberActionToken` is **NOT** created (Execution skipped).


Once the MVP slice is stable, extend this test plan to cover:

* Booking requests (`BOOKING_REQUEST` type)
* Payment issues (`PAYMENT_ISSUE` type)
* Email-based links (`channel = email`)
* Voice/IVR flows (`channel = voice`)
* Member order history and preference-based suggestions (`MemberOrder`, `OrderItem`)

For each new feature, mirror this structure:

* Unit tests for new services.
* Integration tests for new endpoints.
* One or more Golden Path-style end-to-end tests.

---

This test plan is intended to be concrete enough for direct implementation by AI coding agents and human developers, while staying readable and maintainable as the project grows.
