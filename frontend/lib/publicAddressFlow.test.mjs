import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPublicAddressEndpoint,
  extractActionToken,
  mapAddressActionError,
  normalizeAddress,
  validateAddressForm,
} from './publicAddressFlow.mjs';

const TOKEN = 'a'.repeat(64);

test('extracts new fragment tokens without requiring a query string', () => {
  assert.equal(extractActionToken(`https://portal.example.test/confirm-address#token=${TOKEN}`), TOKEN);
});

test('accepts legacy query tokens but rejects malformed values', () => {
  assert.equal(extractActionToken(`https://portal.example.test/confirm-address?token=${TOKEN}`), TOKEN);
  assert.equal(extractActionToken('https://portal.example.test/confirm-address?token=short'), null);
  assert.equal(extractActionToken('not a URL'), null);
});

test('normalizes only known string address fields', () => {
  assert.deepEqual(normalizeAddress({ addressLine1: '12 Oak Street', postcode: 5152, extra: 'ignored' }), {
    addressLine1: '12 Oak Street',
    addressLine2: '',
    suburb: '',
    state: '',
    postcode: '',
    country: '',
  });
});

test('requires address line 1 and mirrors the API length limit', () => {
  assert.equal(validateAddressForm(normalizeAddress({})).addressLine1, 'Address line 1 is required.');
  assert.equal(
    validateAddressForm(normalizeAddress({ addressLine1: 'A', suburb: 'x'.repeat(256) })).suburb,
    'Use 255 characters or fewer.',
  );
  assert.deepEqual(validateAddressForm(normalizeAddress({ addressLine1: '12 Oak Street' })), {});
});

test('builds public endpoints from an origin with or without a trailing slash', () => {
  assert.equal(
    buildPublicAddressEndpoint('https://api.example.test/', 'validate'),
    'https://api.example.test/api/public/address-update/validate',
  );
});

test('maps API failures without exposing raw server messages', () => {
  assert.equal(mapAddressActionError(400, 'TOKEN_EXPIRED').view, 'expired');
  assert.equal(mapAddressActionError(400, 'TOKEN_ALREADY_USED').view, 'used');
  assert.equal(mapAddressActionError(404, 'TOKEN_NOT_FOUND').view, 'unavailable');
  assert.equal(mapAddressActionError(500, 'INTERNAL_ERROR').view, 'service-error');
  assert.equal(mapAddressActionError(0).view, 'service-error');
});

