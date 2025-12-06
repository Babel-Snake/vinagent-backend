const express = require('express');
const { errorHandler } = require('./middleware/errorHandler');
const apiRoutes = require('./routes');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount all /api routes
app.use('/api', apiRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Central error handler (placeholder)
app.use(errorHandler);

module.exports = app;
