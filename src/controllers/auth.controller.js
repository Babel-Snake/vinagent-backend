const { User } = require('../models');

/**
 * Resolve staff email from username.
 * GET /api/public/resolve-staff?username=sarah
 */
/**
 * Get current user context.
 * GET /api/auth/me
 */
exports.getMe = (req, res) => {
    res.json({
        user: req.user
    });
};

exports.resolveStaff = async (req, res, next) => {
    try {
        const { username } = req.query;

        if (!username) {
            return res.status(400).json({ error: 'Username is required' });
        }

        // Search for 'staff' users with this username (displayName)
        const matches = await User.findAll({
            where: {
                displayName: username,
                role: 'staff'
            },
            attributes: ['id', 'email', 'wineryId']
        });

        if (matches.length === 0) {
            return res.status(404).json({ error: 'Staff member not found.' });
        }

        if (matches.length > 1) {
            return res.status(409).json({
                error: 'Multiple staff found with this username. Please use your Winery ID.',
                ambiguous: true
            });
        }

        const user = matches[0];
        res.json({
            email: user.email,
            wineryId: user.wineryId
        });

    } catch (error) {
        next(error);
    }
};
