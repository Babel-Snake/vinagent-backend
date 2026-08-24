const BookingAdapter = require('./booking.adapter');
const { ValidationError } = require('../../../utils/errors');
const {
  BOOKING_FEED_SCHEMA_VERSION,
  GUEST_DATA_MODES,
  validateAndNormalizeBookingPage
} = require('./bookingFeed.contract');
const {
  BOOKING_READ_ADAPTER_CONTRACT_VERSION,
  BOOKING_READ_SYNC_MODES,
  BookingReadAdapterContractError,
  normalizeBookingReadRequest,
  validateNormalizedBookingAdapterPage
} = require('./bookingReadAdapter.contract');

const PAGINATION_STRATEGIES = Object.freeze(['CURSOR', 'OFFSET', 'PAGE', 'LINK']);
const TRANSLATOR_KINDS = Object.freeze(['NATIVE_PROVIDER', 'CONFORMANCE_FIXTURE']);

function normalizeTranslatorDefinition(definition) {
  const allowedKeys = new Set([
    'providerKey',
    'adapterVersion',
    'paginationStrategy',
    'supportedSyncModes',
    'kind',
    'translatePage'
  ]);
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)
    || Object.keys(definition).some(key => !allowedKeys.has(key))) {
    throw new ValidationError('Native booking translator definition contains unsupported fields');
  }
  const providerKey = String(definition.providerKey || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/.test(providerKey)) {
    throw new ValidationError('Native booking translator providerKey is invalid');
  }
  const adapterVersion = String(definition.adapterVersion || '').trim();
  if (!/^[1-9][0-9]{0,8}$/.test(adapterVersion)) {
    throw new ValidationError('Native booking translator adapterVersion is invalid');
  }
  const paginationStrategy = String(definition.paginationStrategy || '').trim().toUpperCase();
  if (!PAGINATION_STRATEGIES.includes(paginationStrategy)) {
    throw new ValidationError('Native booking translator paginationStrategy is invalid');
  }
  const supportedSyncModes = [...new Set((definition.supportedSyncModes || [])
    .map(mode => String(mode).trim().toLowerCase()))];
  if (supportedSyncModes.length === 0
    || supportedSyncModes.some(mode => !BOOKING_READ_SYNC_MODES.includes(mode))) {
    throw new ValidationError('Native booking translator supportedSyncModes are invalid');
  }
  const kind = String(definition.kind || '').trim().toUpperCase();
  if (!TRANSLATOR_KINDS.includes(kind)) throw new ValidationError('Native booking translator kind is invalid');
  if (typeof definition.translatePage !== 'function') {
    throw new ValidationError('Native booking translator requires translatePage');
  }
  return {
    providerKey,
    adapterVersion,
    paginationStrategy,
    supportedSyncModes,
    kind,
    translatePage: definition.translatePage
  };
}

function defineNativeBookingTranslator(definition) {
  const normalized = normalizeTranslatorDefinition(definition);
  const translator = {
    providerKey: normalized.providerKey,
    adapterVersion: normalized.adapterVersion,
    adapterContractVersion: BOOKING_READ_ADAPTER_CONTRACT_VERSION,
    bookingFeedSchemaVersion: BOOKING_FEED_SCHEMA_VERSION,
    paginationStrategy: normalized.paginationStrategy,
    supportedSyncModes: Object.freeze([...normalized.supportedSyncModes]),
    kind: normalized.kind,
    translateProviderPage(rawPage, context = {}) {
      const request = normalizeBookingReadRequest(context.request);
      if (!normalized.supportedSyncModes.includes(request.syncMode)) {
        throw new BookingReadAdapterContractError(
          'BOOKING_ADAPTER_SYNC_MODE_UNSUPPORTED',
          'Native booking translator does not support the requested sync mode.'
        );
      }
      const guestDataMode = String(context.guestDataMode || 'NONE').trim().toUpperCase();
      if (!GUEST_DATA_MODES.includes(guestDataMode)) {
        throw new BookingReadAdapterContractError(
          'BOOKING_ADAPTER_GUEST_MODE_INVALID',
          'Native booking translator guest data mode is invalid.'
        );
      }
      let translated;
      try {
        translated = normalized.translatePage(rawPage, {
          request,
          externalLocationId: String(context.externalLocationId || ''),
          guestDataMode,
          providerContext: context.providerContext || null
        });
      } catch (error) {
        if (error instanceof BookingReadAdapterContractError || error.code === 'BOOKING_FEED_SCHEMA_INVALID') throw error;
        throw new BookingReadAdapterContractError(
          'BOOKING_NATIVE_TRANSLATION_FAILED',
          'Native booking provider response could not be translated safely.'
        );
      }
      const page = validateAndNormalizeBookingPage(translated, { guestDataMode });
      return validateNormalizedBookingAdapterPage(page, {
        externalLocationId: context.externalLocationId,
        guestDataMode,
        syncMode: request.syncMode
      });
    }
  };
  return Object.freeze(translator);
}

function assertRuntimeNativeBookingTranslator(translator) {
  if (!translator || translator.kind !== 'NATIVE_PROVIDER') {
    throw new ValidationError('Conformance fixture translators cannot be registered as runtime booking providers');
  }
  return translator;
}

class NativeBookingReadAdapter extends BookingAdapter {
  constructor({
    translator,
    configuration = {},
    externalLocationId,
    guestDataMode = 'NONE',
    providerContext = null
  }) {
    super(configuration);
    if (!translator || typeof translator.translateProviderPage !== 'function') {
      throw new ValidationError('Native booking adapter requires a defined translator');
    }
    if (!externalLocationId || String(externalLocationId).length > 255) {
      throw new ValidationError('Native booking adapter requires externalLocationId');
    }
    this.translator = translator;
    this.providerKey = translator.providerKey;
    this.externalLocationId = String(externalLocationId);
    this.guestDataMode = String(guestDataMode || 'NONE').trim().toUpperCase();
    this.providerContext = providerContext;
  }

  async fetchProviderBookingsPage(_request) {
    throw new Error('fetchProviderBookingsPage() not implemented');
  }

  async fetchBookingsPage(request) {
    const normalizedRequest = normalizeBookingReadRequest(request);
    const rawPage = await this.fetchProviderBookingsPage(normalizedRequest);
    return this.translator.translateProviderPage(rawPage, {
      request: normalizedRequest,
      externalLocationId: this.externalLocationId,
      guestDataMode: this.guestDataMode,
      providerContext: this.providerContext
    });
  }
}

module.exports = {
  PAGINATION_STRATEGIES,
  TRANSLATOR_KINDS,
  normalizeTranslatorDefinition,
  defineNativeBookingTranslator,
  assertRuntimeNativeBookingTranslator,
  NativeBookingReadAdapter
};
