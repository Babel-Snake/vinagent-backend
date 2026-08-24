# Canonical Fulfilment and Delivery

Status: additive provider-neutral shipment shadow graph, privacy-safe delivery exception context, managed
exception-work lifecycle, and manager-installable draft rule implemented; provider adapters, fulfilment
activation, live events, and external carrier commands remain disabled

Last reviewed: 2026-08-20

## Purpose

VinAgent needs one operational view of an order or Wine Club allocation after it leaves the winery, regardless
of whether postage is supplied by Australia Post, StarTrack, Shippit, a commerce platform, or another carrier.
The canonical fulfilment slice stores facts in winery language and keeps provider translation at the edge:

- `Shipment` is the current provider-neutral delivery and its explicit customer, order, allocation, and
  restricted-address relationships.
- `ShipmentPackage` is a physical parcel within that delivery.
- `ShipmentItem` is a complete current package-item projection with an optional exact Product Variant,
  Sales Order Line, and quantity/unit.
- `ShipmentTrackingEvent` is immutable carrier history.

Migration `20260821500000-create-canonical-fulfilment.js` creates the graph. It is additive: it does not
replace Sales Orders, Wine Club Allocations, Customer Addresses, external carrier records, or existing task
workflows.

## Adapter contract

Provider translators emit the strict `shipment-shadow.v1` contract. Projection requires:

- an active same-winery `FULFILMENT` connection scope;
- stable shipment, package, item, and tracking-event keys;
- source revision, source update time, assertion time, and observation time;
- an explicit canonical shipment status and provider status;
- complete package and item sets for current-state reconciliation;
- explicit relationship status/ID pairs rather than inferred customer, order, allocation, address, line, or
  variant links; and
- explicit item quantity and unit.

Every resolved relationship is checked for tenant ownership and internal consistency. An order or allocation
cannot be attached to a different Member; a line cannot belong to a different Sales Order; and a Product
Variant cannot be silently inferred from a description. Unresolved and ambiguous relationships remain
explicit states rather than guessed joins.

The source key is `(wineryId, authorityConnectionId, externalId)`. A newer complete snapshot updates one
current Shipment, deactivates packages/items absent from the new complete set, and appends only new immutable
tracking events. An exact replay is a no-op. Older observations are rejected as out of order; reuse of a
timestamp or event key with different facts creates a blocking conflict issue and preserves prior evidence.
Another source cannot silently claim an already resolved tracking identity.

## Privacy boundary

Fulfilment commonly carries unusually sensitive data. The canonical contract and manager surface therefore
apply these rules:

- full tracking references are never stored; VinAgent stores a salted SHA-256 correlation hash and last four
  characters for masked display;
- a provider's external resource ID must be its shipment identifier, never the tracking number;
- delivery addresses are held only through an explicit restricted Customer Address link;
- address lines, recipient contact details, credentials, secrets, payment details, bank details, and raw
  tracking values are recursively rejected from provider extensions and metadata;
- exception context contains country/region only and never returns the restricted address;
- manager reads omit correlation hashes and provider-extension objects.

Source observations keep the sanitized contract evidence required for replay/conflict handling. They must
never be used as a route around these restrictions.

## Delivery exception context

`shipment.exception.v1` returns a bounded, schema-validated view for one same-winery Shipment:

- current status, carrier/service, delivery promises and timing;
- explicit Member, Sales Order, and Wine Club Allocation resolution;
- current exception category/code/summary and derived severity;
- affected items with canonical variant resolution;
- linked open Task work; and
- observation freshness and explanation codes.

Delivered, returned, or cancelled shipments cannot retain an active exception. A later successful tracking
event clears the current exception while immutable history remains. Timing is derived from promised,
estimated, and delivered timestamps.

Freshness fails closed. An observation older than the requested bound is `STALE`, and an observation
more than five minutes in the future is also `STALE` with
`SHIPMENT_OBSERVATION_IN_FUTURE`. Automation conditions require `FRESH` context.

## Managed exception work

Managers can install `shipment.exception_resolution.v1` from the automation template catalogue. The
template creates a draft internal `ORDER / DELIVERY_EXCEPTION` Task definition that:

- triggers from a future `shipment.exception` canonical event;
- enriches with `shipment.exception.v1`;
- requires fresh context, an active exception, and no existing resolution Task;
- uses a configured same-winery staff assignee and response-time offset; and
- links generated work to the Shipment through an Automation Resource Binding.

The template does not activate its rule, enable fulfilment authority, contact the customer, or call a carrier.
Once an activated fulfilment event path exists, the generic managed-work lifecycle can update declared
system-owned Task fields while the exception changes, cancel untouched pending work when the exception clears,
and preserve/annotate work that a person has edited or progressed. Repeated carrier events converge on the
same managed work rather than creating duplicate Tasks.

## Manager API

The current manager/admin-only, winery-scoped read surface is:

- `GET /api/integration-management/shipments`
- `GET /api/integration-management/shipments/:shipmentId`

The list supports status, Member, Sales Order, Wine Club Allocation, authority connection, exception state,
and bounded dispatch/delivery-time filters. Detail returns active packages/items, bounded ordered tracking
history, masked tracking display, and current relationships. Restricted addresses, full tracking references,
hashes, and provider extensions are excluded.

Automation templates use the existing manager endpoints:

- `GET /api/automations/templates`
- `POST /api/automations/templates/shipment.exception_resolution.v1/rules`

## Shadow and activation boundary

Projection is currently evidence-building only: it returns `automationEligible: false`. Installing the
template produces a draft rule, and the test fixture can exercise the context/lifecycle directly, but no
shipment event is emitted into live automation. No real credentials are required for migration, projection,
privacy, conflict, context, template, or lifecycle testing.

Before live delivery exceptions can create operational work, a separate activation slice must add:

1. provider conformance fixtures and a selected native read-only fulfilment translator;
2. polling/reconciliation and provider-webhook recovery registrations;
3. fulfilment field-group authority policy, readiness preview, manager activation, and watermark;
4. non-retroactive `shipment.exception` event emission only for materially changed activated state;
5. drift/health reporting for unresolved relationships, stale observations, and event conflicts; and
6. an explicit, risk-classified command layer if VinAgent later requests redelivery, changes addresses, buys
   labels, or performs another external carrier mutation.

The carrier/provider system remains the operational source of truth until those gates pass. VinAgent is the
canonical intelligence layer, not a second postage system.
