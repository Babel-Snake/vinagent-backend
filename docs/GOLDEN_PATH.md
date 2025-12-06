# GOLDEN_PATH.md

This document defines the **canonical, end-to-end flow** for VinAgent in its updated architecture using **secure member confirmation links** via SMS, email, or future voice flows.

This replaces the previous direct-update flow. In the new system:

> **The system never updates customer data directly after approval.**
>
> Instead, the member receives a secure link/token, confirms or edits their details, and *then* the system applies the change.

This improves security, reduces fraud, reduces errors, and creates a cleaner audit trail.

This Golden Path is the reference for:

* API design
* Test planning
* Implementation of the first thin slice
* Onboarding new developers and AI coding agents

---

# 1. Scenario Overview (Secure-Link Version)

**Story:**

* A member, **Emma Clarke**, at **Sunrise Ridge Winery**, has moved house.
* Emma sends an SMS: *"Hi, I've moved. Please update my address to 12 Oak Street, Stirling 5152."*
* VinAgent receives the SMS, normalises it into a `Message`, runs triage, and creates an `ADDRESS_CHANGE` `Task`.
* The winery manager reviews the task and approves it.
* **Execution now sends Emma a secure link** to confirm her new address.
* Emma taps the link, sees the form pre-filled, confirms it.
* VinAgent validates the token, updates Emma’s address, marks the task executed, and sends a final confirmation.

This scenario exercises the full secure flow.

---

# 2. Pre-Conditions

## 2.1 Winery

```
id: 1
name: Sunrise Ridge Winery
timeZone: Australia/Adelaide
```

## 2.2 Member (Old Address)

```
id: 42
wineryId: 1
firstName: Emma
lastName: Clarke
phone: +61412345678
email: emma.clarke@example.com
addressLine1: 5 River Road
suburb: Crafers
state: SA
postcode: 5152
country: Australia
```

## 2.3 User (Manager)

```
id: 7
email: manager@sunriseridge.example
wineryId: 1
role: manager
```

## 2.4 Database State

* No related tasks yet.
* No message yet.
* No `MemberActionToken` yet.

---

# 3. Step 1 – Inbound SMS → Webhook

Emma sends:

> "Hi, I've moved. Please update my address to 12 Oak Street, Stirling 5152."

Twilio posts to:

```
POST /webhooks/sms
```

Minimal normalised payload:

```json
{
  "from": "+61412345678",
  "body": "Hi, I've moved. Please update my address to 12 Oak Street, Stirling 5152.",
  "providerMessageId": "SM1234567890"
}
```

The controller validates → hands off to Message Ingestion.

---

# 4. Step 2 – Message Ingestion

## 4.1 Member Lookup

`+61412345678` resolves to `Member.id = 42`.

## 4.2 Create Message

A `Message` row is created:

```
id: 1001
wineryId: 1
memberId: 42
source: sms
direction: inbound
body: "Hi, I've moved..."
externalId: "SM1234567890"
receivedAt: 2025-02-03T09:15:00+10:30
```

Then ingestion invokes triage:

```js
triageService.triageMessage({ messageId: 1001, memberId: 42, wineryId: 1, body: "Hi, I've moved..." });
```

---

# 5. Step 3 – Triage Engine → Task Creation

## 5.1 Classifying Intent

Rule-based MVP logic identifies keywords: "moved", "update", address-like patterns.

Intent: **ADDRESS_CHANGE**.

## 5.2 Extract Payload

```json
{
  "newAddress": {
    "addressLine1": "12 Oak Street",
    "suburb": "Stirling",
    "state": "SA",
    "postcode": "5152",
    "country": "Australia"
  }
}
```

## 5.3 Drafted Reply

```json
{
  "suggestedChannel": "sms",
  "suggestedReplyBody": "Hi Emma, thanks for your message. We'll send you a secure link so you can confirm your new address."
}
```

## 5.4 Task Created

```
id: 5001
type: ADDRESS_CHANGE
status: PENDING_REVIEW
payload: { newAddress: {...} }
suggestedChannel: sms
requiresApproval: true
createdBy: null (system)
```

## 5.5 TaskAction (CREATED)

```
actionType: CREATED
userId: null
details: { "source": "triage_mvp" }
```

---

# 6. Step 4 – Manager Reviews Task

Client calls:

```
GET /tasks?status=PENDING_REVIEW
```

Manager sees:

* Member summary
* Extracted address
* Drafted message
* Approval button

---

# 7. Step 5 – Manager Approves Task

Manager approves with optional edits to the suggested reply:

```
PATCH /tasks/5001
{
  "status": "APPROVED",
  "payload": { "newAddress": {...} },
  "suggestedReplyBody": "Hi Emma, thanks for your message. We'll send you a secure link to confirm your new address."
}
```

Task is updated → status becomes `APPROVED`.

`TaskAction` records:

```
actionType: APPROVED
userId: 7
```

Execution service is triggered.

---

# 8. Step 6 – Execution Stage (Secure Link)

The execution service **does NOT update the address directly**.
Instead, it:

## 8.1 Creates a MemberActionToken

```
id: 8001
type: ADDRESS_CHANGE
memberId: 42
wineryId: 1
taskId: 5001
channel: sms
token: <opaque-random-value>
target: "+61412345678"
expiresAt: 2025-02-10T09:30:00+10:30
payload: { newAddress: {...} }
```

## 8.2 Sends SMS With Secure Link

Outbound message body:

> "Hi Emma, tap this secure link to confirm your new address: [https://vinagent.app/address-update?token=XYZ123](https://vinagent.app/address-update?token=XYZ123)"

Outbound message stored as:

```
Message.id: 1002
direction: outbound
body: "Hi Emma, tap this secure link..."
externalId: "SM9876543210"
```

## 8.3 Task Status Update → AWAITING_MEMBER_ACTION

`Task` becomes:

```
status: AWAITING_MEMBER_ACTION
```

`TaskAction` recorded:

```
actionType: EXECUTION_TRIGGERED
details: { tokenId: 8001, channel: "sms" }
```

---

# 9. Step 7 – Member Opens Secure Link

Emma taps the link.

Browser calls:

```
GET /address-update/validate?token=XYZ123
```

Backend:

* Validates token
* Ensures it is not expired
* Ensures it is unused

Response:

```json
{
  "member": { "firstName": "Emma" },
  "proposedAddress": { "addressLine1": "12 Oak Street", "suburb": "Stirling", "state": "SA", "postcode": "5152" }
}
```

Frontend shows a confirmation form.

---

# 10. Step 8 – Member Confirms Address

Emma submits:

```
POST /address-update/confirm
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

Backend:

* Validates token again
* Updates the `Member` record
* Marks token `usedAt = now`
* Updates task status → `EXECUTED`
* Records `TaskAction(EXECUTED)`

## 10.1 Member Update

```
Member.addressLine1 = "12 Oak Street"
Member.suburb = "Stirling"
...
```

## 10.2 Final Confirmation SMS

Outbound SMS:

> "Hi Emma — your address has been updated. Thanks for confirming!"

Recorded as outbound `Message.id: 1003`.

---

# 11. Final State Summary

## 11.1 Entities Created

* Message (inbound) – id 1001
* Task – id 5001
* TaskAction – CREATED, APPROVED, EXECUTION_TRIGGERED, EXECUTED
* MemberActionToken – id 8001
* Message (secure link outbound) – id 1002
* Message (final confirmation) – id 1003

## 11.2 Entities Updated

* Member address fields
* Task status transitions:
  `PENDING_REVIEW → APPROVED → AWAITING_MEMBER_ACTION → EXECUTED`

---

# 12. Why This Flow Matters

This secure-link flow ensures:

* **Members control their own sensitive data updates**
* **Wineries remain protected from fraud**
* **Staff avoid copying addresses manually**
* **System maintains a clean, auditable trail**
* **Architecture works for SMS, email, and future voice flows**

This Golden Path is now the backbone of VinAgent.

Any new feature should follow this general pattern:

> Ingest → Normalise → Triage → Task → Human Review → Secure-Link → Member Confirmation → Update → Audit → Notify
