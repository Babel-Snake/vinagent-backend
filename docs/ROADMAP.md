# ROADMAP.md

This roadmap reflects the current state of the project rather than the original bootstrap plan.

## 1. Immediate Priority: Contract Coherence

Goal:

Keep the implementation, tests, and docs describing the same product.

Current focus areas:

* keep the simplified task status model (`PENDING`, `ACTIONED`, `REJECTED`) as the source of truth
* document detailed workflow state through `TaskAction` and `MemberActionToken`
* prevent old `APPROVED / EXECUTED / AWAITING_MEMBER_ACTION` assumptions from returning

## 2. Backend Coherence Pass

Goal:

Remove remaining mismatches around the live backend behaviour.

Important candidates:

* frontend/backend route naming mismatches for winery config endpoints
* analytics/reporting code that still assumes retired statuses
* debug-file writes left in controller paths

## 3. Workflow Hardening

Goal:

Make the current task model more reliable under real usage.

Workstreams:

* expand audit coverage for webhook-created tasks
* harden execution retry/error semantics
* improve secure-link lifecycle visibility in the dashboard
* tighten notification delivery reporting

## 4. AI Product Quality

Goal:

Improve winery-specific triage and reply generation.

Workstreams:

* better assignee selection
* stronger winery-context injection
* cleaner regeneration logic after notes/mentions
* better separation of classification vs drafting responsibilities

## 5. Winery Operations Surface

Goal:

Keep expanding VinAgent from inbox triage into a winery operations cockpit.

Current product surfaces already in the repo:

* task inbox and detail views
* winery configuration
* members
* staff
* notifications
* calendar
* analytics

Likely next steps:

* deeper booking integration
* better order/CRM integration
* richer SOP/contact usage in AI workflows

## 6. Production Readiness

Goal:

Turn the current workflow engine into a safer production system.

Workstreams:

* operational monitoring
* deployment hygiene
* secret management
* better test coverage around failure modes
* stronger reconciliation between dashboard behaviour and backend contracts

## 7. Rule for Future Planning

Plan work against the live architecture, not the earlier bootstrap-era phase plan. If the code, docs, and roadmap disagree, verify the code first and then update the docs/roadmap to match.
