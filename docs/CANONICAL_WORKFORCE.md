# Canonical Workforce and Booking Coverage

Status: additive provider-neutral staff identity, role/skill, roster, availability, complete-window evidence,
booking demand mappings, coverage context, and managed gap-work lifecycle implemented; native workforce
adapters, workforce authority activation, live events, and provider writes remain disabled

Last reviewed: 2026-08-20

## Purpose

VinAgent needs to determine whether a booking or event has the right people, not merely whether any shift row
exists. The canonical workforce slice separates staff identity, system authority, roster facts, winery-owned
skills, and coverage evidence:

- User remains the authenticated VinAgent identity and source of login, role, and area authority.
- StaffIdentity is the canonical workforce person and may optionally resolve to one User and/or one Winery
  Contact.
- RoleSkillDefinition is the winery-owned role/skill vocabulary.
- StaffRoleSkill is a manager-confirmed qualification or role assignment.
- RosterShift is one provider-neutral shift with exact person, location, area, role, and complete skill
  mappings.
- StaffAvailabilityEvent is a bounded availability/leave interval without private free text.
- WorkforceCoverageObservation proves that a source returned a complete roster/availability window.
- WorkforceDemandMapping translates exact Booking Type or Booking Requirement codes into headcount,
  role/skill, scope, and preparation buffers.

Migration 20260821600000-create-canonical-workforce.js creates this graph additively.

## Identity and authority boundary

External roster identities never create Users, grant authentication, assign the global admin/manager/staff
role, or add Operational Area membership. A Staff Identity can remain unresolved from a User while still
counting as source-asserted roster coverage. It can be assigned VinAgent work only after a manager explicitly
links it to an active same-winery User.

Manager identity changes validate the User and Winery Contact tenant, enforce one-to-one links, use UUID
request IDs, and write append-only IntegrationOperationAuditEvent evidence. A User and Winery Contact already
attached to different identities cannot be silently combined.

## Projection contracts

Fixture/native translators use three strict contracts:

- roster-shift-shadow.v1
- staff-availability-shadow.v1
- roster-coverage-shadow.v1

All require an active same-winery WORKFORCE connection scope. Shift projection requires an explicit active
Staff Identity; resolved location, area, ROLE, and SKILL mappings must point to exact active same-winery
records. Resolution status and ID must agree. Shift times must be ordered, skills are a complete set, source
updates are ordered, and provider extensions recursively reject credentials, contact/address data, birth
dates, medical/health data, leave reasons, free text, and notes.

The current shift/availability key is its connection-scoped External Resource Reference. Replaying the same
source state refreshes observation time without creating another row. Older source state is ignored with an
OUT_OF_ORDER issue. Different content at the same provider-update time marks current quality CONFLICTING,
preserves prior evidence, and creates a blocking SOURCE_CONFLICT issue.

Availability stores only an allowlisted type/status and optional operational reason category. It does not
store a person's medical note or free-form leave explanation.

## Complete coverage evidence

Absence of shifts is not proof of understaffing. A provider read must emit a complete coverage observation
whose window encloses the operational interval. The observation records:

- exact or winery-wide location/area scope;
- covered start/end;
- assertion time and explicit stale time;
- source revision/hash;
- completeness and projection quality.

booking.coverage.v1 can return reliable COVERED or GAP only when a non-conflicting, complete observation covers
every required interval, is inside the requested age bound, has not reached its stale time, and is not
implausibly future-dated. Missing evidence returns UNKNOWN; expired evidence returns STALE.

## Booking demand and calculation

Managers map exact, non-sensitive canonical Booking facts:

    Booking Type / operational Booking Requirement code
      -> audited WorkforceDemandMapping
      -> effective area/location and buffered booking interval
      -> required ROLE or SKILL headcount
      -> fresh complete coverage observation
      -> qualifying published shifts minus approved unavailability
      -> booking.coverage.v1

Connection-scoped mappings override equivalent winery-wide mappings. Headcount is the ceiling of source
quantity times the configured multiplier. Restricted Booking Requirements are excluded.

A qualifying shift must be published, active for the full buffered interval, in the exact effective
area/location, non-deleted, non-conflicting, and attached to an active Staff Identity. ROLE demand matches the
shift role. SKILL demand matches either an explicitly resolved shift skill or an active, valid,
manager-confirmed Staff Role/Skill assignment. Approved/source-asserted unavailable, leave, or sick-leave
overlap removes that person from the count.

The context returns each demand, evidence/freshness, required and rostered counts, bounded staff identity/User
resolution, and linked open work. booking.readiness.v1 now includes the coverage summary instead of a
hard-coded unimplemented result.

## Managed staffing-gap work

Managers can install booking.workforce_coverage_gap.v1 from the existing automation template catalogue. It
creates a draft rule definition that:

- listens for a future activated booking.workforce_coverage_changed event;
- enriches through booking.coverage.v1;
- acts only on a reliable GAP;
- avoids an existing coverage-gap Task/Binding;
- creates an internal, designated-assignee staffing Task due before the Booking; and
- links generated work to the Booking through an Automation Resource Binding.

The lifecycle updates managed fields while a reliable gap changes, cancels untouched pending work when
coverage is restored or the Booking is cancelled, annotates instead of mutating when coverage becomes
unknown/stale, and preserves staff-edited or progressed work.

Installing this template neither activates it nor enables WORKFORCE authority. No live workforce event is
emitted yet.

## Manager API

All routes are manager/admin-only and winery-scoped:

- GET or POST /api/integration-management/staff-identities
- GET or POST /api/integration-management/role-skill-definitions
- POST /api/integration-management/staff-role-skills
- GET /api/integration-management/roster-shifts
- GET /api/integration-management/staff-availability
- GET or POST /api/integration-management/workforce-demand-mappings
- GET /api/integration-management/bookings/:id/coverage

Roster and availability reads omit source hashes and provider extensions. Staff identity reads expose only a
bounded User identity/role/activity summary and do not return email, phone, authentication data, or Contact
details.

## Shadow and activation boundary

All projection and coverage results remain automationEligible false. Fixture data is sufficient to test the
schema, mapping, completeness, context, template, and lifecycle without real provider credentials.

Before live roster changes may create or cancel work, a separate activation slice must add:

1. provider conformance fixtures and a selected native read-only translator (Deputy remains only a candidate);
2. polling/reconciliation plus webhook recovery, including complete-window semantics;
3. workforce field-group authority, readiness preview, manager activation, and watermark;
4. non-retroactive coverage-change events only when an activated Booking's reliable conclusion materially
   changes;
5. drift/health reporting for unresolved people/roles/skills, stale windows, and source conflicts; and
6. a separately approved command layer for roster/leave writes, if ever required.

Until then, the workforce graph explains readiness and supports human review but cannot change the roster or
autonomously create staffing work.
