const {
  CredentialStoreUnavailableError,
  CredentialDecryptionError,
  loadCredentialKeyring,
  normalizeCredentialSecret,
  encryptCredentialPayload,
  decryptCredentialRecord
} = require('../../services/integrationCredential.service');

const enabledEnvironment = (key = Buffer.alloc(32, 7)) => ({
  INTEGRATION_CREDENTIALS_ENABLED: 'true',
  INTEGRATION_CREDENTIAL_ACTIVE_KEY_ID: 'test-v1',
  INTEGRATION_CREDENTIAL_ENCRYPTION_KEY: key.toString('base64')
});

describe('protected integration credentials', () => {
  test('fails closed while the store is disabled or its key is malformed', () => {
    expect(() => loadCredentialKeyring({})).toThrow(CredentialStoreUnavailableError);
    expect(() => loadCredentialKeyring({
      ...enabledEnvironment(),
      INTEGRATION_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64')
    })).toThrow(CredentialStoreUnavailableError);
  });

  test('accepts only the exact secret fields for each credential type', () => {
    expect(normalizeCredentialSecret('bearer_token', { token: 'secret-value' })).toEqual({
      credentialType: 'BEARER_TOKEN',
      secret: { token: 'secret-value' }
    });
    expect(() => normalizeCredentialSecret('BEARER_TOKEN', {
      token: 'secret-value',
      endpoint: 'https://attacker.example'
    })).toThrow('not allowed');
    expect(() => normalizeCredentialSecret('UNKNOWN', { token: 'secret-value' })).toThrow('not supported');
  });

  test('encrypts with authenticated tenant/connection context and never embeds plaintext', () => {
    const context = {
      credentialId: '5ffbf386-f76f-4e42-b23e-66fa5a75267e',
      wineryId: 10,
      connectionId: 20,
      credentialType: 'BEARER_TOKEN',
      secret: { token: 'highly-sensitive-token' },
      env: enabledEnvironment()
    };
    const encrypted = encryptCredentialPayload(context);
    expect(JSON.stringify(encrypted)).not.toContain('highly-sensitive-token');
    const record = { ...context, ...encrypted, status: 'ACTIVE', schemaVersion: '1' };
    expect(decryptCredentialRecord(record, { env: context.env })).toEqual({
      credentialType: 'BEARER_TOKEN',
      secret: { token: 'highly-sensitive-token' }
    });

    expect(() => decryptCredentialRecord({ ...record, wineryId: 11 }, { env: context.env }))
      .toThrow(CredentialDecryptionError);
    expect(() => decryptCredentialRecord(record, { env: enabledEnvironment(Buffer.alloc(32, 8)) }))
      .toThrow(CredentialDecryptionError);
  });

  test('supports explicitly retained previous keys during rotation', () => {
    const oldKey = Buffer.alloc(32, 3);
    const newKey = Buffer.alloc(32, 4);
    const oldEnv = {
      INTEGRATION_CREDENTIALS_ENABLED: 'true',
      INTEGRATION_CREDENTIAL_ACTIVE_KEY_ID: 'old-v1',
      INTEGRATION_CREDENTIAL_ENCRYPTION_KEY: oldKey.toString('base64')
    };
    const context = {
      credentialId: '20909c46-c2b0-48af-a21e-4428c74e29ef',
      wineryId: 1,
      connectionId: 2,
      credentialType: 'API_KEY',
      secret: { apiKey: 'old-key-secret' }
    };
    const encrypted = encryptCredentialPayload({ ...context, env: oldEnv });
    const rotatedEnv = {
      INTEGRATION_CREDENTIALS_ENABLED: 'true',
      INTEGRATION_CREDENTIAL_ACTIVE_KEY_ID: 'new-v2',
      INTEGRATION_CREDENTIAL_ENCRYPTION_KEY: newKey.toString('base64'),
      INTEGRATION_CREDENTIAL_PREVIOUS_KEYS_JSON: JSON.stringify({
        'old-v1': oldKey.toString('base64')
      })
    };
    expect(decryptCredentialRecord({
      ...context,
      ...encrypted,
      status: 'ACTIVE',
      schemaVersion: '1'
    }, { env: rotatedEnv })).toMatchObject({ secret: { apiKey: 'old-key-secret' } });
  });
});
