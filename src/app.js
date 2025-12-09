const express = require('express');
const { errorHandler } = require('./middleware/errorHandler');
const apiRoutes = require('./routes');

const app = express();
const cors = require('cors');

app.use(cors({
  origin: 'http://localhost:3001',
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root health check for "Cannot GET /" fix
app.get('/', (req, res) => {
  res.json({ service: 'VinAgent API', status: 'running' });
});

// Mount all /api routes
app.use('/api', apiRoutes);

// Health check (keep existing /health too)
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Central error handler (placeholder)
app.use(errorHandler);

module.exports = app;
