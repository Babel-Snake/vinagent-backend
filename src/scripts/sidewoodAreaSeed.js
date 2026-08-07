const AREA_SEED_SOURCE = 'sidewood-area-demo';
const integrationConnectionService = require('../services/integrationConnection.service');

const SIDEWOOD_USER_ALIASES = [
  {
    legacyUsername: 'bianca',
    username: 'kirri',
    legacyContactEmail: 'bianca@sidewood.com.au',
    contactEmail: 'kirri@sidewood.com.au'
  }
];

const SIDEWOOD_AREAS = [
  {
    key: 'cellar-door',
    name: 'Cellar Door',
    description: 'Tastings, direct-to-consumer sales, guest enquiries and cellar door service.',
    sortOrder: 10
  },
  {
    key: 'wine-club',
    name: 'Wine Club',
    description: 'Member relationships, allocations, subscriptions and wine club events.',
    sortOrder: 20
  },
  {
    key: 'restaurant',
    name: 'Restaurant',
    description: 'Restaurant bookings, floor service, menus and private dining.',
    sortOrder: 30
  },
  {
    key: 'logistics',
    name: 'Logistics',
    description: 'Warehousing, dispatch, freight, stock movement and fulfilment.',
    sortOrder: 40
  },
  {
    key: 'accounts',
    name: 'Accounts',
    description: 'Payments, invoicing, reconciliation and finance follow-up.',
    sortOrder: 50
  },
  {
    key: 'head-office',
    name: 'Head Office',
    description: 'Executive leadership, business planning and organisation-wide coordination.',
    sortOrder: 60
  },
  {
    key: 'marketing',
    name: 'Marketing',
    description: 'Campaigns, events promotion, content, media and brand communications.',
    sortOrder: 70
  }
];

const AREA_PROFILES = {
  'cellar-door': {
    publicEmail: 'cellardoor@sidewood.com.au',
    publicPhone: '(08) 8388 1157',
    openingHoursText: 'Confirm current Cellar Door hours before responding; public listings currently vary.',
    guestDirections: 'Sidewood Estate Cellar Door, 6 River Road, Hahndorf SA 5245.',
    serviceNotes: 'Tastings, masterclasses, direct sales and group enquiries. Bookings are recommended.'
  },
  restaurant: {
    publicEmail: 'bookings@sidewood.com.au',
    publicPhone: '(08) 8388 1157',
    openingHoursText: 'Confirm current Gallery Restaurant service hours before responding.',
    guestDirections: 'Gallery Restaurant at Sidewood Estate, 6 River Road, Hahndorf SA 5245.',
    serviceNotes: 'Restaurant reservations, group dining, dietary requirements and private-event enquiries.'
  }
};

const AREA_BOOKINGS = {
  'cellar-door': {
    walkInsAllowed: true,
    walkInNotes: 'Walk-ins may be possible for tastings subject to capacity; bookings are recommended for weekends, groups and masterclasses.',
    groupBookingThreshold: 6,
    leadTimeHours: 24,
    cancellationPolicyText: 'Credit card details may be held securely by the booking provider for no-show and late-cancellation policy enforcement.',
    kidsPolicy: 'Children are welcome in suitable areas and must be included in booking guest numbers.',
    petsPolicy: 'Pets are permitted in the Garden Area only and must remain on a leash.',
    defaultResponseStrategy: 'create_task'
  },
  restaurant: {
    walkInsAllowed: true,
    walkInNotes: 'Restaurant walk-ins are subject to table availability; reservations are recommended.',
    groupBookingThreshold: 8,
    leadTimeHours: 24,
    cancellationPolicyText: 'Credit card details may be held securely by the booking provider for no-show and late-cancellation policy enforcement.',
    kidsPolicy: 'Children and infants must be included in reservation guest numbers; confirm high-chair and dietary requirements when relevant.',
    petsPolicy: 'Pets are not permitted inside the Gallery Restaurant.',
    defaultResponseStrategy: 'create_task'
  }
};

const AREA_INTEGRATIONS = {
  'cellar-door': {
    booking: {
      provider: 'nowbookit',
      authMethod: 'webhook',
      externalLocationId: 'sidewood-cellar-door-demo',
      capabilities: ['check_availability', 'create_reservation', 'receive_webhook'],
      notes: 'Demo Cellar Door booking connection; inherits shared communication channels.'
    },
    pos: {
      provider: 'square',
      authMethod: 'api_key',
      externalLocationId: 'sidewood-cellar-door-pos-demo',
      capabilities: ['read_orders', 'read_products'],
      notes: 'Demo Cellar Door point-of-sale connection.'
    }
  },
  restaurant: {
    booking: {
      provider: 'opentable',
      authMethod: 'webhook',
      externalLocationId: 'sidewood-restaurant-demo',
      capabilities: ['check_availability', 'create_reservation', 'record_booking_reference', 'receive_webhook'],
      notes: 'Demo Restaurant booking connection, independent of Cellar Door bookings.'
    },
    pos: {
      provider: 'lightspeed',
      authMethod: 'api_key',
      externalLocationId: 'sidewood-restaurant-pos-demo',
      capabilities: ['read_orders', 'read_products'],
      notes: 'Demo Restaurant point-of-sale connection.'
    }
  },
  'wine-club': {
    crm: {
      provider: 'commerce7',
      authMethod: 'webhook',
      externalAccountId: 'sidewood-wine-club-demo',
      capabilities: ['read_customers', 'write_customer_notes', 'record_order_event', 'receive_webhook'],
      notes: 'Demo Wine Club CRM connection.'
    }
  },
  logistics: {
    delivery: {
      provider: 'shippit',
      authMethod: 'webhook',
      externalAccountId: 'sidewood-logistics-demo',
      capabilities: ['track_shipments', 'create_tracking_follow_up', 'receive_webhook'],
      notes: 'Demo Logistics delivery and tracking connection.'
    }
  }
};

const AREA_KNOWLEDGE = {
  'cellar-door': {
    sops: [[
      'Cellar Door Opening Checklist',
      'Confirm the tasting spaces, booking run sheet, glassware, featured products and host assignments before opening. Escalate restaurant or logistics dependencies to the owning area.'
    ]],
    faqs: [[
      'Can children join a Cellar Door tasting booking?',
      'Children are welcome in suitable Cellar Door areas and must be included in the booking guest count. Confirm seating and supervision requirements for larger groups.',
      ['cellar-door', 'children', 'tastings']
    ]]
  },
  restaurant: {
    sops: [[
      'Restaurant Dietary Request Handoff',
      'Record dietary requirements against the booking, confirm urgent or complex requests with the Restaurant team, and link Cellar Door only when a tasting or shared event is included.'
    ]],
    faqs: [[
      'How are restaurant dietary requirements handled?',
      'Dietary requirements should be supplied with the reservation. Complex allergies or group requirements are reviewed by the Restaurant team before confirmation.',
      ['restaurant', 'dietary', 'bookings']
    ]]
  },
  'wine-club': {
    sops: [[
      'Wine Club Allocation Payment Follow-up',
      'Verify the member, allocation and payment status before contact. Coordinate address or dispatch changes with Logistics and refer unresolved payment questions to Accounts.'
    ]],
    faqs: [[
      'Can a member change a Wine Club allocation?',
      'Allocation changes depend on release timing and stock. Create a Wine Club follow-up and involve Logistics if packing or dispatch has already started.',
      ['wine-club', 'allocations', 'members']
    ]]
  },
  logistics: {
    sops: [[
      'Delivery Exception Escalation',
      'Confirm the order reference, carrier status and customer contact details. Resolve warehouse or carrier issues in Logistics and link Wine Club or Accounts when customer or payment action is required.'
    ]],
    faqs: [[
      'What happens when a delivery is delayed?',
      'Logistics reviews the carrier status and delivery exception, then coordinates customer follow-up with the owning sales or Wine Club area where required.',
      ['logistics', 'delivery', 'tracking']
    ]]
  },
  accounts: {
    sops: [[
      'Invoice Query Triage',
      'Confirm the customer or supplier, invoice reference and disputed amount. Accounts owns financial review; link the operational area that supplied the goods, event or freight context.'
    ]],
    faqs: [[
      'Who handles an invoice or payment query?',
      'Accounts handles reconciliation and payment questions, with the relevant operational area linked when booking, order, freight or event details are needed.',
      ['accounts', 'invoice', 'payments']
    ]]
  },
  marketing: {
    sops: [[
      'Campaign Approval Handoff',
      'Marketing owns campaign content and scheduling. Obtain offer approval from the relevant commercial area and escalate organisation-wide claims or commitments to Head Office.'
    ]],
    faqs: [[
      'How are area promotions approved?',
      'Marketing coordinates content and timing with the area that owns the offer. Organisation-wide claims, pricing commitments or material exceptions require Head Office approval.',
      ['marketing', 'campaigns', 'approvals']
    ]]
  }
};

const CELLAR_DOOR_BOOKING_TYPE_NAMES = [
  'Interactive Tasting',
  'Group Tasting',
  'Self-Guided Wine Flight',
  'Nearly Naked 0% Alcohol Wine Flight',
  'Introduction to Wine Tasting Masterclass',
  'Sabrage Masterclass',
  'Cider Tasting Paddle',
  'Tour Bus Booking'
];

const RESTAURANT_BOOKING_TYPES = [
  { name: 'Restaurant Lunch', description: 'Standard Gallery Restaurant lunch reservation.', priceCents: 0 },
  { name: 'Group Dining', description: 'Restaurant group booking requiring team review and confirmation.', priceCents: 0 },
  { name: 'Private Dining Enquiry', description: 'Private restaurant event enquiry coordinated with the relevant Sidewood teams.', priceCents: 0 }
];

const SIDEWOOD_USERS = [
  {
    username: 'serena',
    email: 'serena@sidewood.com.au',
    displayName: 'Serena',
    role: 'staff',
    responsibilities: 'Cellar Door lead with area-scoped management authority.',
    memberships: [{ area: 'cellar-door', role: 'MANAGER', primary: true }]
  },
  {
    username: 'jacob',
    displayName: 'Jacob',
    role: 'staff',
    responsibilities: 'Cellar door tastings, guest service and direct sales.',
    memberships: [{ area: 'cellar-door', role: 'MEMBER', primary: true }]
  },
  {
    username: 'nick',
    displayName: 'Nick',
    role: 'staff',
    responsibilities: 'Cellar door hosting, group tastings and weekend service.',
    memberships: [{ area: 'cellar-door', role: 'MEMBER', primary: true }]
  },
  {
    username: 'james',
    displayName: 'James',
    role: 'staff',
    responsibilities: 'Cellar door sales, tasting preparation and guest follow-up.',
    memberships: [{ area: 'cellar-door', role: 'MEMBER', primary: true }]
  },
  {
    username: 'joanna',
    displayName: 'Joanna',
    role: 'staff',
    responsibilities: 'Cellar door hosting with restaurant guest-service support.',
    memberships: [
      { area: 'cellar-door', role: 'MEMBER', primary: true },
      { area: 'restaurant', role: 'MEMBER' }
    ]
  },
  {
    username: 'clare',
    contactEmail: 'clare@sidewood.com.au',
    displayName: 'Clare',
    role: 'staff',
    responsibilities: 'Wine club membership, allocations, renewals and member events.',
    memberships: [
      { area: 'wine-club', role: 'MANAGER', primary: true },
      { area: 'marketing', role: 'MEMBER' }
    ]
  },
  {
    username: 'kirri',
    contactEmail: 'kirri@sidewood.com.au',
    displayName: 'Kirri',
    role: 'staff',
    responsibilities: 'Restaurant service, bookings, functions and front-of-house coordination.',
    memberships: [
      { area: 'restaurant', role: 'MANAGER', primary: true },
      { area: 'cellar-door', role: 'MEMBER' }
    ]
  },
  {
    username: 'bradley',
    contactEmail: 'bradley@sidewood.com.au',
    displayName: 'Bradley',
    role: 'staff',
    responsibilities: 'Dispatch, fulfilment, freight exceptions and stock movement.',
    memberships: [
      { area: 'logistics', role: 'MANAGER', primary: true },
      { area: 'wine-club', role: 'MEMBER' }
    ]
  },
  {
    username: 'lisa',
    contactEmail: 'lisa@sidewood.com.au',
    displayName: 'Lisa',
    role: 'staff',
    responsibilities: 'Accounts receivable, invoice queries, payments and reconciliation.',
    memberships: [
      { area: 'accounts', role: 'MANAGER', primary: true },
      { area: 'head-office', role: 'MEMBER' }
    ]
  },
  {
    username: 'lara',
    contactEmail: 'lara@sidewood.com.au',
    displayName: 'Lara',
    role: 'staff',
    responsibilities: 'Marketing campaigns, media, events promotion and brand content.',
    memberships: [
      { area: 'marketing', role: 'MANAGER', primary: true },
      { area: 'wine-club', role: 'MEMBER' }
    ]
  },
  {
    username: 'owen',
    email: 'owen@sidewood.com.au',
    displayName: 'Owen',
    role: 'manager',
    responsibilities: 'Executive leadership, business planning and cross-area escalation.',
    memberships: [{ area: 'head-office', role: 'MANAGER', primary: true }]
  }
];

const CONTACTS = [
  {
    key: 'owen', username: 'owen', role: 'Executive Director', layer: 'Head Office',
    responsibilities: 'Executive leadership, business planning, financial sign-off and cross-area escalation.'
  },
  {
    key: 'serena', username: 'serena', role: 'Cellar Door Manager', layer: 'Cellar Door', reportsTo: 'owen',
    responsibilities: 'Cellar door guest experience, tastings, direct sales and service coordination.'
  },
  {
    key: 'clare', username: 'clare', role: 'Wine Club Manager', layer: 'Wine Club', reportsTo: 'owen',
    responsibilities: 'Wine club enquiries, allocations, subscriptions, retention and member events.'
  },
  {
    key: 'kirri', username: 'kirri', role: 'Restaurant Manager', layer: 'Restaurant', reportsTo: 'owen',
    responsibilities: 'Restaurant bookings, floor service, functions, menus and front-of-house coordination.'
  },
  {
    key: 'bradley', username: 'bradley', role: 'Logistics Manager', layer: 'Logistics', reportsTo: 'owen',
    responsibilities: 'Warehousing, dispatch, fulfilment, freight exceptions and stock movement.'
  },
  {
    key: 'lisa', username: 'lisa', role: 'Accounts Manager', layer: 'Accounts', reportsTo: 'owen',
    responsibilities: 'Accounts receivable, invoice queries, payments, reconciliation and finance reporting.'
  },
  {
    key: 'lara', username: 'lara', role: 'Marketing Manager', layer: 'Marketing', reportsTo: 'owen',
    responsibilities: 'Campaigns, media, content, events promotion and brand communications.'
  },
  {
    key: 'jacob', username: 'jacob', role: 'Cellar Door Host', layer: 'Cellar Door', reportsTo: 'serena',
    responsibilities: 'Guided tastings, guest service and direct-to-consumer sales.'
  },
  {
    key: 'nick', username: 'nick', role: 'Cellar Door Host', layer: 'Cellar Door', reportsTo: 'serena',
    responsibilities: 'Group tastings, weekend hosting and guest service.'
  },
  {
    key: 'james', username: 'james', role: 'Cellar Door Host', layer: 'Cellar Door', reportsTo: 'serena',
    responsibilities: 'Tasting preparation, cellar door sales and guest follow-up.'
  },
  {
    key: 'joanna', username: 'joanna', role: 'Cellar Door and Restaurant Host', layer: 'Cellar Door', reportsTo: 'serena',
    responsibilities: 'Cellar door hosting and restaurant guest-service support.'
  }
];

const TASKS = [
  ['cellar-roster', 'Prepare weekend tasting roster', 'OPERATIONS', 'normal', 'jacob', 'cellar-door', [], 'Confirm tasting coverage, breaks and experience leads for the weekend.'],
  ['wine-club-payments', 'Review failed winter allocation payments', 'ACCOUNT', 'high', 'clare', 'wine-club', [], 'Contact affected members and confirm whether allocations should be held or retried.'],
  ['restaurant-floor-plan', 'Confirm Saturday restaurant floor plan', 'BOOKING', 'normal', 'kirri', 'restaurant', [], 'Reconcile bookings, dietary notes, large tables and the garden overflow plan.'],
  ['dispatch-exceptions', 'Reconcile dispatch exceptions', 'ORDER', 'high', 'bradley', 'logistics', [], 'Review delayed and address-exception orders before the next carrier collection.'],
  ['debtor-review', 'Complete weekly debtor review', 'ACCOUNT', 'normal', 'lisa', 'accounts', [], 'Review overdue trade and event invoices and record the next follow-up.'],
  ['leadership-dashboard', 'Review monthly leadership dashboard', 'INTERNAL', 'normal', 'owen', 'head-office', [], 'Collect area updates and identify decisions needed at the leadership meeting.'],
  ['winter-campaign', 'Schedule winter release campaign', 'INTERNAL', 'normal', 'lara', 'marketing', [], 'Finalise the channel schedule, campaign assets and approval dates.'],
  ['private-member-dinner', 'Coordinate private member dinner', 'BOOKING', 'high', 'kirri', 'restaurant', ['cellar-door', 'wine-club', 'marketing', 'accounts'], 'Coordinate the guest list, tasting component, menu, promotion and final invoicing.'],
  ['club-release-dispatch', 'Prepare wine club release dispatch', 'ORDER', 'high', 'clare', 'wine-club', ['logistics', 'marketing', 'accounts'], 'Align member communications, payment clearance, packing and dispatch milestones.'],
  ['corporate-tasting-order', 'Resolve corporate tasting invoice and delivery', 'OPERATIONS', 'high', 'serena', 'cellar-door', ['logistics', 'accounts'], 'Confirm the tasting order, delivery timing and invoice status with all owning teams.']
];

const NOTICES = [
  ['cellar-weekend-briefing', 'Weekend tasting service briefing', 'STAFF', 'important', ['cellar-door'], 'Cellar door hosts should review the revised tasting sequence and weekend group allocations before service.'],
  ['club-allocation-calls', 'Winter allocation call list', 'WINE_CLUB', 'normal', ['wine-club'], 'The member call list is ready. Record payment, address and delivery changes against the member record.'],
  ['restaurant-menu-briefing', 'Gallery Restaurant menu briefing', 'STAFF', 'important', ['restaurant'], 'The new menu briefing is scheduled before Friday service. Review dietary substitutions and matching wines.'],
  ['dispatch-cutoff', 'Dispatch cut-off this week', 'STOCK', 'urgent', ['logistics'], 'Carrier collection is earlier on Friday. Orders must be packed and manifested by 1:00 pm.'],
  ['month-end-coding', 'Month-end invoice coding', 'GENERAL', 'normal', ['accounts'], 'Submit outstanding event and freight invoice coding before the month-end review.'],
  ['leadership-agenda', 'Leadership meeting agenda', 'GENERAL', 'important', ['head-office'], 'Area leads should add decisions and material risks to the monthly leadership agenda.'],
  ['campaign-assets', 'Campaign asset approval', 'GENERAL', 'normal', ['marketing'], 'Winter release campaign assets are ready for final brand and offer approval.'],
  ['member-dinner-run-sheet', 'Private member dinner run sheet', 'EVENTS', 'important', ['restaurant', 'cellar-door', 'wine-club', 'marketing', 'accounts'], 'The shared run sheet covers guest arrival, tasting, dinner service, member hosting, content and billing.'],
  ['winter-release-coordination', 'Winter release coordination', 'WINE_CLUB', 'important', ['wine-club', 'logistics', 'marketing', 'accounts'], 'Use the shared release timeline for payment clearance, member communication, packing and dispatch.']
];

const NOTICE_TASK_LINKS = [
  ['cellar-weekend-briefing', 'cellar-roster'],
  ['club-allocation-calls', 'wine-club-payments'],
  ['restaurant-menu-briefing', 'restaurant-floor-plan'],
  ['dispatch-cutoff', 'dispatch-exceptions'],
  ['month-end-coding', 'debtor-review'],
  ['leadership-agenda', 'leadership-dashboard'],
  ['campaign-assets', 'winter-campaign'],
  ['member-dinner-run-sheet', 'private-member-dinner'],
  ['winter-release-coordination', 'club-release-dispatch'],
  ['winter-release-coordination', 'wine-club-payments']
];

const OPERATIONAL_REQUESTS = [
  {
    key: 'member-dinner-invoice-approval',
    title: 'Approve private member dinner invoice terms',
    body: 'Restaurant needs Accounts to confirm deposit handling and final invoice terms before the private member dinner run sheet is sent.',
    subtype: 'cross_area_approval',
    priority: 'high',
    requester: 'kirri',
    requestedFrom: 'lisa',
    primaryArea: 'restaurant',
    linkedAreas: ['accounts', 'wine-club'],
    dueInDays: 2,
    aiSuggestedType: 'REQUEST',
    aiConfidence: 0.91
  },
  {
    key: 'release-packing-cutoff-confirmation',
    title: 'Confirm winter release packing cut-off',
    body: 'Wine Club needs Logistics to confirm the latest packing cut-off before member communications are finalised.',
    subtype: 'operational_confirmation',
    priority: 'normal',
    requester: 'clare',
    requestedFrom: 'bradley',
    primaryArea: 'wine-club',
    linkedAreas: ['logistics', 'marketing'],
    dueInDays: 1,
    aiSuggestedType: 'TASK',
    aiConfidence: 0.84
  },
  {
    key: 'corporate-tasting-delivery-check',
    title: 'Confirm corporate tasting delivery readiness',
    body: 'Cellar Door needs Logistics and Accounts to confirm delivery timing and invoice status for the corporate tasting order.',
    subtype: 'cross_area_handoff',
    priority: 'high',
    requester: 'serena',
    requestedFrom: 'bradley',
    primaryArea: 'cellar-door',
    linkedAreas: ['logistics', 'accounts'],
    dueInDays: 3,
    aiSuggestedType: 'REQUEST',
    aiConfidence: 0.88
  }
];

const OPERATIONAL_RECORDS = [
  {
    key: 'member-dinner-run-sheet-confirmed',
    title: 'Private member dinner run sheet confirmed',
    body: 'Restaurant confirmed the draft run sheet with Wine Club hosting notes, Cellar Door tasting timing, Marketing content requirements and Accounts billing checkpoints.',
    recordType: 'handoff_note',
    sourceReference: 'SIDEWOOD-DEMO-MEMBER-DINNER-RUN-SHEET',
    actor: 'kirri',
    primaryArea: 'restaurant',
    linkedAreas: ['cellar-door', 'wine-club', 'marketing', 'accounts'],
    occurredDaysAgo: 1,
    aiSuggestedType: 'NOTE',
    aiConfidence: 0.93
  },
  {
    key: 'winter-release-risk-log',
    title: 'Winter release dispatch risk logged',
    body: 'Logistics recorded a carrier capacity risk for the winter release. Wine Club and Marketing need aligned customer messaging if dispatch moves by more than one business day.',
    recordType: 'risk_note',
    sourceReference: 'SIDEWOOD-DEMO-WINTER-RELEASE-RISK',
    actor: 'bradley',
    primaryArea: 'logistics',
    linkedAreas: ['wine-club', 'marketing'],
    occurredDaysAgo: 2,
    aiSuggestedType: 'TASK',
    aiConfidence: 0.86
  },
  {
    key: 'corporate-tasting-payment-note',
    title: 'Corporate tasting payment status recorded',
    body: 'Accounts noted that the corporate tasting invoice is pending remittance advice. Cellar Door and Logistics should not release stock until payment status is confirmed.',
    recordType: 'finance_note',
    sourceReference: 'SIDEWOOD-DEMO-CORPORATE-TASTING-PAYMENT',
    actor: 'lisa',
    primaryArea: 'accounts',
    linkedAreas: ['cellar-door', 'logistics'],
    occurredDaysAgo: 3,
    aiSuggestedType: 'NOTICE',
    aiConfidence: 0.79
  }
];

const INTEGRATION_EVENTS = [
  ['opentable', 'sidewood-demo-restaurant-group', 'booking.created', 'restaurant', 0.98, 'ADAPTER', { guestName: 'Alex Morgan', partySize: 14, experience: 'Restaurant lunch' }],
  ['wine-club-crm', 'sidewood-demo-club-payment', 'subscription.payment_failed', 'wine-club', 0.97, 'RULE', { memberName: 'Amelia Hart', allocation: 'Winter release' }],
  ['freight-provider', 'sidewood-demo-delivery-delay', 'shipment.delayed', 'logistics', 0.95, 'ADAPTER', { orderReference: 'SW-DEMO-1042', reason: 'Address exception' }],
  ['accounts-inbox', 'sidewood-demo-supplier-invoice', 'email.received', 'accounts', 0.91, 'RULE', { subject: 'Freight invoice query', sender: 'supplier@example.test' }],
  ['events-inbox', 'sidewood-demo-corporate-tasting', 'email.received', 'cellar-door', 0.76, 'AI', { subject: 'Corporate tasting and dinner enquiry', guests: 36 }]
];

async function upsertOne(model, where, values, transaction) {
  const existing = await model.findOne({ where, transaction });
  if (existing) {
    await existing.update(values, { transaction });
    return existing;
  }
  return model.create({ ...where, ...values }, { transaction });
}

async function seedContacts({ db, winery, usersByUsername, areasByKey, transaction }) {
  for (const alias of SIDEWOOD_USER_ALIASES) {
    const legacyContact = await db.WineryContact.findOne({
      where: { wineryId: winery.id, email: alias.legacyContactEmail },
      transaction
    });
    const currentContact = await db.WineryContact.findOne({
      where: { wineryId: winery.id, email: alias.contactEmail },
      transaction
    });
    if (legacyContact && currentContact) await legacyContact.destroy({ transaction });
    else if (legacyContact) await legacyContact.update({ email: alias.contactEmail }, { transaction });
  }

  const contactsByKey = {};
  for (const definition of CONTACTS) {
    const user = usersByUsername[definition.username];
    if (!user) throw new Error(`Sidewood area seed requires user: ${definition.username}`);
    const userDefinition = SIDEWOOD_USERS.find(candidate => candidate.username === definition.username);
    const contactEmail = userDefinition.contactEmail || user.email;
    const manager = definition.reportsTo ? contactsByKey[definition.reportsTo] : null;
    const contact = await upsertOne(db.WineryContact, { wineryId: winery.id, email: contactEmail }, {
      name: definition.name || user.displayName,
      role: definition.role,
      layer: definition.layer,
      reportsToId: manager?.id || null,
      responsibilities: definition.responsibilities,
      phone: null,
      notes: 'Sidewood demo organisation chart contact.',
      isActive: true
    }, transaction);
    await db.WineryContactArea.destroy({ where: { wineryId: winery.id, contactId: contact.id }, transaction });
    await db.WineryContactArea.bulkCreate(userDefinition.memberships.map(membership => ({
      wineryId: winery.id,
      contactId: contact.id,
      areaId: areasByKey[membership.area].id,
      relationshipType: membership.primary ? 'PRIMARY' : 'LINKED'
    })), { transaction });
    contactsByKey[definition.key] = contact;
  }
  return contactsByKey;
}

async function replaceTaskAreas({ db, wineryId, task, primaryArea, linkedAreas, transaction }) {
  await db.TaskArea.destroy({ where: { taskId: task.id }, transaction });
  await db.TaskArea.bulkCreate([
    { wineryId, taskId: task.id, areaId: primaryArea.id, relationshipType: 'PRIMARY' },
    ...linkedAreas.map(area => ({ wineryId, taskId: task.id, areaId: area.id, relationshipType: 'LINKED' }))
  ], { transaction });
}

async function replaceNoticeAreas({ db, wineryId, notice, areas, transaction }) {
  await db.NoticeArea.destroy({ where: { noticeId: notice.id }, transaction });
  await db.NoticeArea.bulkCreate(areas.map(area => ({
    wineryId,
    noticeId: notice.id,
    areaId: area.id
  })), { transaction });
}

async function replaceOperationalRequestAreas({ db, wineryId, request, primaryArea, linkedAreas, transaction }) {
  await db.OperationalRequestArea.destroy({ where: { requestId: request.id, wineryId }, transaction });
  await db.OperationalRequestArea.bulkCreate([
    { wineryId, requestId: request.id, areaId: primaryArea.id, relationshipType: 'PRIMARY' },
    ...linkedAreas.map(area => ({ wineryId, requestId: request.id, areaId: area.id, relationshipType: 'LINKED' }))
  ], { transaction });
}

async function replaceOperationalRecordAreas({ db, wineryId, record, primaryArea, linkedAreas, transaction }) {
  await db.OperationalRecordArea.destroy({ where: { recordId: record.id, wineryId }, transaction });
  await db.OperationalRecordArea.bulkCreate([
    { wineryId, recordId: record.id, areaId: primaryArea.id, relationshipType: 'PRIMARY' },
    ...linkedAreas.map(area => ({ wineryId, recordId: record.id, areaId: area.id, relationshipType: 'LINKED' }))
  ], { transaction });
}

async function seedSidewoodAreaDemo({ db, winery, usersByUsername, transaction }) {
  const areasByKey = {};
  for (const definition of SIDEWOOD_AREAS) {
    areasByKey[definition.key] = await upsertOne(db.OperationalArea, {
      wineryId: winery.id,
      name: definition.name
    }, {
      description: definition.description,
      sortOrder: definition.sortOrder,
      isActive: true
    }, transaction);
  }

  for (const definition of SIDEWOOD_USERS) {
    const user = usersByUsername[definition.username];
    if (!user) throw new Error(`Sidewood area seed requires user: ${definition.username}`);
    await db.UserAreaMembership.destroy({ where: { wineryId: winery.id, userId: user.id }, transaction });
    await db.UserAreaMembership.bulkCreate(definition.memberships.map(membership => ({
      wineryId: winery.id,
      userId: user.id,
      areaId: areasByKey[membership.area].id,
      membershipRole: membership.role,
      isPrimary: Boolean(membership.primary)
    })), { transaction });
  }

  for (const [areaKey, profile] of Object.entries(AREA_PROFILES)) {
    await upsertOne(db.OperationalAreaProfile, {
      wineryId: winery.id,
      areaId: areasByKey[areaKey].id
    }, profile, transaction);
  }

  for (const [areaKey, config] of Object.entries(AREA_BOOKINGS)) {
    await upsertOne(db.OperationalAreaBookingsConfig, {
      wineryId: winery.id,
      areaId: areasByKey[areaKey].id
    }, config, transaction);
  }

  for (const [areaKey, providerConnections] of Object.entries(AREA_INTEGRATIONS)) {
    const where = { wineryId: winery.id, areaId: areasByKey[areaKey].id };
    const existing = await db.OperationalAreaIntegrationConfig.findOne({ where, transaction });
    const normalizedConnections = integrationConnectionService.normalizeAreaProviderConnections(
      { providerConnections },
      existing,
      where
    );
    await upsertOne(db.OperationalAreaIntegrationConfig, where, {
      providerConnections: normalizedConnections
    }, transaction);
  }

  for (const [areaKey, knowledge] of Object.entries(AREA_KNOWLEDGE)) {
    const areaId = areasByKey[areaKey].id;
    for (const [title, body] of knowledge.sops) {
      await upsertOne(db.WinerySop, { wineryId: winery.id, title }, {
        areaId,
        body,
        isActive: true
      }, transaction);
    }
    for (const [question, answer, tags] of knowledge.faqs) {
      await upsertOne(db.WineryFAQItem, { wineryId: winery.id, question }, {
        areaId,
        answer,
        tags,
        isActive: true
      }, transaction);
    }
  }

  for (const name of CELLAR_DOOR_BOOKING_TYPE_NAMES) {
    const bookingType = await db.WineryBookingType.findOne({ where: { wineryId: winery.id, name }, transaction });
    if (bookingType && Number(bookingType.areaId) !== Number(areasByKey['cellar-door'].id)) {
      await bookingType.update({ areaId: areasByKey['cellar-door'].id }, { transaction });
    }
  }

  for (const bookingType of RESTAURANT_BOOKING_TYPES) {
    await upsertOne(db.WineryBookingType, {
      wineryId: winery.id,
      name: bookingType.name
    }, {
      ...bookingType,
      areaId: areasByKey.restaurant.id,
      currency: 'AUD',
      minGuests: 1,
      isActive: true
    }, transaction);
  }

  const products = await db.WineryProduct.findAll({
    where: { wineryId: winery.id, isActive: true },
    transaction
  });
  const areaProductDefinitions = [
    {
      areaKey: 'cellar-door',
      products,
      overrides: product => ({
        isFeatured: product.category === 'Sparkling',
        salesNotes: 'Available for cellar door sales and tasting recommendations.'
      })
    },
    {
      areaKey: 'restaurant',
      products: products.filter(product => product.category !== 'Merchandise'),
      overrides: product => ({
        priceOverride: product.name === 'NV Sidewood Estate Sparkling' ? 48 : null,
        isFeatured: product.name === 'NV Sidewood Estate Sparkling',
        salesNotes: 'Available for restaurant wine-list and food-pairing recommendations.'
      })
    },
    {
      areaKey: 'wine-club',
      products: products.filter(product => product.category !== 'Merchandise'),
      overrides: product => ({
        priceOverride: product.name === 'NV Sidewood Estate Sparkling' ? 25 : null,
        isFeatured: product.name === 'NV Sidewood Estate Sparkling',
        salesNotes: 'Available for member allocations, offers and release communications.'
      })
    }
  ];

  for (const definition of areaProductDefinitions) {
    for (const product of definition.products) {
      await upsertOne(db.AreaProductListing, {
        wineryId: winery.id,
        areaId: areasByKey[definition.areaKey].id,
        productId: product.id
      }, {
        isAvailable: true,
        stockStatusOverride: null,
        ...definition.overrides(product)
      }, transaction);
    }
  }

  await seedContacts({ db, winery, usersByUsername, areasByKey, transaction });

  const tasksByKey = {};
  for (const [key, title, category, priority, assigneeUsername, primaryKey, linkedKeys, action] of TASKS) {
    const assignee = usersByUsername[assigneeUsername];
    const task = await upsertOne(db.Task, {
      wineryId: winery.id,
      subType: `SIDEWOOD_AREA_${key.toUpperCase().replace(/-/g, '_')}`
    }, {
      type: 'SIDEWOOD_AREA_DEMO',
      category,
      customerType: 'UNKNOWN',
      status: 'PENDING',
      workflowState: 'NOT_STARTED',
      waitingOn: 'NONE',
      priority,
      areaScope: 'AREAS',
      payload: { seedSource: AREA_SEED_SOURCE, summary: title },
      suggestedChannel: 'none',
      suggestedAction: action,
      requiresApproval: false,
      assigneeId: assignee.id,
      createdBy: usersByUsername.serena.id,
      updatedBy: usersByUsername.serena.id
    }, transaction);
    await replaceTaskAreas({
      db,
      wineryId: winery.id,
      task,
      primaryArea: areasByKey[primaryKey],
      linkedAreas: linkedKeys.map(linkedKey => areasByKey[linkedKey]),
      transaction
    });
    tasksByKey[key] = task;
  }

  const noticesByKey = {};
  for (const [key, title, category, priority, areaKeys, body] of NOTICES) {
    const notice = await upsertOne(db.Notice, {
      wineryId: winery.id,
      externalSource: AREA_SEED_SOURCE,
      externalId: key
    }, {
      title,
      body,
      category,
      priority,
      isPinned: priority !== 'normal',
      audienceType: 'all_staff',
      areaScope: 'AREAS',
      createdBy: usersByUsername.serena.id,
      updatedBy: usersByUsername.serena.id,
      archivedAt: null,
      archivedBy: null
    }, transaction);
    await replaceNoticeAreas({
      db,
      wineryId: winery.id,
      notice,
      areas: areaKeys.map(areaKey => areasByKey[areaKey]),
      transaction
    });
    noticesByKey[key] = notice;
  }

  const organisationNotice = await upsertOne(db.Notice, {
    wineryId: winery.id,
    externalSource: AREA_SEED_SOURCE,
    externalId: 'weekly-operational-priorities'
  }, {
    title: 'Sidewood weekly operational priorities',
    body: 'All teams should review this week\'s guest commitments, release milestones and material operational risks.',
    category: 'GENERAL',
    priority: 'important',
    isPinned: true,
    audienceType: 'all_staff',
    areaScope: 'ORGANISATION',
    createdBy: usersByUsername.owen.id,
    updatedBy: usersByUsername.owen.id,
    archivedAt: null,
    archivedBy: null
  }, transaction);
  await db.NoticeArea.destroy({ where: { noticeId: organisationNotice.id }, transaction });
  noticesByKey['weekly-operational-priorities'] = organisationNotice;

  await db.NoticeTask.destroy({
    where: {
      wineryId: winery.id,
      noticeId: Object.values(noticesByKey).map(notice => notice.id)
    },
    transaction
  });
  await db.NoticeTask.bulkCreate(NOTICE_TASK_LINKS.map(([noticeKey, taskKey]) => ({
    wineryId: winery.id,
    noticeId: noticesByKey[noticeKey].id,
    taskId: tasksByKey[taskKey].id,
    createdBy: usersByUsername.serena.id
  })), { transaction });

  const now = new Date();
  const requestsByKey = {};
  for (const definition of OPERATIONAL_REQUESTS) {
    const dueAt = new Date(now);
    dueAt.setDate(dueAt.getDate() + definition.dueInDays);
    const requester = usersByUsername[definition.requester];
    const requestedFrom = usersByUsername[definition.requestedFrom];
    const request = await upsertOne(db.OperationalRequest, {
      wineryId: winery.id,
      subtype: `SIDEWOOD_DEMO_${definition.key.toUpperCase().replace(/-/g, '_')}`
    }, {
      title: definition.title,
      body: definition.body,
      originalText: definition.body,
      status: 'PENDING',
      priority: definition.priority,
      response: null,
      dueAt,
      decidedAt: null,
      sourceType: 'MANUAL',
      areaScope: 'AREAS',
      aiSuggestedType: definition.aiSuggestedType,
      aiConfidence: definition.aiConfidence,
      aiSuggestion: {
        seedSource: AREA_SEED_SOURCE,
        reason: 'Demo cross-area request used to test operational intelligence and area access.'
      },
      humanConfirmedType: 'REQUEST',
      requestedFromUserId: requestedFrom.id,
      decisionBy: null,
      confirmedBy: requester.id,
      confirmedAt: now,
      createdBy: requester.id,
      updatedBy: requester.id
    }, transaction);
    await replaceOperationalRequestAreas({
      db,
      wineryId: winery.id,
      request,
      primaryArea: areasByKey[definition.primaryArea],
      linkedAreas: definition.linkedAreas.map(areaKey => areasByKey[areaKey]),
      transaction
    });
    requestsByKey[definition.key] = request;
  }

  const recordsByKey = {};
  for (const definition of OPERATIONAL_RECORDS) {
    const occurredAt = new Date(now);
    occurredAt.setDate(occurredAt.getDate() - definition.occurredDaysAgo);
    const actor = usersByUsername[definition.actor];
    const record = await upsertOne(db.OperationalRecord, {
      wineryId: winery.id,
      sourceReference: definition.sourceReference
    }, {
      title: definition.title,
      body: definition.body,
      originalText: definition.body,
      recordType: definition.recordType,
      sourceType: 'MANUAL',
      occurredAt,
      metadata: {
        seedSource: AREA_SEED_SOURCE,
        demoPurpose: 'Cross-area operational note coverage'
      },
      areaScope: 'AREAS',
      aiSuggestedType: definition.aiSuggestedType,
      aiConfidence: definition.aiConfidence,
      aiSuggestion: {
        seedSource: AREA_SEED_SOURCE,
        reason: 'Demo cross-area note used to test operational intelligence and area access.'
      },
      humanConfirmedType: 'NOTE',
      confirmedBy: actor.id,
      confirmedAt: now,
      createdBy: actor.id,
      updatedBy: actor.id
    }, transaction);
    await replaceOperationalRecordAreas({
      db,
      wineryId: winery.id,
      record,
      primaryArea: areasByKey[definition.primaryArea],
      linkedAreas: definition.linkedAreas.map(areaKey => areasByKey[areaKey]),
      transaction
    });
    recordsByKey[definition.key] = record;
  }

  const relationRows = [
    {
      sourceType: 'NOTICE',
      sourceId: noticesByKey['member-dinner-run-sheet'].id,
      targetType: 'TASK',
      targetId: tasksByKey['private-member-dinner'].id,
      relationType: 'GENERATED_TASK',
      metadata: { seedSource: AREA_SEED_SOURCE, scenario: 'private member dinner' }
    },
    {
      sourceType: 'NOTICE',
      sourceId: noticesByKey['winter-release-coordination'].id,
      targetType: 'TASK',
      targetId: tasksByKey['club-release-dispatch'].id,
      relationType: 'GENERATED_TASK',
      metadata: { seedSource: AREA_SEED_SOURCE, scenario: 'winter release' }
    },
    {
      sourceType: 'REQUEST',
      sourceId: requestsByKey['member-dinner-invoice-approval'].id,
      targetType: 'TASK',
      targetId: tasksByKey['private-member-dinner'].id,
      relationType: 'BLOCKS',
      metadata: { seedSource: AREA_SEED_SOURCE, scenario: 'invoice approval blocks event readiness' }
    },
    {
      sourceType: 'NOTE',
      sourceId: recordsByKey['member-dinner-run-sheet-confirmed'].id,
      targetType: 'REQUEST',
      targetId: requestsByKey['member-dinner-invoice-approval'].id,
      relationType: 'RELATES_TO',
      metadata: { seedSource: AREA_SEED_SOURCE, scenario: 'run sheet depends on invoice terms' }
    },
    {
      sourceType: 'NOTE',
      sourceId: recordsByKey['winter-release-risk-log'].id,
      targetType: 'TASK',
      targetId: tasksByKey['club-release-dispatch'].id,
      relationType: 'FOLLOW_UP_FOR',
      metadata: { seedSource: AREA_SEED_SOURCE, scenario: 'dispatch risk follow-up' }
    },
    {
      sourceType: 'NOTE',
      sourceId: recordsByKey['corporate-tasting-payment-note'].id,
      targetType: 'TASK',
      targetId: tasksByKey['corporate-tasting-order'].id,
      relationType: 'BLOCKS',
      metadata: { seedSource: AREA_SEED_SOURCE, scenario: 'payment status blocks stock release' }
    }
  ];
  for (const relation of relationRows) {
    await upsertOne(db.OperationalItemRelation, {
      wineryId: winery.id,
      sourceType: relation.sourceType,
      sourceId: relation.sourceId,
      targetType: relation.targetType,
      targetId: relation.targetId,
      relationType: relation.relationType
    }, {
      metadata: relation.metadata,
      createdBy: usersByUsername.serena.id
    }, transaction);
  }

  for (const [provider, externalEventId, eventType, areaKey, confidence, mappingSource, payload] of INTEGRATION_EVENTS) {
    await upsertOne(db.IntegrationEvent, {
      wineryId: winery.id,
      provider,
      externalEventId
    }, {
      intakeMethod: 'seed',
      eventType,
      rawPayload: payload,
      normalizedPayload: payload,
      status: 'PENDING_REVIEW',
      processingError: null,
      suggestedAreaId: areasByKey[areaKey].id,
      confirmedAreaId: null,
      areaConfidence: confidence,
      areaMappingSource: mappingSource,
      metadata: { seedSource: AREA_SEED_SOURCE },
      createdBy: usersByUsername.serena.id
    }, transaction);
  }

  return { areasByKey };
}

module.exports = {
  AREA_SEED_SOURCE,
  SIDEWOOD_AREAS,
  SIDEWOOD_USER_ALIASES,
  SIDEWOOD_USERS,
  seedSidewoodAreaDemo
};
