const express = require('express');
const { errorHandler } = require('./middleware/errorHandler');
const apiRoutes = require('./routes');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const requestLogger = require('./middleware/requestLogger');

const app = express();
const cors = require('cors');

// Security Headers
app.use(helmet());

// Logging
app.use(requestLogger);

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Skip webhooks as they have their own dedicated limiter (allowing bursts)
  skip: (req) => req.path.startsWith('/api/webhooks')
});
app.use(limiter);

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
