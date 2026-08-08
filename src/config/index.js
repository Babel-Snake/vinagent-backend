// src/config/index.js
// Centralised configuration loader using environment variables.

const dotenv = require('dotenv');
dotenv.config();

const {
  formatProductionEnvironmentIssues,
  validateProductionEnvironment
} = require('../services/deploymentEnvironment.service');

// Fail-Fast for Production
if (process.env.NODE_ENV === 'production') {
  const validation = validateProductionEnvironment(process.env);
  if (!validation.ready) {
    // Use console.error because logger might depend on invalid config or not be initialized fully
    console.error(`FATAL: Invalid production configuration: ${formatProductionEnvironmentIssues(validation.issues)}`);
    process.exit(1);
  }
}

module.exports = {
  port: process.env.PORT || 4000,
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'vinagent',
    password: process.env.DB_PASSWORD || 'vinagent',
    name: process.env.DB_NAME || 'vinagent_dev'
  },
  logLevel: process.env.LOG_LEVEL || 'info',
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
    privateKey: process.env.FIREBASE_PRIVATE_KEY
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      : ''
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || ''
  },
  auth: {
    allowTestBypass: process.env.ALLOW_TEST_AUTH_BYPASS === 'true',
    // Expected issuer for Firebase
    expectedIssuerPrefix: 'https://securetoken.google.com/'
  }
};
