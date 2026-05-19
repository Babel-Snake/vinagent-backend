# FUTURE_PRODUCT_PASSES.md

This document captures the biggest product opportunities still worth pursuing after the recent workflow, identity, communication, outcome, execution, follow-up automation, and operational analytics passes.

It is intended to keep future planning anchored to the actual system goal:

`winery communication -> case creation -> guided execution -> durable customer and operational history`

## 1. Current Position

The current build is now strong in these areas:

* structured case handling through `Task`, `TaskStep`, and `TaskAction`
* conservative customer identity resolution, ranked review candidates, and merge tooling
* task-centric communication timeline support through linked inbound and outbound `Message` records
* webhook identity-resolution parity with manual external intake
* structured task outcome taxonomy on closed cases
* provider-backed execution results and outbound SMS/email parity
* deterministic post-closure follow-up automation through managed child tasks
* operational analytics for wait states, blockers, response latency, handoffs, identity-review load, and follow-up automation conversion

That makes the platform credible as an AI-assisted winery operations coordinator rather than just a message triage layer.

## 2. Recently Implemented Passes

The recent major passes now in the build are:

* task-owned communication timeline
* webhook identity-resolution parity
* structured task outcome taxonomy
* deeper execution integrations and outbound parity
* managed post-task follow-up automation
* richer operational analytics

These were the right sequence because they made the case record trustworthy before adding more automation on top.

## 3. Biggest Remaining Opportunities

### 3.1 Customer Lifecycle Promotion Rules

The system can now resolve, enrich, and merge customer records conservatively. The next leverage point is turning confirmed operational outcomes into richer customer lifecycle state automatically.

Opportunity:

* promote visitors into stronger customer/member records when bookings, orders, or repeated engagement confirm the relationship
* record normalized milestones such as first booking, first purchase, repeat contact, and unresolved lost enquiry
* use those milestones in AI context and follow-up automation

Why it matters:

* wineries care about moving people from enquiry to visit to purchase to club membership
* this would make the task system a better foundation for growth and retention, not just case handling

### 3.2 Execution Depth Beyond Current Provider Paths

Execution is materially stronger than before, but still uneven across task types and external systems.

Opportunity:

* broaden CRM writeback depth for orders and customer updates
* add stronger outbound email delivery tracking and provider-specific failure handling
* expand booking and account flows where policy-driven automation is safe

Why it matters:

* stronger writeback closes the loop between operational handling and source-of-truth systems
* deeper execution increases leverage without requiring staff to leave the platform for routine work

### 3.3 Exact State-Duration Analytics

The analytics pass now approximates waiting and blocked age from the latest task update timestamp. That is useful for MVP visibility, but exact duration reporting would require first-class workflow-state transition events.

Opportunity:

* store explicit state-entered timestamps for `WAITING`, `BLOCKED`, and `IN_PROGRESS`
* report exact customer-wait time versus staff-wait time
* build SLA and escalation rules from those exact durations

Why it matters:

* exact state duration is needed before introducing hard SLA commitments
* it would make analytics and escalation automation more defensible for larger teams

## 4. Recommended Delivery Order

With operational analytics now implemented, the next highest-leverage order is:

1. customer lifecycle promotion rules
2. deeper provider execution coverage
3. exact state-duration analytics and SLA automation

This keeps the next pass focused on turning confirmed operational outcomes into durable customer lifecycle value.

## 5. Product Principle

The system should keep moving toward one operational truth:

* one task is one case
* one case owns its workflow
* one case owns its communication timeline
* one case owns its execution outcomes
* one case should be able to trigger the next case when follow-up is genuinely required

That is the path from "AI triage tool" to "winery operating system."
