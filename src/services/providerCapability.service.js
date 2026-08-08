function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function hasAllValues(values) {
  return values.every(value => String(value || '').trim().length > 0);
}

function assessProviderCapabilities({
  integrationConfig = null,
  winerySettings = null,
  areaIntegrationConfigs = [],
  env = process.env
} = {}) {
  const capabilities = [];
  const add = (capability, status, code) => capabilities.push({ capability, status, code });
  const channelsEnabled = parseJsonArray(integrationConfig?.channelsEnabled);
  const channelEnabled = channel => !channelsEnabled || channelsEnabled.includes(channel);
  const connections = parseJsonObject(integrationConfig?.providerConnections);

  if (!channelEnabled('sms')) {
    add('sms_delivery', 'disabled', 'CHANNEL_DISABLED');
  } else {
    const provider = integrationConfig?.smsProvider || 'twilio';
    if (provider !== 'twilio') {
      add('sms_delivery', 'fail', 'SMS_PROVIDER_UNSUPPORTED');
    } else if (!hasAllValues([
      env.TWILIO_ACCOUNT_SID,
      env.TWILIO_AUTH_TOKEN,
      integrationConfig?.smsFromNumber || env.TWILIO_PHONE_NUMBER
    ])) {
      add('sms_delivery', 'fail', 'TWILIO_CONFIGURATION_INCOMPLETE');
    } else {
      add('sms_delivery', 'pass', 'TWILIO_CONFIGURED');
    }
  }

  if (!channelEnabled('email')) {
    add('email_delivery', 'disabled', 'CHANNEL_DISABLED');
  } else {
    const provider = integrationConfig?.emailProvider || 'sendgrid';
    const emailConnection = parseJsonObject(connections.email);
    if (provider === 'sendgrid') {
      if (!hasAllValues([env.SENDGRID_API_KEY, integrationConfig?.emailFromAddress])) {
        add('email_delivery', 'fail', 'SENDGRID_CONFIGURATION_INCOMPLETE');
      } else {
        add('email_delivery', 'pass', 'SENDGRID_CONFIGURED');
      }
    } else if (provider === 'outlook') {
      if (!hasAllValues([
        env.OUTLOOK_GRAPH_TENANT_ID,
        env.OUTLOOK_GRAPH_CLIENT_ID,
        env.OUTLOOK_GRAPH_CLIENT_SECRET,
        emailConnection.externalAccountId || integrationConfig?.emailFromAddress
      ])) {
        add('email_delivery', 'fail', 'OUTLOOK_CONFIGURATION_INCOMPLETE');
      } else {
        add('email_delivery', 'pass', 'OUTLOOK_CONFIGURED');
      }
    } else {
      add('email_delivery', 'fail', 'EMAIL_PROVIDER_UNSUPPORTED');
    }
  }

  const bookingEnabled = winerySettings ? Boolean(winerySettings.enableBookingModule) : true;
  if (!bookingEnabled) {
    add('booking_execution', 'disabled', 'MODULE_DISABLED');
  } else {
    // The current factory contains mock-only execution. Mock providers are
    // deliberately blocked in production, and the named live adapters throw.
    add('booking_execution', 'fail', 'BOOKING_LIVE_ADAPTER_UNAVAILABLE');
  }

  const crmRequired = Boolean(winerySettings?.enableWineClubModule || winerySettings?.enableOrdersModule);
  if (!crmRequired) {
    add('crm_execution', 'disabled', 'MODULE_DISABLED');
  } else {
    add('crm_execution', 'fail', 'CRM_LIVE_ADAPTER_UNAVAILABLE');
  }

  if (!winerySettings?.enableVoice) {
    add('voice_webhooks', 'disabled', 'MODULE_DISABLED');
  } else {
    const retellConnections = [
      parseJsonObject(connections.retell),
      ...areaIntegrationConfigs.map(config => (
        parseJsonObject(parseJsonObject(config.providerConnections).retell)
      ))
    ];
    const hasRouting = retellConnections.some(connection => (
      String(connection.provider || '').trim().toLowerCase() === 'retell'
      && hasAllValues([connection.externalLocationId || connection.externalAccountId])
    ));
    const hasAuthentication = hasAllValues([env.RETELL_API_KEY || env.RETELL_WEBHOOK_SECRET]);
    add(
      'voice_webhooks',
      hasRouting && hasAuthentication ? 'pass' : 'fail',
      hasRouting && hasAuthentication ? 'RETELL_CONFIGURED' : 'RETELL_CONFIGURATION_INCOMPLETE'
    );
  }

  if (env.EMAIL_SYNC_ENABLED === 'true') {
    const provider = integrationConfig?.emailProvider || 'sendgrid';
    const emailConnection = parseJsonObject(connections.email);
    const syncConfigured = provider === 'outlook' && hasAllValues([
      env.OUTLOOK_GRAPH_TENANT_ID,
      env.OUTLOOK_GRAPH_CLIENT_ID,
      env.OUTLOOK_GRAPH_CLIENT_SECRET,
      emailConnection.externalAccountId || integrationConfig?.emailFromAddress
    ]);
    add(
      'email_sync',
      syncConfigured ? 'pass' : 'fail',
      syncConfigured
        ? 'OUTLOOK_SYNC_CONFIGURED'
        : (provider === 'outlook' ? 'OUTLOOK_SYNC_CONFIGURATION_INCOMPLETE' : 'EMAIL_SYNC_PROVIDER_UNSUPPORTED')
    );
  } else {
    add('email_sync', 'disabled', 'FEATURE_DISABLED');
  }

  const requiredAreaDomains = [
    ...(bookingEnabled ? ['booking'] : []),
    ...(crmRequired ? ['crm'] : [])
  ];
  const areaOverrides = areaIntegrationConfigs.reduce((count, config) => {
    const areaConnections = parseJsonObject(config.providerConnections);
    return count + requiredAreaDomains.filter(domain => Boolean(areaConnections[domain])).length;
  }, 0);
  if (areaOverrides > 0) {
    add('area_provider_overrides', 'fail', 'AREA_LIVE_ADAPTERS_UNAVAILABLE');
  } else {
    add('area_provider_overrides', 'pass', 'NO_UNSUPPORTED_OVERRIDES');
  }

  return {
    ready: capabilities.every(capability => capability.status !== 'fail'),
    capabilities
  };
}

module.exports = {
  assessProviderCapabilities,
  parseJsonArray,
  parseJsonObject
};
