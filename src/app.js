const express = require('express');
const { errorHandler } = require('./middleware/errorHandler');
const apiRoutes = require('./routes');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const requestLogger = require('./middleware/requestLogger');

const requestId = require('./middleware/requestId');

const app = express();
const cors = require('cors');
const publicUrl = process.env.PUBLIC_URL ? new URL(process.env.PUBLIC_URL) : null;

// Trust proxy for HTTPS detection behind load balancers
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Redirect HTTP to HTTPS in production
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' &&
    req.headers['x-forwarded-proto'] !== 'https') {
    if (!publicUrl) {
      return res.status(500).json({ error: 'Server configuration error' });
    }
    const redirectUrl = new URL(req.originalUrl || req.url, publicUrl);
    redirectUrl.protocol = 'https:';
    return res.redirect(301, redirectUrl.toString());
  }
  next();
});

// Correlation ID (First middleware)
app.use(requestId);

app.use(helmet());

// Logging
app.use(requestLogger);

// CORS must be before rate limiter so 429s have headers
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
  credentials: true
}));

// Rate Limiting
const limiter = rateLimit({
  windowMs: (process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000), // Default 15 mins
  max: (process.env.RATE_LIMIT_MAX || 1000), // Increased to 1000 to allow polling
  standardHeaders: true,
  legacyHeaders: false,
  // Skip webhooks as they have their own dedicated limiter (allowing bursts)
  skip: (req) => req.path.startsWith('/api/webhooks')
});
app.use(limiter);

function captureRawBody(req, _res, buf) {
  req.rawBody = Buffer.from(buf);
}

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '10mb', verify: captureRawBody }));
app.use(express.urlencoded({ extended: true, limit: process.env.JSON_BODY_LIMIT || '10mb', verify: captureRawBody }));

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
