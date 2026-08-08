const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

export const ADDRESS_FIELDS = [
  'addressLine1',
  'addressLine2',
  'suburb',
  'state',
  'postcode',
  'country',
];

/**
 * Read a member action token from a generated fragment link, while continuing
 * to accept older query-string links during rollout.
 */
export function extractActionToken(input) {
  try {
    const url = new URL(input);
    const fragmentToken = new URLSearchParams(url.hash.replace(/^#/, '')).get('token');
    const queryToken = url.searchParams.get('token');

    if (fragmentToken && TOKEN_PATTERN.test(fragmentToken)) return fragmentToken;
    if (queryToken && TOKEN_PATTERN.test(queryToken)) return queryToken;
    return null;
  } catch {
    return null;
  }
}

/**
 * Coerce an untrusted API address into the six strings used by the form.
 */
export function normalizeAddress(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(
    ADDRESS_FIELDS.map((field) => [field, typeof source[field] === 'string' ? source[field] : '']),
  );
}

/**
 * Mirror the public API's address constraints before consuming a one-time
 * token. The server remains authoritative.
 */
export function validateAddressForm(address) {
  const errors = {};

  for (const field of ADDRESS_FIELDS) {
    const value = typeof address?.[field] === 'string' ? address[field].trim() : '';
    if (field === 'addressLine1' && !value) {
      errors[field] = 'Address line 1 is required.';
    } else if (value.length > 255) {
      errors[field] = 'Use 255 characters or fewer.';
    }
  }

  return errors;
}

export function buildPublicAddressEndpoint(apiOrigin, action) {
  const origin = (apiOrigin || 'http://localhost:4000').replace(/\/+$/, '');
  if (action !== 'validate' && action !== 'confirm') {
    throw new Error('Unsupported public address action');
  }
  return `${origin}/api/public/address-update/${action}`;
}

/**
 * Convert public API errors into a small, non-sensitive set of customer states.
 * Raw backend messages are intentionally never rendered.
 */
export function mapAddressActionError(status, code) {
  if (code === 'TOKEN_EXPIRED') {
    return {
      view: 'expired',
      heading: 'This link has expired',
      message: 'Please contact the winery and ask for a new address confirmation link.',
    };
  }

  if (code === 'TOKEN_ALREADY_USED') {
    return {
      view: 'used',
      heading: 'This link has already been used',
      message: 'No further action is needed. Contact the winery if you still need to change your address.',
    };
  }

  if (status === 429) {
    return {
      view: 'rate-limited',
      heading: 'Please wait before trying again',
      message: 'There have been too many attempts. Please wait a few minutes and reopen your link.',
    };
  }

  if (status >= 500 || status === 0) {
    return {
      view: 'service-error',
      heading: 'We could not load this update',
      message: 'The service is temporarily unavailable. Please try your link again shortly.',
    };
  }

  return {
    view: 'unavailable',
    heading: 'This link is not available',
    message: 'It may be invalid or no longer active. Please contact the winery if you need another link.',
  };
}

