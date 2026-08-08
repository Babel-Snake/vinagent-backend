const express = require('express');
const { errorHandler } = require('./middleware/errorHandler');
const apiRoutes = require('./routes');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const requestLogger = require('./middleware/requestLogger');
const healthRoutes = require('./routes/health.routes');
const { createHttpsEnforcement } = require('./middleware/httpsEnforcement');
const { usageRequestMeter } = require('./middleware/usageRequestMeter');

const requestId = require('./middleware/requestId');

const app = express();
const cors = require('cors');

// Trust proxy for HTTPS detection behind load balancers
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Correlation ID and security headers are present on every response, including probes.
app.use(requestId);
app.use(helmet());
app.use(requestLogger);

// Container orchestration probes must work over the private HTTP listener.
// These routes are deliberately unauthenticated and mounted before the public
// HTTPS redirect; they expose only bounded status codes, never dependency errors.
app.use('/health', healthRoutes);

// All non-probe production traffic must arrive through the trusted HTTPS proxy.
app.use(createHttpsEnforcement());

// CORS must be before rate limiter so 429s have headers
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

// Rate Limiting
// Webhook routes are parsed later with a dedicated body-size cap, so their
// limiter must also run here before any unauthenticated body is buffered.
const webhookPreParseLimiter = rateLimit({
  windowMs: Number(process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  limit: Number(process.env.WEBHOOK_RATE_LIMIT_MAX) || 1000,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/webhooks', webhookPreParseLimiter);

const limiter = rateLimit({
  windowMs: (process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000), // Default 15 mins
  max: (process.env.RATE_LIMIT_MAX || 1000), // Increased to 1000 to allow polling
  standardHeaders: true,
  legacyHeaders: false,
  // Webhooks use the early limiter above plus route-specific limits.
  skip: (req) => req.path.startsWith('/api/webhooks')
});
app.use(limiter);

function captureRawBody(req, _res, buf) {
  req.rawBody = Buffer.from(buf);
}

// Public webhook routes do not need the larger attachment-friendly JSON
// allowance. Parse them first with a tighter cap so unauthenticated callers
// cannot force the server to buffer multi-megabyte signed-request candidates.
app.use('/api/webhooks', express.json({
  limit: process.env.WEBHOOK_BODY_LIMIT || '1mb',
  verify: captureRawBody
}));
app.use('/api/webhooks', express.urlencoded({
  extended: true,
  limit: process.env.WEBHOOK_BODY_LIMIT || '1mb',
  verify: captureRawBody
}));

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '10mb', verify: captureRawBody }));
app.use(express.urlencoded({ extended: true, limit: process.env.JSON_BODY_LIMIT || '10mb', verify: captureRawBody }));

// Root health check for "Cannot GET /" fix
app.get('/', (req, res) => {
  res.json({ service: 'VinAgent API', status: 'running' });
});

// Mount all /api routes
app.use('/api', usageRequestMeter);
app.use('/api', apiRoutes);

// Central error handler (placeholder)
app.use(errorHandler);

module.exports = app;
