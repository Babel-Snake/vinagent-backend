const { User } = require('../models');
const AppError = require('../utils/AppError');

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
            throw new AppError('Username is required', 400, 'MISSING_PARAM');
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
            throw new AppError('Staff member not found.', 404, 'NOT_FOUND');
        }

        if (matches.length > 1) {
            throw new AppError('Multiple staff found with this username. Please use your Winery ID.', 409, 'AMBIGUOUS_USERNAME', { ambiguous: true });
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
