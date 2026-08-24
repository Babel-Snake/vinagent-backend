const { BOOKING_FEED_SCHEMA_VERSION } = require('../../services/integrations/booking/bookingFeed.contract');
const {
  defineNativeBookingTranslator,
  NativeBookingReadAdapter
} = require('../../services/integrations/booking/nativeBookingAdapter');

const READ_WINDOW = Object.freeze({
  from: '2026-08-18T00:00:00.000Z',
  to: '2026-08-25T00:00:00.000Z'
});

const CONFORMANCE_SCENARIOS = Object.freeze([
  Object.freeze({ key: 'confirmed', request: Object.freeze({ ...READ_WINDOW, syncMode: 'hydration' }) }),
  Object.freeze({
    key: 'rescheduled',
    request: Object.freeze({
      ...READ_WINDOW,
      syncMode: 'incremental',
      updatedSince: '2026-08-18T00:01:00.000Z'
    })
  }),
  Object.freeze({ key: 'cancelled', request: Object.freeze({ ...READ_WINDOW, syncMode: 'reconciliation' }) })
]);

function cursorReservation({ changed = false, cancelled = false } = {}) {
  return {
    reservation_id: 'cursor-reservation-100',
    revision_token: cancelled ? 'cursor-13' : changed ? 'cursor-12' : 'cursor-11',
    reservation_status: cancelled ? 'voided' : 'booked',
    starts_at: changed || cancelled ? '2026-08-23T03:30:00.000Z' : '2026-08-22T03:30:00.000Z',
    duration_minutes: 90,
    covers: 6,
    venue: { venue_id: 'venue-a' },
    service: { service_key: 'paired-tasting', display_name: 'Paired Tasting' },
    extras: [{ group: 'addon', sku: 'TRUFFLE_PAIR', title: 'Paired truffle tasting', units: changed || cancelled ? 8 : 6 }],
    guest_alerts: [{ alert_type: 'dietary', alert_key: 'NUT', display_name: 'Private dietary detail' }],
    customer: {
      customer_id: 'cursor-guest-9',
      given_name: 'Private',
      family_name: 'Guest',
      email_address: 'Private.Cursor@Example.test',
      mobile_number: '+61400000001'
    },
    created_at: '2026-08-01T00:00:00.000Z',
    modified_at: cancelled
      ? '2026-08-18T00:06:00.000Z'
      : changed ? '2026-08-18T00:04:00.000Z' : '2026-08-18T00:00:00.000Z',
    voided_at: cancelled ? '2026-08-18T00:06:00.000Z' : null
  };
}

function cursorFixturePage(request) {
  if (request.syncMode === 'hydration') {
    if (!request.cursor) {
      return {
        data: { reservations: [cursorReservation()] },
        paging: { after: 'cursor-finished', more_results: true },
        generated_at: '2026-08-18T00:01:00.000Z',
        complete_snapshot: false
      };
    }
    return {
      data: { reservations: [] },
      paging: { after: null, more_results: false },
      generated_at: '2026-08-18T00:01:00.000Z',
      complete_snapshot: false
    };
  }
  if (request.syncMode === 'incremental') {
    return {
      data: { reservations: [cursorReservation({ changed: true })] },
      paging: { after: null, more_results: false },
      generated_at: '2026-08-18T00:05:00.000Z',
      complete_snapshot: false
    };
  }
  return {
    data: { reservations: [cursorReservation({ changed: true, cancelled: true })] },
    paging: { after: null, more_results: false },
    generated_at: '2026-08-18T00:07:00.000Z',
    complete_snapshot: true
  };
}

const cursorTranslator = defineNativeBookingTranslator({
  providerKey: 'fixture-cursor-reservations',
  adapterVersion: '1',
  paginationStrategy: 'CURSOR',
  supportedSyncModes: ['hydration', 'incremental', 'reconciliation'],
  kind: 'CONFORMANCE_FIXTURE',
  translatePage(rawPage) {
    return {
      schemaVersion: BOOKING_FEED_SCHEMA_VERSION,
      bookings: rawPage.data.reservations.map(reservation => ({
        id: reservation.reservation_id,
        revision: reservation.revision_token,
        status: reservation.reservation_status === 'voided' ? 'CANCELLED' : 'CONFIRMED',
        startAt: reservation.starts_at,
        endAt: new Date(new Date(reservation.starts_at).getTime() + reservation.duration_minutes * 60000).toISOString(),
        partySize: reservation.covers,
        locationId: reservation.venue.venue_id,
        experience: {
          code: reservation.service.service_key,
          name: reservation.service.display_name
        },
        requirements: [
          ...reservation.extras.map(extra => ({
            kind: extra.group === 'addon' ? 'ADD_ON' : 'OTHER',
            code: extra.sku === 'TRUFFLE_PAIR' ? 'truffle-pairing' : extra.sku.toLowerCase().replaceAll('_', '-'),
            label: extra.title,
            quantity: extra.units
          })),
          ...reservation.guest_alerts.map(alert => ({
            kind: alert.alert_type === 'dietary' ? 'DIETARY' : 'OTHER',
            code: alert.alert_key.toLowerCase(),
            label: alert.display_name,
            quantity: 1
          }))
        ],
        guest: {
          externalId: reservation.customer.customer_id,
          firstName: reservation.customer.given_name,
          lastName: reservation.customer.family_name,
          email: reservation.customer.email_address,
          phone: reservation.customer.mobile_number
        },
        createdAt: reservation.created_at,
        updatedAt: reservation.modified_at,
        deletedAt: reservation.voided_at
      })),
      nextCursor: rawPage.paging.after,
      hasMore: rawPage.paging.more_results,
      watermarkAt: rawPage.generated_at,
      snapshotComplete: rawPage.complete_snapshot
    };
  }
});

function localMinuteToIso(serviceDate, minuteOfDay, utcOffsetMinutes) {
  const [year, month, day] = serviceDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, minuteOfDay - utcOffsetMinutes)).toISOString();
}

function offsetVisit({ changed = false, cancelled = false } = {}) {
  const serviceDate = changed || cancelled ? '2026-08-23' : '2026-08-22';
  return {
    visit_reference: 'offset-visit-880',
    sequence_number: cancelled ? 9003 : changed ? 9002 : 9001,
    lifecycle_code: cancelled ? 70 : 20,
    schedule: {
      service_date: serviceDate,
      minute_of_day: 780,
      length_minutes: 90,
      utc_offset_minutes: 570
    },
    attendance: { expected_guests: 6 },
    site_code: 'site-99',
    package: { category_id: 44, category_label: 'Paired Tasting' },
    supplements: {
      TRUFFLE_PAIR: { item_label: 'Paired truffle tasting', portions: changed || cancelled ? 8 : 6 }
    },
    alerts: [{ class_code: 8, alert_id: 'NUT', text: 'Private dietary detail' }],
    person: {
      record_number: 'offset-person-66',
      preferred: 'Private',
      surname: 'Guest',
      contact_email: 'Private.Offset@Example.test',
      contact_phone: '+61400000002'
    },
    created_epoch_ms: Date.parse('2026-08-01T00:00:00.000Z'),
    changed_epoch_ms: Date.parse(cancelled
      ? '2026-08-18T00:06:00.000Z'
      : changed ? '2026-08-18T00:04:00.000Z' : '2026-08-18T00:00:00.000Z'),
    deleted_epoch_ms: cancelled ? Date.parse('2026-08-18T00:06:00.000Z') : null
  };
}

function offsetFixturePage(request) {
  const visits = request.syncMode === 'hydration'
    ? [offsetVisit()]
    : request.syncMode === 'incremental'
      ? [offsetVisit({ changed: true })]
      : [offsetVisit({ changed: true, cancelled: true })];
  return {
    visits,
    page: { offset: Number(request.cursor || 0), returned: visits.length, total: visits.length, next_offset: null },
    checkpoint_epoch_ms: Date.parse(request.syncMode === 'hydration'
      ? '2026-08-18T00:01:00.000Z'
      : request.syncMode === 'incremental' ? '2026-08-18T00:05:00.000Z' : '2026-08-18T00:07:00.000Z'),
    full_extract: request.syncMode === 'reconciliation'
  };
}

const offsetTranslator = defineNativeBookingTranslator({
  providerKey: 'fixture-offset-visits',
  adapterVersion: '1',
  paginationStrategy: 'OFFSET',
  supportedSyncModes: ['hydration', 'incremental', 'reconciliation'],
  kind: 'CONFORMANCE_FIXTURE',
  translatePage(rawPage) {
    return {
      schemaVersion: BOOKING_FEED_SCHEMA_VERSION,
      bookings: rawPage.visits.map(visit => {
        const startAt = localMinuteToIso(
          visit.schedule.service_date,
          visit.schedule.minute_of_day,
          visit.schedule.utc_offset_minutes
        );
        return {
          id: visit.visit_reference,
          revision: String(visit.sequence_number),
          status: visit.lifecycle_code === 70 ? 'CANCELLED' : 'CONFIRMED',
          startAt,
          endAt: new Date(new Date(startAt).getTime() + visit.schedule.length_minutes * 60000).toISOString(),
          partySize: visit.attendance.expected_guests,
          locationId: visit.site_code,
          experience: { code: 'paired-tasting', name: visit.package.category_label },
          requirements: [
            ...Object.entries(visit.supplements).map(([code, supplement]) => ({
              kind: 'ADD_ON',
              code: code === 'TRUFFLE_PAIR' ? 'truffle-pairing' : code.toLowerCase().replaceAll('_', '-'),
              label: supplement.item_label,
              quantity: supplement.portions
            })),
            ...visit.alerts.map(alert => ({
              kind: alert.class_code === 8 ? 'DIETARY' : 'OTHER',
              code: alert.alert_id.toLowerCase(),
              label: alert.text,
              quantity: 1
            }))
          ],
          guest: {
            externalId: visit.person.record_number,
            firstName: visit.person.preferred,
            lastName: visit.person.surname,
            email: visit.person.contact_email,
            phone: visit.person.contact_phone
          },
          createdAt: new Date(visit.created_epoch_ms).toISOString(),
          updatedAt: new Date(visit.changed_epoch_ms).toISOString(),
          deletedAt: visit.deleted_epoch_ms ? new Date(visit.deleted_epoch_ms).toISOString() : null
        };
      }),
      nextCursor: rawPage.page.next_offset === null ? null : String(rawPage.page.next_offset),
      hasMore: rawPage.page.next_offset !== null,
      watermarkAt: new Date(rawPage.checkpoint_epoch_ms).toISOString(),
      snapshotComplete: rawPage.full_extract
    };
  }
});

class FixtureNativeBookingAdapter extends NativeBookingReadAdapter {
  constructor({ translator, externalLocationId, pageFactory }) {
    super({ translator, externalLocationId, guestDataMode: 'NONE' });
    this.pageFactory = pageFactory;
  }

  isAuthenticated() {
    return true;
  }

  async verifyReadAccess() {
    return {
      providerKey: this.providerKey,
      contractSchemaVersion: BOOKING_FEED_SCHEMA_VERSION,
      accountMatched: true,
      locationMatched: true
    };
  }

  async fetchProviderBookingsPage(request) {
    return this.pageFactory(request);
  }
}

function createCursorFixtureAdapter() {
  return new FixtureNativeBookingAdapter({
    translator: cursorTranslator,
    externalLocationId: 'venue-a',
    pageFactory: cursorFixturePage
  });
}

function createOffsetFixtureAdapter() {
  return new FixtureNativeBookingAdapter({
    translator: offsetTranslator,
    externalLocationId: 'site-99',
    pageFactory: offsetFixturePage
  });
}

module.exports = {
  READ_WINDOW,
  CONFORMANCE_SCENARIOS,
  cursorTranslator,
  offsetTranslator,
  cursorFixturePage,
  offsetFixturePage,
  createCursorFixtureAdapter,
  createOffsetFixtureAdapter
};
