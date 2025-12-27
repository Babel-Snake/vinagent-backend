/**
 * Sanitizes objects to remove sensitive keys or mask values.
 * Used for logging and persistence of raw payloads.
 */

const SENSITIVE_KEYS = [
    'password', 'token', 'auth', 'authorization', 'secret',
    'credit_card', 'cc_number', 'cvv', 'cvc', 'ssn',
    'dob', 'birthdate'
];

/**
 * Recursively redacts sensitive keys in an object.
 * @param {Object} obj 
 * @returns {Object} New object with redacted values
 */
function redact(obj) {
    if (!obj) return obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(redact);

    const newObj = {};
    for (const key of Object.keys(obj)) {
        const lowerKey = key.toLowerCase();
        if (SENSITIVE_KEYS.some(sk => lowerKey.includes(sk))) {
            newObj[key] = '[REDACTED]';
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
            newObj[key] = redact(obj[key]);
        } else {
            newObj[key] = obj[key];
        }
    }
    return newObj;
}

/**
 * Specific PII scrubber for message bodies (basic regex).
 * @param {string} text 
 * @returns {string} Text with potential PII masked
 */
function scrubPII(text) {
    if (!text) return text;
    // Basic Credit Card (13-19 digits)
    let cleaned = text.replace(/\b(?:\d[ -]*?){13,16}\b/g, '[CREDIT_CARD]');

    // Email (Basic) - We might want to keep email for context, but obscure it if requested.
    // cleaned = cleaned.replace(/\b[\w\.-]+@[\w\.-]+\.\w{2,4}\b/g, '[EMAIL]');

    // SSN (US)
    cleaned = cleaned.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]');

    return cleaned;
}

module.exports = {
    redact,
    scrubPII
};
