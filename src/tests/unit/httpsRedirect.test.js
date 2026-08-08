const { buildHttpsRedirectUrl, parsePublicHttpUrl } = require('../../utils/httpsRedirect');

describe('HTTPS redirect URL hardening', () => {
  it('keeps protocol-relative request targets on the configured origin', () => {
    const redirect = new URL(buildHttpsRedirectUrl(
      'http://api.winery.example:3000/configured/path?ignored=yes',
      '//attacker.example/steal?source=request'
    ));

    expect(redirect.protocol).toBe('https:');
    expect(redirect.host).toBe('api.winery.example:3000');
    expect(redirect.pathname).toBe('//attacker.example/steal');
    expect(redirect.search).toBe('?source=request');
  });

  it('preserves a normal request path and query on the configured origin', () => {
    expect(buildHttpsRedirectUrl('https://api.winery.example', '/api/tasks?page=2'))
      .toBe('https://api.winery.example/api/tasks?page=2');
  });

  it('rejects non-HTTP public URLs and embedded credentials', () => {
    expect(() => parsePublicHttpUrl('javascript:alert(1)')).toThrow(/http or https/i);
    expect(() => parsePublicHttpUrl('https://user:password@api.winery.example')).toThrow(/credentials/i);
  });
});
