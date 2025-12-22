// src/config/db.js
// Sequelize initialization stub. Codex will implement the actual connection
// and model loading based on DOMAIN_MODEL.md.

const { Sequelize } = require('sequelize');
const { db } = require('./index');
const logger = require('./logger');

const sequelize = new Sequelize(db.name, db.user, db.password, {
  host: db.host,
  port: db.port,
  dialect: 'mysql',
  logging: (msg) => logger.debug(msg)
});

// Connection factory only. Models are loaded by src/models/index.js

module.exports = {
  sequelize
};
