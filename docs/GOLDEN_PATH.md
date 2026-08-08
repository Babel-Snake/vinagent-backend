# GOLDEN_PATH.md

This is the current canonical end-to-end flow for the live backend: an inbound member message creates a task, staff action it, the system issues a secure confirmation link, and the member completes the final step.

## 1. Scenario

Emma Clarke sends an SMS to Sunrise Ridge Winery:

> "Hi, I've moved. Please update my address to 12 Oak Street, Stirling 5152."

The system should:

1. ingest the SMS
2. create a `PENDING` task
3. create a structured step plan for the address workflow
4. let staff review and action it
5. create a secure token and send Emma a link
6. wait for Emma to confirm
7. update her address
8. leave an audit trail of what happened

## 2. Seed Data

### Winery

```text
id: 1
name: Sunrise Ridge Winery
timezone: Australia/Adelaide
contactPhone: +61123456789
```

### WinerySettings

```text
wineryId: 1
enableWineClubModule: true
enableSecureLinks: true
```

### Member

```text
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

### Staff User

```text
id: 7
role: manager
wineryId: 1
```

## 3. Step 1: SMS Webhook

Twilio posts to:

```http
POST /api/webhooks/sms
```

Payload:

```text
From=+61412345678
To=+61123456789
Body=Hi, I've moved. Please update my address to 12 Oak Street, Stirling 5152.
MessageSid=SM_GOLDEN_PATH_001
```

Result:

* the webhook is validated
* an inbound `Message` is stored
* member lookup matches Emma
* triage runs

## 4. Step 2: Triage Creates a Task

Triage classifies the message as an address-change workflow.

Representative task:

```json
{
  "type": "ACCOUNT_ADDRESS_CHANGE",
  "category": "ACCOUNT",
  "subType": "ACCOUNT_ADDRESS_CHANGE",
  "customerType": "MEMBER",
  "status": "PENDING",
  "priority": "normal",
  "suggestedChannel": "sms",
  "payload": {
    "newAddress": {
      "addressLine1": "12 Oak Street",
      "suburb": "Stirling",
      "state": "SA",
      "postcode": "5152",
      "country": "Australia"
    }
  }
}
```

Important current behaviour:

* webhook-created tasks now go through the shared task service
* the system writes `TaskAction(CREATED)` for ingestion-created tasks
* triage may attach an initial `TaskStep` plan to the task

## 5. Step 3: Staff Review the Queue

The dashboard calls:

```http
GET /api/tasks?status=PENDING
```

The manager reviews:

* the member
* the extracted payload
* the workflow step plan
* the suggested reply/channel
* any notes or assignment needed before actioning

## 6. Step 4: Manager Actions the Task

The manager sends:

```http
PATCH /api/tasks/5001
```

```json
{
  "status": "ACTIONED",
  "suggestedReplyBody": "Hi Emma, please confirm your address using this secure link."
}
```

Immediate effects:

* task update is saved
* `TaskAction(ACTIONED)` is written with the manager as actor
* `execution.service` is invoked

## 7. Step 5: Execution Creates a Secure Token

Because this is an address-change task and secure links are enabled:

1. payload is validated
2. `MemberActionToken` is created
3. the secure link is appended to the reply body if needed
4. the task is moved back to `PENDING`
5. `TaskAction(EXECUTION_TRIGGERED)` is written
6. the notification layer sends the SMS/email with the link

New links use the public frontend route with the bearer token in the URL
fragment:

```text
https://app.example.test/confirm-address#token=<opaque-token>
```

The fragment is not sent to the frontend server. The page reads it once,
removes it from browser history, and validates it in a JSON request body.

Representative token:

```text
id: 8001
taskId: 5001
memberId: 42
type: ADDRESS_CHANGE
channel: sms
target: +61412345678
usedAt: null
```

Representative task state after execution:

```text
status: PENDING
workflowState: WAITING
waitingOn: CUSTOMER
```

This is intentional. In the current build, `PENDING` can mean "awaiting member follow-up", not just "unreviewed by staff".

## 8. Step 6: Member Validates the Link

Emma opens the public page, which calls:

```http
POST /api/public/address-update/validate
Content-Type: application/json
```

```json
{
  "token": "<opaque-token>"
}
```

The API returns:

* member summary
* current address
* proposed address
* token expiry

The page uses the member's first name only, does not require staff
authentication, and maps invalid, expired, already-used, rate-limited, and
service failures to fixed non-sensitive messages.

## 9. Step 7: Member Confirms the Address

The public form submits:

```http
POST /api/public/address-update/confirm
```

```json
{
  "token": "<opaque-token>",
  "newAddress": {
    "addressLine1": "12 Oak Street",
    "suburb": "Stirling",
    "state": "SA",
    "postcode": "5152",
    "country": "Australia"
  }
}
```

Backend effects:

1. token is revalidated
2. member address fields are updated
3. token is marked used
4. linked task is set to `ACTIONED`
5. `TaskAction(ACTIONED)` is written with:

```json
{
  "action": "MEMBER_CONFIRMED_ADDRESS",
  "tokenId": 8001
}
```

## 10. Final State

### Message and Task State

* inbound `Message` exists
* `Task.status = ACTIONED`
* `Task.workflowState = COMPLETED` if no active steps remain
* `TaskAction` trail includes:
  * `CREATED`
  * staff `ACTIONED`
  * `EXECUTION_TRIGGERED`
  * member-confirmation `ACTIONED`

### Member State

```text
addressLine1: 12 Oak Street
suburb: Stirling
state: SA
postcode: 5152
country: Australia
```

### Token State

```text
usedAt: <timestamp>
```

## 11. Why This Matters

This flow is the clearest illustration of the current architecture:

* task status is coarse
* task workflow summary and `TaskStep` carry the current progress view
* audit events carry the detailed workflow history
* secure member actions are first-class
* human action happens before automation
* the backend is designed around safe, reversible operational steps rather than hidden direct mutation

If a new doc, client, or test assumes `APPROVED`, `AWAITING_MEMBER_ACTION`, or `EXECUTED`, it is describing the old model rather than the current build.
