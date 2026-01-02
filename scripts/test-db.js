console.log("Loading models...");
require('dotenv').config();
const { sequelize } = require('../src/models');
console.log("Authenticating...");
sequelize.authenticate()
    .then(() => {
        console.log("✅ Database Connected Successfully");
        process.exit(0);
    })
    .catch(e => {
        console.error("❌ Database Connection Failed:", e.message);
        process.exit(1);
    });
