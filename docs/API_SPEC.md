# API_SPEC.md

VinAgent HTTP API specification for the MVP, aligned with the secure-link Golden Path and the current domain model.

Stack assumptions:

* Backend: Express.js (Node)
* Auth: Firebase Authentication (Bearer token for dashboard APIs)
* DB: MySQL via Sequelize

This spec focuses on the first thin slice:

* Inbound SMS → Message → Task → Human approval → MemberActionToken → Member confirms via link → Address updated → Confirmation.

---

## 1. Conventions

* **Base URL (backend)**: `https://api.vinagent.app` (placeholder)
* **Content Type**: `application/json` for all non-webhook endpoints.
* **Timestamps**: ISO 8601 strings in UTC or local with offset.
* **IDs**: Integers in examples, but could be UUIDs internally.
* **Errors**: Standard JSON error format:

```json
{
  "error": {
    "code": "SOME_CODE",
    "message": "Human readable message",
    "details": { "optional": "context" }
  }
}
```

---

## 2. Authentication

### 2.1 Dashboard / Internal APIs

* Use Firebase Authentication.
* Clients send `Authorization: Bearer <firebase-id-token>`.
* Middleware verifies token and populates `req.user` with:

  * `userId`
  * `wineryId`
  * `role` (`admin`, `manager`, `staff`)

Requests without valid tokens MUST return:

```http
401 Unauthorized
```

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Missing or invalid authentication token"
  }
}
```

### 2.2 Webhook Endpoints

* Twilio SMS webhook is not Firebase-authenticated.
* Validate via Twilio signature or secret token.

If validation fails, return `403 Forbidden`.

### 2.3 Member Self-Service Endpoints

* `/address-update/*` endpoints are secured via `MemberActionToken` `token` query/body param.
* No additional login required for the MVP.

---

## 3. Webhooks

### 3.1 POST /webhooks/sms

Inbound SMS from Twilio. Normalises the message and creates a `Message` + `Task`.

**URL**

```http
POST /webhooks/sms
```

**Auth**

* Twilio signature validation (implementation detail).

**Request (x-www-form-urlencoded, simplified example)**

```text
From=%2B61412345678
To=%2B61123456789
Body=Hi%2C+I%27ve+moved.+Please+update+my+address+to+12+Oak+Street%2C+Stirling+5152.
MessageSid=SM1234567890
AccountSid=AC987654321
```

The controller will:

* Validate required fields.
* Normalise into internal shape.
* Call the ingestion service.

**Response (success)**

```http
200 OK
```

```json
{
  "status": "ok"
}
```

**Response (validation error)**

```http
400 Bad Request
```

```json
{
  "error": {
    "code": "INVALID_WEBHOOK_PAYLOAD",
    "message": "Missing required fields"
  }
}
```

---

## 4. Task APIs (Dashboard)

These endpoints allow winery staff to review and approve tasks.

### 4.1 GET /tasks

List tasks for the authenticated user’s winery.

**URL**

```http
GET /tasks
```

**Query Parameters (optional)**

* `status`: filter by status (`PENDING_REVIEW`, `APPROVED`, `AWAITING_MEMBER_ACTION`, `EXECUTED`, etc.).
* `type`: filter by type (`ADDRESS_CHANGE`, `GENERAL_QUERY`, ...).
* `page`: page number (default `1`).
* `pageSize`: items per page (default `20`, max `100`).

**Headers**

```http
Authorization: Bearer <firebase-id-token>
```

**Response (200)**

```json
{
  "data": [
    {
      "id": 5001,
      "type": "ADDRESS_CHANGE",
      "status": "PENDING_REVIEW",
      "member": {
        "id": 42,
        "firstName": "Emma",
        "lastName": "Clarke"
      },
      "payload": {
        "newAddress": {
          "addressLine1": "12 Oak Street",
          "suburb": "Stirling",
          "state": "SA",
          "postcode": "5152",
          "country": "Australia"
        }
      },
      "suggestedChannel": "sms",
      "suggestedReplyBody": "Hi Emma, thanks for your message. We'll send you a secure link...",
      "createdAt": "2025-02-03T09:15:02+10:30"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1
  }
}
```

---

### 4.2 POST /tasks
Manually create a task (e.g. by internal staff).

**URL**
```http
POST /tasks
```

**Body**
```json
{
  "category": "ACCOUNT",
  "subType": "ACCOUNT_ADDRESS_CHANGE",
  "customerType": "MEMBER",
  "priority": "normal",
  "payload": { "note": "Member called to update address" },
  "memberId": 42
}
```

**Response (201)**
Returns the created task.

---

### 4.3 GET /tasks/:id
Fetch one task by ID.

**URL**
```http
GET /tasks/:id
```

**Response (200)**
```json
{
  "id": 5001,
  "category": "ACCOUNT",
  "subType": "ACCOUNT_ADDRESS_CHANGE",
  "customerType": "MEMBER",
  "status": "PENDING_REVIEW",
  "member": { "id": 42, "firstName": "Emma" },
  "payload": { "newAddress": { "addressLine1": "..." } },
  "createdAt": "2025-02-03T09:15:02+10:30"
}
```

---

### 4.4 PATCH /tasks/:id
Update status, payload, priority, or re-classify.

**URL**
```http
PATCH /tasks/:id
```

**Body (example)**
```json
{
  "status": "APPROVED",
  "priority": "high",
  "notes": "Spoke to member, confirmed details.",
  "payload": { ... }
}
```

**Response (200)**
Returns updated task.

## 5. Execution (Internal)

For the MVP, execution can be triggered synchronously after approval from the same server process. We do **not** expose a public HTTP endpoint for execution yet.

Conceptually:

```js
// inside taskService.approveTask
if (newStatus === 'APPROVED') {
  executionService.executeTask(taskId);
}
```

`executionService.executeTask(taskId)` will:

* Create a `MemberActionToken`.
* Send an outbound message using the chosen channel.
* Update the task status to `AWAITING_MEMBER_ACTION`.
* Create a `TaskAction` of type `EXECUTION_TRIGGERED`.

If we later need a separate endpoint or job queue, we can add:

```http
POST /tasks/:id/execute
```

for internal/admin usage, but this is **not needed** for the first thin slice.

---

## 6. Member Self-Service: Address Update

These endpoints are called by the frontend that renders when a member clicks the secure link.

### 6.1 GET /address-update/validate

Validate an address update token and return current/proposed address data.

**URL**

```http
GET /address-update/validate
```

**Query Parameters**

* `token` (string, required): the opaque `MemberActionToken.token` value.

**Auth**

* Secured by the token itself. No Firebase.

**Response (200)**

```json
{
  "member": {
    "id": 42,
    "firstName": "Emma",
    "lastName": "Clarke"
  },
  "currentAddress": {
    "addressLine1": "5 River Road",
    "suburb": "Crafers",
    "state": "SA",
    "postcode": "5152",
    "country": "Australia"
  },
  "proposedAddress": {
    "addressLine1": "12 Oak Street",
    "suburb": "Stirling",
    "state": "SA",
    "postcode": "5152",
    "country": "Australia"
  }
}
```

**Response (400 / 404)**

Examples:

* Token missing → `400` `INVALID_TOKEN`.
* Token not found → `404` `TOKEN_NOT_FOUND`.
* Token expired → `400` `TOKEN_EXPIRED`.
* Token already used → `400` `TOKEN_ALREADY_USED`.

```json
{
  "error": {
    "code": "TOKEN_EXPIRED",
    "message": "This link has expired. Please request a new one."
  }
}
```

---

### 6.2 POST /address-update/confirm

Confirm (and optionally edit) the new address using a valid token.

**URL**

```http
POST /address-update/confirm
```

**Body**

```json
{
  "token": "XYZ123",
  "newAddress": {
    "addressLine1": "12 Oak Street",
    "suburb": "Stirling",
    "state": "SA",
    "postcode": "5152",
    "country": "Australia"
  }
}
```

Rules:

* Validate token as in `/validate`.
* Validate `newAddress` fields.
* Update `Member` record.
* Mark `MemberActionToken.usedAt`.
* Update `Task.status` → `EXECUTED`.
* Create `TaskAction(EXECUTED)`.
* Optionally send a final confirmation message (SMS or email) to the member.

**Response (200)**

```json
{
  "status": "ok",
  "member": {
    "id": 42,
    "firstName": "Emma",
    "lastName": "Clarke"
  },
  "newAddress": {
    "addressLine1": "12 Oak Street",
    "suburb": "Stirling",
    "state": "SA",
    "postcode": "5152",
    "country": "Australia"
  }
}
```

**Response (errors)**

Similar to `/address-update/validate` for token issues, plus:

```json
{
  "error": {
    "code": "INVALID_ADDRESS",
    "message": "Postcode is required"
  }
}
```

---

## 7. Optional Supporting APIs (MVP-Adjacent)

These are useful but not strictly required for the first thin slice. They can be added as needed.

### 7.1 GET /members/:id

Return member details for internal UI.

```http
GET /members/:id
Authorization: Bearer <firebase-id-token>
```

Response (example):

```json
{
  "id": 42,
  "firstName": "Emma",
  "lastName": "Clarke",
  "email": "emma.clarke@example.com",
  "phone": "+61412345678",
  "addressLine1": "12 Oak Street",
  "suburb": "Stirling",
  "state": "SA",
  "postcode": "5152",
  "country": "Australia"
}
```

### 7.2 GET /messages/:id

Return a single message (for context in the UI).

```http
GET /messages/:id
Authorization: Bearer <firebase-id-token>
```

Response:

```json
{
  "id": 1001,
  "direction": "inbound",
  "source": "sms",
  "body": "Hi, I've moved. Please update my address...",
  "createdAt": "2025-02-03T09:15:02+10:30"
}
```

---

## 8. Status and Type Enums (Reference)

These enums should match the `DOMAIN_MODEL.md`.

### 8.1 Task Types (initial)

* `GENERAL_QUERY`
* `ADDRESS_CHANGE`
* `PAYMENT_ISSUE`
* `BOOKING_REQUEST`
* `DELIVERY_ISSUE`

### 8.2 Task Statuses

* `PENDING_REVIEW`
* `APPROVED`
* `AWAITING_MEMBER_ACTION`
* `REJECTED`
* `EXECUTED`
* `CANCELLED`

### 8.3 MemberActionToken Types

* `ADDRESS_CHANGE`
* (Future) `PAYMENT_METHOD_UPDATE`
* (Future) `PREFERENCE_UPDATE`

### 8.4 MemberActionToken Channels

* `sms`
* `email`
* `voice` (future)

---

## 9. Notes for Implementation & Tests

* Every endpoint here should have accompanying Jest tests:

  * Unit tests for controllers and services.
  * Integration tests for the full SMS → Task → Token → Confirm flow.
* All logging should avoid PII as per `DOMAIN_MODEL.md`.
* Error codes should be consistent and predictable to make it easy for the frontend (and AI agents) to handle them.

This API spec is intentionally narrow and focused on the first vertical slice. New endpoints should be added in separate sections, keeping the same patterns and error structures.
