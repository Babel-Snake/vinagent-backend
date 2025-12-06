// src/config/index.js
// Centralised configuration loader using environment variables.

require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
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
  }
};
