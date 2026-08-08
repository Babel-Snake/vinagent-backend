jest.mock('../../services/integrationConnection.service', () => ({
  resolveExecutionConfig: jest.fn()
}));

const integrationConnectionService = require('../../services/integrationConnection.service');
const bookingFactory = require('../../services/integrations/booking');
const crmFactory = require('../../services/integrations/crm');

describe('integration provider fail-closed policy', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAllowMocks = process.env.ALLOW_MOCK_INTEGRATIONS;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalAllowMocks === undefined) delete process.env.ALLOW_MOCK_INTEGRATIONS;
    else process.env.ALLOW_MOCK_INTEGRATIONS = originalAllowMocks;
    jest.clearAllMocks();
  });

  it.each([
    ['booking', bookingFactory],
    ['CRM', crmFactory]
  ])('blocks %s mock execution in production even when the opt-in variable is set', async (_domain, factory) => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_MOCK_INTEGRATIONS = 'true';
    integrationConnectionService.resolveExecutionConfig.mockResolvedValue({
      provider: 'mock',
      config: { selectedProvider: 'not-yet-integrated' }
    });

    await expect(factory.getProvider(1)).rejects.toMatchObject({
      code: 'MOCK_INTEGRATION_DISABLED'
    });
  });

  it('requires an explicit opt-in for mock execution during development', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.ALLOW_MOCK_INTEGRATIONS;
    integrationConnectionService.resolveExecutionConfig.mockResolvedValue({
      provider: 'mock',
      config: { selectedProvider: 'mock' }
    });

    await expect(bookingFactory.getProvider(1)).rejects.toMatchObject({
      code: 'MOCK_INTEGRATION_DISABLED'
    });

    process.env.ALLOW_MOCK_INTEGRATIONS = 'true';
    await expect(bookingFactory.getProvider(1)).resolves.toBeDefined();
  });

  it('allows deterministic mock providers in the test environment', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.ALLOW_MOCK_INTEGRATIONS;
    integrationConnectionService.resolveExecutionConfig.mockResolvedValue({
      provider: 'mock',
      config: { selectedProvider: 'mock' }
    });

    await expect(crmFactory.getProvider(1)).resolves.toBeDefined();
  });

  it('rejects unknown providers instead of silently falling back to a mock', async () => {
    process.env.NODE_ENV = 'test';
    integrationConnectionService.resolveExecutionConfig.mockResolvedValue({
      provider: 'typo-provider',
      config: {}
    });

    await expect(bookingFactory.getProvider(1)).rejects.toMatchObject({
      code: 'INTEGRATION_PROVIDER_UNSUPPORTED'
    });
  });
});
