# DOMAIN_MODEL.md

This document describes the current backend domain model and the workflow semantics that matter most in the live build.

## Operational object grammar

The product now exposes four staff-facing operational concepts:

- Task: action that must be completed.
- Notice: information that must be communicated.
- Request: approval, decision, help, information, or resources that must be supplied.
- Note: searchable operational memory, implemented as `OperationalRecord`.

Tasks and Notices retain their existing mature tables. Requests and Operational Records are additive domains using the same winery and operational-area security boundary.

### OperationalRequest

`OperationalRequest` stores title/body/original input, subtype, priority, target user, due date, decision state/response, source, AI suggestion/confidence, human confirmation, and actor timestamps.

States are `PENDING | APPROVED | REJECTED | CANCELLED`. Only a pending Request can be edited or decided. A requested person or relevant manager may approve/reject; the creator or relevant manager may cancel.

`OperationalRequestArea` provides primary and linked area placement. `OperationalItemAuditEvent` records creation, edits, and decisions.

### OperationalRecord

`OperationalRecord` stores a title, body, original input, record type, source/reference, occurrence time, optional customer link, structured metadata, AI suggestion/confidence, and human confirmation.

Operational Records do not have a completion status. Follow-up work will be represented by a separate linked Task or Request rather than mutating the Note into another type.

`OperationalRecordArea` provides primary and linked area placement. `OperationalRecordRecipient` optionally directs a Note to multiple active users in the same winery. Direction controls personal attention surfaces, while the existing winery/area rules remain the visibility boundary. Area-scoped recipients must be able to view at least one selected area. `OperationalItemAuditEvent` records creation and edits, including recipient changes.

### OperationalItemRelation

`OperationalItemRelation` links typed `TASK | NOTICE | REQUEST | NOTE` identities without changing the source record. Supported relationships include `CREATED_FROM`, `RELATES_TO`, `BLOCKS`, `DUPLICATES`, `GENERATED_TASK`, `FOLLOW_UP_FOR`, and `COMPLETION_RECORD`.

Conversions are additive. Request-to-Task requires an approved Request; Note-to-Task preserves the Note. Repeated conversions return the existing generated Task rather than creating duplicates.

### OperationalItemComment and attachments

`OperationalItemComment` provides threaded comments for Requests and Notes. Any user who can view the parent may comment. Authors can delete their own comments; relevant managers can moderate them.

The polymorphic `Attachment` entity types now include `REQUEST` and `NOTE`. Parent item visibility is enforced before list, upload, download, or deletion. Attachment actions are also written to the operational-item audit history.

### Unified operations read model

The four operational domains remain their own sources of truth. `GET /api/operations` builds a normalized, read-only feed after invoking each domain's tenant, audience, and area visibility rules.

The read model returns a typed identity, title, preview, state, priority, areas, event timestamp, due/expiry timestamp, owner/author summary, and a source URL. Search delegates to each domain so hidden records are excluded before cross-object merge, sorting, counts, and pagination.

The initial implementation uses bounded relational queries and application-level merging. A dedicated search index should only replace it after measured volume or latency justifies the additional synchronization infrastructure.

## 1. User

Represents an authenticated human user of the platform.

Key fields:

* `id`
* `firebaseUid`
* `email`
* `displayName`
* `isActive`
* `role`: `admin | manager | staff`
* `responsibilities`
* `wineryId`

Relationships:

* belongs to `Winery`
* can create/update/assignee tasks
* can author `TaskAction`
* receives `Notification`

## 2. Winery and Winery Settings

### 2.1 Winery

Represents the winery's core identity and contact details.

Current ecosystem around a winery:

* `Winery`
* `WinerySettings`
* `WineryBrandProfile`
* `WineryBookingsConfig`
* `WineryPolicyProfile`
* `WineryIntegrationConfig`
* `WineryProduct`
* `WineryFAQItem`
* `WinerySop`
* `WineryContact`
* `WineryContactArea`
* `OperationalAreaProfile`
* `OperationalAreaBookingsConfig`
* `AreaProductListing`
* `OperationalAreaIntegrationConfig`

Organisation identity remains on `Winery`. `OperationalAreaProfile` stores public contact details, opening hours, directions, and service notes for one area. `OperationalAreaBookingsConfig` stores booking rules for one area. Both are tenant-scoped and have a unique `areaId`.

`WineryBookingsConfig` remains the organisation default for compatibility. `WineryBookingType.areaId` is nullable: a populated value gives the booking type an area owner, while `null` identifies a legacy organisation-level booking type.

`AreaProductListing` joins one canonical `WineryProduct` to one `OperationalArea`. It stores area availability, optional price/stock overrides, featured state, and area sales notes. Product identity, vintage, tasting notes, awards, and default commercial values remain on `WineryProduct`, preventing duplicate catalogues from drifting apart.

`OperationalAreaIntegrationConfig` stores provider connections for an area's `booking`, `pos`, `crm`, and `delivery` domains. Communication channels and winery fallback connections remain on `WineryIntegrationConfig`. A missing area domain inherits the winery fallback. Area connections receive distinct webhook URLs/secrets, and booking/CRM task execution resolves the primary task area's override before falling back to `WinerySettings`.

`WineryFAQItem.areaId` and `WinerySop.areaId` are nullable. A null value means shared winery knowledge; a populated value gives the FAQ or SOP one operational-area owner. Existing rows remain shared. AI context keeps shared knowledge at winery level and adds area-owned knowledge only under the relevant area.

`WineryContactArea` joins organisation contacts to operational areas using `PRIMARY | LINKED`. A contact may have at most one primary link by service policy and any number of linked responsibilities. Contacts with no links are organisation-wide. `WineryContact.reportsToId` remains independent of area placement, preserving one reporting hierarchy across the winery. Area-scoped AI context includes relevant contacts plus their reporting-manager chain.

### 2.2 WinerySettings

Controls feature gating and provider selection.

Key fields:

* `tier`: `BASIC | ADVANCED`
* `enableBookingModule`
* `enableWineClubModule`
* `enableOrdersModule`
* `enableSecureLinks`
* `enableInsights`
* `enableVoice`
* `bookingProvider`
* `bookingConfig`
* `crmProvider`
* `crmConfig`
* `identityMatchingConfig`
* `operationalIntelligenceConfig`: per-winery scheduler participation, suggested-signal thresholds, and review reminder windows. The server-level scheduler loop is still controlled by environment flags; this field controls how a participating winery is evaluated.

`OperationalIntelligenceConfigAuditEvent` records manager changes to `operationalIntelligenceConfig`, including the actor, optional preset, changed field paths, and before/after snapshots.

## 3. Member

Represents a winery customer/member.

Important fields:

* `id`
* `wineryId`
* `firstName`
* `lastName`
* `email`
* `phone`
* address fields
* profile/preference fields used by the dashboard and AI context

Operationally, `Member` is also the canonical surviving record for customer merges.

Relationships:

* belongs to `Winery`
* has many `Message`
* has many `Task`
* can be targeted by `MemberActionToken`

When duplicates are merged:

* downstream `Task`, `Message`, and `MemberActionToken` relations are reassigned
* engagement metrics are consolidated
* tags are unioned
* notes retain merge context

## 4. Message

Normalized inbound or outbound communication.

Important fields:

* `id`
* `wineryId`
* `memberId`
* `taskId`
* `source`: `sms | email | voice`
* `direction`: `inbound | outbound`
* `subject`
* `body`
* `rawPayload`
* `externalId`
* `receivedAt`

Relationships:

* belongs to `Winery`
* may belong to `Member`
* may belong to a `Task`

Operationally, `Message` is now the communication record for the case timeline, not just an ingestion artifact.

## 5. Task

The central workflow record in the current build.

### 5.1 Core Classification Fields

Preferred fields:

* `category`
* `subType`
* `customerType`

Legacy compatibility field:

* `type`

The implementation still reads `type` in some execution paths, but new logic should prefer `category` and `subType`.

### 5.2 Status

Current enum:

* `PENDING`
* `ACTIONED`
* `REJECTED`

This enum is intentionally coarse. Fine-grained progress is represented through task workflow summary fields, linked `Message` rows, `TaskStep` rows, `TaskAction` rows, and, for secure workflows, `MemberActionToken`.

### 5.3 Workflow Summary Fields

Current task-level workflow fields:

* `workflowState`: `NOT_STARTED | IN_PROGRESS | WAITING | BLOCKED | COMPLETED | CANCELLED`
* `waitingOn`: `NONE | STAFF | CUSTOMER | MANAGER | EXTERNAL`
* `nextStepSummary`
* `blockedReason`
* `payload.manualIntake` may hold structured external-intake identity state
* `payload.executionResults` holds the structured external effects recorded during execution
* `payload.orderWriteback` stores the latest order CRM-writeback snapshot when applicable
* `payload.followUpAutomation` marks an auto-managed child follow-up case when the task was generated from parent closure logic
* `dueAt`
* `resolvedAs`: `COMPLETED | WORKAROUND | ESCALATED | DECLINED | DUPLICATE | NO_ACTION`
* `resolutionType`: normalized operational closure reason
* `customerOutcome`: normalized customer-facing result
* `resolutionSummary`
* `followUpRequired`
* `followUpDueAt`
* `followUpSummary`
* `resolvedAt`

These fields are the high-level progress view for list/detail surfaces. They do not replace the step list.

### 5.4 Other Important Fields

* `payload`
* `suggestedChannel`
* `suggestedReplySubject`
* `suggestedReplyBody`
* `suggestedAction`
* `suggestedRecipientEmail`
* `suggestedCc`
* `requiresApproval`
* `priority`: `low | normal | high`
* `sentiment`: `POSITIVE | NEUTRAL | NEGATIVE`
* `memberId`
* `messageId`
* `createdBy`
* `updatedBy`
* `assigneeId`
* `parentTaskId`

### 5.5 Relationships

* belongs to `Winery`
* may belong to `Member`
* may belong to `Message`
* may belong to creator/updater/assignee `User`
* may belong to a parent `Task`
* may have many child `Task` records
* has many `Message`
* has many `TaskStep`
* has many `TaskAction`

### 5.6 Current Workflow Interpretation

Status is not a full workflow state machine.

Examples:

* a new triaged task is `PENDING`
* the same task can also have `workflowState = NOT_STARTED` or `WAITING`
* ordered `TaskStep` rows describe the work required inside the task
* linked inbound and outbound `Message` rows describe the communication thread inside the case
* external tasks can carry identity states such as `AUTO_LINKED`, `AUTO_CREATED`, or `REVIEW_REQUIRED`
* review-required tasks can also carry multiple ranked candidate customers inside `payload.manualIntake.suggestedCandidates`
* a manager can mark it `ACTIONED`
* once a task is closed, normalized outcome fields describe what actually happened
* those closure fields can also spawn a managed child follow-up task when more work is explicitly needed
* an address-change task may then be set back to `PENDING` while waiting for member confirmation
* after the member confirms, the task returns to `ACTIONED`

## 6. TaskStep

Structured workflow unit inside a task.

### 6.1 Core Fields

* `title`
* `description`
* `stepType`: `INTERNAL | CUSTOMER_MESSAGE | CUSTOMER_WAIT | APPROVAL | EXTERNAL | EXECUTION | FOLLOW_UP | OTHER`
* `status`: `PENDING | IN_PROGRESS | BLOCKED | COMPLETED | SKIPPED | CANCELLED`
* `waitingOn`
* `sortOrder`
* `ownerUserId`
* `dueAt`
* `blockedReason`
* `completionNotes`
* `completedAt`
* `metadata`
* `createdBy`
* `updatedBy`

### 6.2 Relationships

* belongs to `Task`
* may belong to an owner `User`

### 6.3 Usage Rule

Use `TaskStep` for staged work inside one case.

Use parent/child tasks when the work becomes a separate case with its own lifecycle.

The main live example is managed post-closure follow-up automation. Those follow-up cases are created as child tasks so they can be assigned, delayed, actioned, or cancelled independently without overloading the parent case status.

## 7. TaskAction

Immutable audit trail for changes made to a task.

Current enum in the model:

* `CREATED`
* `ACTIONED`
* `REJECTED`
* `EXECUTION_TRIGGERED`
* `UPDATED_PAYLOAD`
* `NOTE_ADDED`
* `MANUAL_CREATED`
* `MANUAL_UPDATE`
* `OUTCOME_RECORDED`
* `EXECUTION_RECORDED`
* `MEMBER_ENRICHED`
* `ASSIGNED`
* `LINKED_TASK`
* `STEP_CREATED`
* `STEP_UPDATED`
* `STEP_COMPLETED`
* `STEP_DELETED`

Important notes:

* the enum is broader than the currently emitted set
* most live workflows emit `MANUAL_CREATED`, `MANUAL_UPDATE`, `ACTIONED`, `REJECTED`, `EXECUTION_TRIGGERED`, `NOTE_ADDED`, `ASSIGNED`, and `LINKED_TASK`
* `ACTIONED` is still used for operator closure and some execution-specific success markers; inspect `details.action` when you need finer meaning
* provider-level execution details now live in `EXECUTION_RECORDED` audit entries and `payload.executionResults`
* normalized closure semantics now live on the `Task` itself and are captured in `OUTCOME_RECORDED` audit entries when they change
* managed follow-up creation, update, and cancellation are represented through `LINKED_TASK` entries on the parent plus normal lifecycle entries on the child task

Examples of `details.action` values used today:

* `ORDER_WRITEBACK`
* `BOOKING_CREATED`
* `MEMBER_CONFIRMED_ADDRESS`

## 8. MemberActionToken

Secure single-use token used for member self-service.

Current main use case:

* address confirmation / update

Key fields:

* `id`
* `memberId`
* `wineryId`
* `taskId`
* `type`
* `channel`
* `token`
* `target`
* `payload`
* `expiresAt`
* `usedAt`

Relationships:

* belongs to `Member`
* belongs to `Winery`
* may belong to `Task`

## 9. Classification Vocabulary

Current category enum:

* `BOOKING`
* `ORDER`
* `ACCOUNT`
* `GENERAL`
* `INTERNAL`
* `SYSTEM`
* `OPERATIONS`

Current customer type enum:

* `MEMBER`
* `VISITOR`
* `UNKNOWN`

`subType` is intentionally string-based so the classification vocabulary can expand without a schema change.

Common current examples:

* `ACCOUNT_ADDRESS_CHANGE`
* `ACCOUNT_PAYMENT_ISSUE`
* `BOOKING_NEW`
* `ORDER_SHIPPING_DELAY`
* `OPERATIONS_SUPPLY_REQUEST`
* `GENERAL_ENQUIRY`

## 10. Practical Source of Truth

For schema-level truth, use the Sequelize models under `src/models`.

For workflow truth, read these together:

* `src/services/taskService.js`
* `src/services/execution.service.js`
* `src/services/addressUpdateService.js`
* `docs/TASK_WORKFLOW_PLAN.md`

That combination defines how the current backend really behaves.

## 11. Analytics Semantics

Operational analytics are derived from the same case records rather than a separate reporting schema.

Current analytics sources:

* `Task` for workflow state, waiting owner, due dates, outcomes, identity metadata, and parent/child follow-up cases
* `TaskStep` for period step-status progress
* `TaskAction` for assignment and step-owner handoff counts
* `Message` for first-response latency across task communication timelines
* `Member` for customer source, loyalty, spend, and lifecycle counts

Waiting and blocked age are currently approximated from the open task's latest update timestamp. That is useful for MVP management visibility, but exact state-duration analytics would require explicit workflow-state transition timestamps.

## 12. Operational Areas

Operational placement is represented by `OperationalArea`, scoped to the current `Winery` tenant. Users join areas through `UserAreaMembership`; tasks use `TaskArea`; notices use `NoticeArea`.

Tasks and notices explicitly distinguish `areaScope = ORGANISATION | AREAS`. Existing records are organisation-scoped. Area-scoped tasks have one primary link and may have linked areas. Notice area targeting composes with the existing audience rules.

Integration events can store suggested and confirmed area IDs, confidence, and mapping source. Review carries confirmed placement into the normal task or notice.

`IntegrationEventItem` is the multi-result edge from an intake event to a `TASK | NOTICE | REQUEST | NOTE`. It records the target ID, a per-event idempotency key, whether the target was created or linked, and the reviewing actor. A unique event/type/target constraint prevents duplicate links; a unique event/key constraint makes batch identities stable. The legacy singular related-record pointer mirrors the first result only.

## Notice acknowledgements

Acknowledgement is a Notice capability rather than a top-level operational object. A Notice opts in with `requiresAcknowledgement` and may set `acknowledgementDueAt`. `NoticeAcknowledgement` records one immutable read confirmation per notice/user pair.

Expected recipients are calculated from active winery users, directed audience rules, and area access. Specific-user targeting retains its existing direct-access behavior. Managers may inspect recipient completion only for notices they can manage; ordinary users see only aggregate state and their own acknowledgement.

## Derived operational intelligence

Request aging, classification corrections, conversion outcomes, recurrence candidates, and type/area trend comparisons are read models rather than new source-of-truth entities. Aging uses current pending Requests. Classification compares stored AI suggestion and human confirmation. Conversion outcomes follow `GENERATED_TASK` relationships to the authoritative Task state.

Recurrence candidates are explainable advisory clusters built from normalized significant terms. Each result carries its source object links and period boundaries. The heuristic deliberately excludes Tasks generated from Request/Note conversions and never automatically merges, escalates, or creates records.

`OperationalIntelligenceSignal` is the durable review wrapper for an advisory finding. It stores winery scope, optional area scope, signal type, severity, status, title/summary, stable fingerprint, stable `dedupeKey`, evidence JSON, reporting period, reviewer state, optional review owner/due date, optional suggested action text, materialization metadata, and optional `actionTaskId`. It is not the analytical source of truth; the underlying Tasks, Notices, Requests, Notes, and relations remain authoritative. Analytics can emit non-persisted `suggestedSignals`; managers or scheduled runs can materialize them into saved review records. Duplicate materialization across adjacent reporting windows updates or suppresses the existing open/acknowledged signal rather than creating noisy copies. A signal can create a Task only through an explicit manager/admin action, and repeated action calls reuse the existing Task.

Authorization is inherited by comments, files, task steps, linked records, and calendar surfaces. See `docs/OPERATIONAL_AREAS.md` for the policy and API contract.

## Projects

`Project` is the optional coordination container for a defined cross-record outcome. Core fields are `title`, `intendedOutcome`, optional `businessContext`, `status`, `areaScope`, accountable `ownerUserId`, planned/target/actual dates, Project-level risk and review date, completion reason, tenant, creator, and updater.

Relationships:

* `ProjectArea` links one primary and optional additional operational areas.
* `ProjectParticipant` links active winery users as `PARTICIPANT` or `STAKEHOLDER` and stores their Project-notification preference.
* `ProjectItem` is the unique typed edge to a `TASK | REQUEST | NOTICE | NOTE | CALENDAR_EVENT`; it stores required, milestone, and sort metadata without copying source workflow state.
* `ProjectTaskDependency` records one Task prerequisite edge within a Project. Both endpoints must already be linked Tasks, and cycle creation is rejected.
* `ProjectAuditEvent` stores immutable significant Project mutations with actor, before/after snapshots, and contextual metadata.
* `Attachment(entityType = PROJECT)` provides Project files through the shared attachment service.

Project lifecycle status is `PLANNED | ACTIVE | ON_HOLD | COMPLETED | CANCELLED`. Health is not stored; it is derived as `ON_TRACK | AT_RISK | BLOCKED | OVERDUE` for open Projects. Progress is null without required Tasks and otherwise counts only required Tasks whose authoritative `workflowState` is `COMPLETED`.

Visibility follows winery and operational-area policy. Global managers see and govern all winery Projects. Area managers govern Projects wholly inside areas they manage. A governing user may appoint an active same-winery user from a participating area as `leadUserId`; `leadGrantedByUserId` and `leadGrantedAt` retain the grant provenance. The Project Lead reports to the accountable owner and can coordinate only that open Project. Lead authority excludes owner/lead changes, participating-area changes, completion, cancellation, reopening, and completion overrides. Owners, leads, creators, participants, organisation users, and users sharing a Project area may view according to policy.

Every ordinary linked child record is independently re-authorised before its metadata is returned. Project-created delegated Tasks are distinguished by `ProjectItem.linkType = DELEGATED_WORK`. The current Project Lead may view and mutate those Tasks even when another department owns them; ordinary `REFERENCE` links never grant access. Delegated Tasks persist their accountable Project owner as `Task.createdBy`, so revoking or replacing the Project Lead immediately removes cross-area lead access without changing the assignee's access or deleting the Task.
