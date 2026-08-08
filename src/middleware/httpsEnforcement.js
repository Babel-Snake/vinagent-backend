const { buildHttpsRedirectUrl, parsePublicHttpUrl } = require('../utils/httpsRedirect');

function createHttpsEnforcement({
  environment = process.env.NODE_ENV,
  publicUrl = process.env.PUBLIC_URL
} = {}) {
  const parsedPublicUrl = publicUrl ? parsePublicHttpUrl(publicUrl) : null;

  return (req, res, next) => {
    if (environment !== 'production' || req.secure) return next();
    if (!parsedPublicUrl) {
      return res.status(500).json({ error: 'Server configuration error' });
    }
    return res.redirect(301, buildHttpsRedirectUrl(parsedPublicUrl, req.originalUrl || req.url));
  };
}

module.exports = {
  createHttpsEnforcement
};
