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
      // Option: Auto-create user or Reject.
      // For development speed, let's map to the FIRST user in DB if email doesn't match, 
      // OR return 403.
      // Let's log warning and map to Seed User #1 (Manager) if it exists, to prevent blocking the User's manual testing 
      // if they haven't set up the User in DB yet.
      // BETTER: Just return 403 Forbidden so we know we need to create the user.
      // logger.warn(`User not found for email ${email}. Returning 403.`);
      // return res.status(403).json({ error: { code: 'USER_NOT_FOUND', message: 'No account found for this email.' } });

      // TEMPORARY FALLBACK for Dev: Attach payload with firebase info so we can inspect it
      // Or actually, let's just look up ID 1 for now if not found, effectively "Super Admin" mode for dev.
      // user = await User.findByPk(1); 
      // logger.warn(`User not found for ${email}. Falling back to Seed User ID: 1`);

      // Actually, let's just create a basic user record if not found?
      // No, that might pollute DB.

      // Strict approach:
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

module.exports = {
  authMiddleware
};
