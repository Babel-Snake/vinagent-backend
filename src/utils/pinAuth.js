const crypto = require('crypto');

const PIN_PATTERN = /^[A-Za-z0-9]{4,12}$/;
const HASH_PREFIX = 'scrypt';
const DEV_SESSION_SECRET = 'vinagent-dev-pin-session-secret';
const MIN_PRODUCTION_SECRET_LENGTH = 32;

function getSecret() {
  const secret = process.env.PIN_SESSION_SECRET || process.env.SESSION_SECRET;

  if (process.env.NODE_ENV === 'production') {
    if (!secret) {
      throw new Error('PIN_SESSION_SECRET or SESSION_SECRET is required in production.');
    }
    if (secret === DEV_SESSION_SECRET || secret.length < MIN_PRODUCTION_SECRET_LENGTH) {
      throw new Error(`PIN session secret must be at least ${MIN_PRODUCTION_SECRET_LENGTH} characters and cannot use the development fallback.`);
    }
  }

  return secret || DEV_SESSION_SECRET;
}

function assertPinSessionSecret() {
  getSecret();
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlJson(value) {
  return base64UrlEncode(JSON.stringify(value));
}

function sign(value) {
  return crypto.createHmac('sha256', getSecret()).update(value).digest('base64url');
}

function validatePin(pin) {
  return typeof pin === 'string' && PIN_PATTERN.test(pin.trim());
}

function hashPin(pin) {
  const normalized = String(pin).trim();
  if (!validatePin(normalized)) {
    const err = new Error('PIN must be 4 to 12 letters or numbers.');
    err.statusCode = 400;
    err.code = 'INVALID_PIN';
    throw err;
  }

  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = crypto.scryptSync(normalized, salt, 32).toString('base64url');
  return `${HASH_PREFIX}$${salt}$${hash}`;
}

function verifyPin(pin, storedHash) {
  if (!validatePin(String(pin || '')) || !storedHash) return false;

  const [prefix, salt, hash] = String(storedHash).split('$');
  if (prefix !== HASH_PREFIX || !salt || !hash) return false;

  const candidate = crypto.scryptSync(String(pin).trim(), salt, 32);
  const expected = Buffer.from(hash, 'base64url');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

function createPinSessionToken({
  user,
  sessionRole,
  authMode,
  expiresInSeconds
}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    wineryId: user.wineryId,
    displayName: user.displayName,
    email: user.email,
    role: sessionRole,
    actualRole: user.role,
    authMode,
    iat: now,
    exp: now + expiresInSeconds
  };
  const encodedPayload = base64UrlJson(payload);
  return `pin.${encodedPayload}.${sign(encodedPayload)}`;
}

function verifyPinSessionToken(token) {
  if (!token || !token.startsWith('pin.')) {
    throw new Error('Not a PIN session token');
  }

  const [, encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) {
    throw new Error('Malformed PIN session token');
  }

  const expectedSignature = sign(encodedPayload);
  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new Error('Invalid PIN session signature');
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('PIN session expired');
  }

  return payload;
}

module.exports = {
  assertPinSessionSecret,
  createPinSessionToken,
  hashPin,
  validatePin,
  verifyPin,
  verifyPinSessionToken
};
