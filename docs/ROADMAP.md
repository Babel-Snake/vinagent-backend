# ROADMAP.md

This roadmap reflects the current state of the project rather than the original bootstrap plan.

## 1. Immediate Priority: Product Learning From Live Usage

Goal:

Use the now-coherent task workflow to learn from real winery operations.

Current focus areas:

* keep the simplified task status model (`PENDING`, `ACTIONED`, `REJECTED`) as the source of truth
* use operational analytics to watch wait states, blockers, response latency, handoffs, identity-review load, and follow-up automation conversion
* turn confirmed task outcomes into richer customer lifecycle state

## 2. Backend Coherence Pass

Goal:

Keep the backend, frontend, tests, and docs aligned as the workflow system grows.

Important candidates:

* exact workflow-state duration tracking for future SLA reporting
* continued test coverage for analytics and follow-up automation edge cases
* provider-specific execution failure and retry reporting

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

* customer lifecycle promotion rules from confirmed bookings, orders, and repeated engagement
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
