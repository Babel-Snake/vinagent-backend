require('dotenv').config();
const { db } = require('./index');

module.exports = {
    development: {
        username: db.user,
        password: db.password,
        database: db.name,
        host: db.host,
        port: db.port,
        dialect: 'mysql'
    },
    test: {
        username: db.user,
        password: db.password,
        database: db.name + '_test',
        host: db.host,
        port: db.port,
        dialect: 'mysql'
    },
    production: {
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: 'mysql'
    }
};
