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
    // Verify Token
    const decodedToken = await admin.auth().verifyIdToken(token);
    const { uid, email } = decodedToken;

    // Find Internal User
    // note: In a real app, we might sync users on login. 
    // For now, let's try to match by email, or fallback to a default "Manager" role if not found (for easy testing).
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
