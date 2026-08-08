jest.mock('../../services/notifications/providers/twilio.provider', () => ({
  sendSms: jest.fn()
}));
jest.mock('../../services/notifications/providers/sendgrid.provider', () => ({
  sendEmail: jest.fn()
}));
jest.mock('../../services/integrations/email', () => ({
  getProvider: jest.fn()
}));
jest.mock('../../models', () => ({
  Message: { create: jest.fn() },
  WineryIntegrationConfig: { findOne: jest.fn() }
}));
jest.mock('../../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

const twilioProvider = require('../../services/notifications/providers/twilio.provider');
const sendgridProvider = require('../../services/notifications/providers/sendgrid.provider');
const notificationService = require('../../services/notifications/notification.service');

describe('notification provider routing security', () => {
  afterEach(() => jest.clearAllMocks());

  it('does not route an unsupported SMS provider through Twilio', async () => {
    await expect(notificationService.send({
      to: '+15551234567',
      body: 'Private message',
      channel: 'sms'
    }, {
      integrationConfig: { smsProvider: 'messagemedia' }
    })).rejects.toMatchObject({ code: 'INTEGRATION_PROVIDER_UNSUPPORTED' });

    expect(twilioProvider.sendSms).not.toHaveBeenCalled();
  });

  it.each(['mailgun', 'ses', 'other'])(
    'does not route unsupported %s email through SendGrid',
    async (emailProvider) => {
      await expect(notificationService.send({
        to: 'guest@example.com',
        body: 'Private message',
        channel: 'email'
      }, {
        integrationConfig: { emailProvider }
      })).rejects.toMatchObject({ code: 'INTEGRATION_PROVIDER_UNSUPPORTED' });

      expect(sendgridProvider.sendEmail).not.toHaveBeenCalled();
    }
  );

  it('continues to use Twilio when Twilio is selected', async () => {
    twilioProvider.sendSms.mockResolvedValue({ sid: 'SM123', status: 'queued', provider: 'twilio' });

    await expect(notificationService.send({
      to: '+15551234567',
      body: 'Message',
      channel: 'sms'
    }, {
      integrationConfig: { smsProvider: 'twilio' }
    })).resolves.toMatchObject({ sid: 'SM123', provider: 'twilio' });

    expect(twilioProvider.sendSms).toHaveBeenCalledTimes(1);
  });
});
