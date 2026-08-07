# Operational Areas

## Purpose

Operational areas place work inside the part of a winery that owns or participates in it. Areas are tenant-defined; no winery, restaurant, provider, or department names are hardcoded.

The first release is intentionally single-site. `Winery` remains the current tenant/site boundary. The area tables use surrogate IDs and relational links, so a future `Organisation -> Location/Winery -> OperationalArea` layer can be added without changing task, notice, user-membership, or integration-event identities.

## Data model

### `OperationalArea`

- belongs to one `Winery`
- has a tenant-unique `name`
- supports `description`, `isActive`, and `sortOrder`
- inactive areas remain attached to historical records but cannot receive new placement

### `UserAreaMembership`

- joins a `User` to an `OperationalArea`
- `membershipRole`: `MEMBER | MANAGER`
- `isPrimary`: at most one primary membership per user, enforced by the service

`User.role` remains the global winery role. An area `MANAGER` is not promoted to winery-wide `manager`; their management authority is limited to the areas in the membership rows.

### Work placement

- `TaskArea` joins tasks to areas with `relationshipType: PRIMARY | LINKED`.
- `NoticeArea` joins notices to every target area.
- Notice audience rules (`all_staff`, role subset, or specific users) remain separate from area placement.

Tasks and notices have an explicit `areaScope`:

- `ORGANISATION`: no area links; preserves existing organisation-level behavior
- `AREAS`: requires at least one valid active area link

The explicit scope avoids interpreting an empty join table as both legacy, organisation-wide, and misconfigured. The migration defaults existing rows to `ORGANISATION`; no destructive backfill is required.

### Integration events

`IntegrationEvent` supports `suggestedAreaId`, `confirmedAreaId`, `areaConfidence` from `0` to `1`, and `areaMappingSource: RULE | MANUAL | ADAPTER | AI | DEFAULT`.

Provider adapters may suggest an area, but review confirms placement. Publishing a notice or creating a task carries the confirmed area and linked areas into the normal VinAgent record.

## Visibility and authority

Winery isolation is always applied first.

### Global winery manager/admin

- sees and manages all records in the winery
- creates organisation-wide or area-scoped work
- manages area definitions and user memberships

### Area manager

- sees work linked to their member/manager areas
- creates and manages tasks/notices only when every target area is one they manage
- may assign and close tasks in managed areas
- cannot create organisation-wide notices or manage area definitions/memberships

### Area member/staff

- sees tasks directly assigned to them
- sees unassigned organisation-wide tasks, preserving legacy behavior
- sees tasks and notices intersecting their memberships
- sees a specifically user-targeted notice even when it is outside their normal area set
- cannot re-scope existing records or manage other areas

Files, notice comments, task steps, linked task/notice summaries, and calendar-linked records inherit parent visibility. Direct record URLs use the same policy as list endpoints.

## API

All endpoints are under `/api/operational-areas` and require normal dashboard authentication.

- `GET /operational-areas`: active areas; manager/admin may request `includeInactive=true`; includes `myMembership`.
- `POST /operational-areas`: winery manager/admin only.
- `PATCH /operational-areas/:id`: winery manager/admin only; deactivate instead of deleting.
- `PUT /operational-areas/memberships/:userId`: winery manager/admin only; atomically replaces memberships.

Task and notice create/update payloads accept:

```json
{
  "areaScope": "AREAS",
  "primaryAreaId": 3,
  "linkedAreaIds": [4, 6]
}
```

Task and notice lists accept `areaId=<id>`, `areaId=organisation`, or `areaId=all`. Integration-event lists accept an area ID. Integration-event create/review payloads accept suggested/confirmed area metadata.

## UI

- Staff management contains area creation, activation/deactivation, and membership editing.
- Task creation supports organisation-wide, primary-area, and linked-area placement.
- Task filters and cards show operational placement.
- Notice creation supports area placement in addition to existing audience rules.
- Notice filters and cards show placement.
- Integration intake supports suggested areas, area filtering, confirmation, and linked areas during review.
- Winery configuration is visible to winery and area managers; shared organisation settings remain winery-manager controlled.
- Area Profiles stores public contact details, hours, directions, and service notes per area.
- Bookings selects an operational area and applies area-specific rules and booking types.
- Products keeps one shared winery catalogue and provides area-specific listings, price/stock overrides, featured state, and sales notes.
- Integrations keeps SMS/email and fallback connections at winery level, while booking, POS, CRM/Wine Club, and delivery connections may be overridden per area.
- Policies & FAQs separates shared winery knowledge from area-owned FAQs and SOPs. Shared knowledge remains available alongside the selected area's knowledge.
- Organisation keeps one reporting hierarchy and adds primary/linked area placement to contacts, including area filtering and scoped editing.

## Area configuration authority

- Winery managers/admins read and edit organisation configuration and every area.
- Area managers read non-secret winery configuration and edit profiles/bookings only for areas they manage.
- Area members do not gain Winery configuration access.
- Booking types with an `areaId` inherit that area's edit authority. Legacy booking types without an area remain winery-manager controlled.
- Area product listings inherit area edit authority. Area managers cannot change the canonical winery product; winery managers retain catalogue authority.
- Area integration overrides inherit area edit authority. All managers can read sanitized connection metadata; only the area manager or a winery manager can edit/test an override. Secret hashes are never returned.
- `WineryBookingsConfig` remains an organisation default; an area without its own booking config inherits that default until it saves an override.
- Missing area integration domains inherit the winery fallback. Area-specific webhook URLs route events directly to the configured area, and booking/CRM execution uses a task's primary-area override when present.
- FAQs and SOPs with no `areaId` remain shared and winery-manager controlled. Area-owned knowledge inherits that area's edit authority; ownership cannot be reassigned through normal edits.
- Organisation-wide contacts remain winery-manager controlled. An area manager may maintain a contact owned by their managed primary area; cross-area placement changes require authority over every new target area.

## Deployment

1. Back up the production database.
2. Run `npm run db:migrate` before deploying application instances.
3. Confirm the area tables exist, including `OperationalAreaIntegrationConfigs` and `WineryContactAreas`, `WineryBookingTypes.areaId` is available, FAQ/SOP `areaId` columns are available, and existing tasks/notices have `areaScope = ORGANISATION`.
4. Create tenant areas from Staff & Access, then assign user memberships.
5. Begin assigning new work to areas. Existing work remains visible under legacy organisation rules.

Do not use `scripts/sync-db.js` for production rollout; the migration is the deployment source of truth.

## Sidewood demo seed

After migrations have run, `npm run seed:sidewood` creates a repeatable operational-area demo. Existing Sidewood user credentials are preserved by default. When a new demo account is required and no credential override is configured, the seed generates a strong one-time manager password or shared staff access code and prints it once. `SIDEWOOD_MANAGER_PASSWORD` and `SIDEWOOD_STAFF_ACCESS_CODE` remain optional overrides for deliberately resetting the corresponding demo credentials.

Run `npm run seed:sidewood:projects` after the base Sidewood seed to add six idempotent Project demonstrations. They cover a dependency-blocked cross-area release, an at-risk hospitality event, an on-track area-manager Project, a completed 100% close-out, an organisation-wide planning Project, and a Festival collaboration led by Kirri under Owen across Restaurant, Cellar Door, and Marketing. The Festival example includes three genuinely delegated Project Tasks assigned into the collaborating areas. The Project seed also adds the small Request, Note, future Calendar milestones, and Festival work needed to demonstrate all five supported Project item types and scoped Project Lead authority.

For disposable migration rehearsals, set `SIDEWOOD_DB_ONLY=true` before running the seed. This creates deterministic local `firebaseUid` placeholders and does not create or update Firebase users. The option is rejected when `NODE_ENV=production` and must not be used for a live environment.

The Sidewood dataset includes:

- seven areas: Cellar Door, Wine Club, Restaurant, Logistics, Accounts, Head Office and Marketing
- eleven area-assigned users and seventeen memberships, including deliberate secondary memberships
- the existing Serena, Jacob, Nick, James and Joanna accounts as the Cellar Door team
- Kirri as the Restaurant area manager, using the same internal username/access-code login pattern as other staff
- an eleven-person reporting hierarchy, with Restaurant contact Kirri reporting directly to Owen while Restaurant remains operationally linked with Cellar Door
- seventeen contact-area links mirroring the demo users' primary and secondary operational responsibilities
- seven area-independent tasks, three linked-area tasks, seven area-independent notices, two linked-area notices and one organisation notice
- ten notice-task links covering both single-area and cross-area operational scenarios
- three pending operational requests, three operational records and six cross-item relations for testing area access, relation graphs and intelligence signals
- five pending integration events with routing suggestions for Restaurant, Wine Club, Logistics, Accounts and Cellar Door
- separate Cellar Door and Restaurant public profiles, booking rules, and booking types
- independent Cellar Door, Restaurant, and Wine Club product listings backed by the same canonical products
- independent demo connections for Cellar Door booking/POS, Restaurant booking/POS, Wine Club CRM, and Logistics delivery
- area-owned FAQ/SOP examples for Cellar Door, Restaurant, Wine Club, Logistics, Accounts, and Marketing

Owen is the winery-level manager. Serena and the other area leads retain the winery-level `staff` role and receive an area `MANAGER` membership, allowing the demo to exercise scoped authority instead of accidentally granting organisation-wide access.

The area seed upserts its records and replaces area memberships for its demo users, so rerunning it refreshes the demo without duplicating areas, users, tasks, notices, notice-task links, operational requests, operational records, cross-item relations or integration events. Apply local edits after seeding if they should not be replaced on the next seed run.

## Future multi-site extension

No multi-site behavior is included in this release. A future implementation can introduce an `Organisation` above `Winery` (treating wineries as locations), or add a nullable location relation to areas during a controlled migration. Existing area IDs and joins remain valid. Avoid making area names unique outside the current winery boundary or using names as routing keys.
