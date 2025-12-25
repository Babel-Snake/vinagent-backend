const admin = require('../config/firebase');
const logger = require('../config/logger');
const { User, Winery } = require('../models');

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [, token] = authHeader.split(' ');

  if (!token) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Missing or invalid authentication token'
      }
    });
  }

  try {
    // 1. Test Bypass (Explicit Config Only)
    // Replaces implicit NODE_ENV check
    const { auth, firebase } = require('../config');

    if (auth.allowTestBypass && token === 'mock-token') {
      // ... Valid Mock Logic ...
      const user = await User.findOne({
        where: { email: 'stub@example.com' },
        include: [{ model: Winery, attributes: ['name'] }]
      });

      if (!user) {
        return res.status(403).json({
          error: {
            code: 'ACCESS_DENIED',
            message: 'Test user not registered in system.'
          }
        });
      }

      req.user = {
        id: user.id,
        userId: user.id,
        email: user.email,
        role: user.role,
        wineryId: user.wineryId,
        wineryName: user.Winery ? user.Winery.name : 'Unknown Winery',
        firebaseUid: 'test-mock-token'
      };

      return next();
    }

    // 2. Verify Token (Firebase)
    // admin.auth().verifyIdToken automatically checks signature, expiration, and formatting.
    // It also checks audience (project_id) and issuer.
    const decodedToken = await admin.auth().verifyIdToken(token);
    const { uid, email, iss, aud } = decodedToken;

    // 3. Extra Hardening: Explicit Issuer/Audience Check
    // (Redundant but requested for hardening)
    const expectedIssuer = `${auth.expectedIssuerPrefix}${firebase.projectId}`;
    if (iss !== expectedIssuer) {
      logger.warn('Auth: Invalid token issuer', { iss, expected: expectedIssuer });
      throw new Error('Invalid token issuer');
    }

    if (aud !== firebase.projectId) {
      logger.warn('Auth: Invalid token audience', { aud, expected: firebase.projectId });
      throw new Error('Invalid token audience');
    }

    // 4. Find Internal User
    let user = await User.findOne({
      where: { email },
      include: [{ model: Winery, attributes: ['name'] }]
    });

    if (!user) {
      // Strict: Reject users not in our DB
      logger.warn(`Auth: User not found in DB for email ${email}`);
      return res.status(403).json({ error: { code: 'ACCESS_DENIED', message: 'User not registered in system.' } });
    }

    req.user = {
      id: user.id,
      userId: user.id, // Legacy compatibility
      email: user.email,
      role: user.role,
      wineryId: user.wineryId,
      wineryName: user.Winery ? user.Winery.name : 'Unknown Winery',
      firebaseUid: uid
    };

    next();
  } catch (err) {
    logger.warn('Auth Token Verification Failed', { error: err.message });
    return res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Invalid or expired token'
      }
    });
  }
}

function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions'
        }
      });
    }
    next();
  };
}

module.exports = {
  authMiddleware,
  requireRole
};
