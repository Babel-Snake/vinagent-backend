function parsePublicHttpUrl(value) {
  const parsed = value instanceof URL ? new URL(value.toString()) : new URL(String(value || ''));
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new TypeError('PUBLIC_URL must use http or https.');
  }
  if (parsed.username || parsed.password) {
    throw new TypeError('PUBLIC_URL must not contain credentials.');
  }
  return parsed;
}

function buildHttpsRedirectUrl(publicUrl, requestTarget = '/') {
  const target = parsePublicHttpUrl(publicUrl);
  target.protocol = 'https:';
  target.hash = '';

  const rawTarget = String(requestTarget || '/');
  if (/[\r\n]/.test(rawTarget)) {
    throw new TypeError('Request target contains invalid characters.');
  }

  const queryIndex = rawTarget.indexOf('?');
  const rawPath = queryIndex >= 0 ? rawTarget.slice(0, queryIndex) : rawTarget;
  const rawQuery = queryIndex >= 0 ? rawTarget.slice(queryIndex + 1) : '';

  // Assign the path and query separately. In particular, a request target such
  // as //attacker.example/path must remain a path on the configured API origin
  // instead of being interpreted by URL() as a protocol-relative host.
  target.pathname = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  target.search = rawQuery ? `?${rawQuery}` : '';

  return target.toString();
}

module.exports = {
  buildHttpsRedirectUrl,
  parsePublicHttpUrl
};
