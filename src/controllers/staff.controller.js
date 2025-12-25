const admin = require('../config/firebase');
const { User, Winery } = require('../models');
const AppError = require('../utils/AppError');

/**
 * Create a new Managed Staff account.
 * Only accessible by Managers or Admins.
 */
exports.createStaff = async (req, res, next) => {
    try {
        const { username, password } = req.body;
        const requester = req.user; // From authMiddleware

        // RBAC: Only Manager/Admin can create staff
        if (requester.role !== 'manager' && requester.role !== 'admin') {
            throw new AppError('Only Managers or Admins can create staff accounts.', 403, 'FORBIDDEN');
        }

        const wineryId = requester.wineryId;
        if (!wineryId) {
            throw new AppError('Manager must belong to a winery to create staff.', 400, 'WINERY_REQUIRED');
        }

        // 1. Generate Internal Email
        // Format: username.w{ID}@vinagent.internal
        // Sanitize username (alphanumeric only)
        const cleanUsername = username.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanUsername.length < 3) {
            throw new AppError('Username must be at least 3 alphanumeric characters.', 400, 'INVALID_USERNAME');
        }

        // Password Validation (min 8 chars, at least 1 number)
        if (!password || password.length < 8) {
            throw new AppError('Password must be at least 8 characters.', 400, 'WEAK_PASSWORD');
        }
        if (!/\d/.test(password)) {
            throw new AppError('Password must contain at least one number.', 400, 'WEAK_PASSWORD');
        }

        const email = `${cleanUsername}.w${wineryId}@vinagent.internal`;

        // 2. Create in Firebase
        let uid;
        try {
            const userRecord = await admin.auth().createUser({
                email: email,
                password: password,
                displayName: username, // Use original casing for display
                emailVerified: true
            });
            uid = userRecord.uid;
        } catch (fbError) {
            if (fbError.code === 'auth/email-already-exists') {
                throw new AppError('A staff member with this username already exists for this winery.', 409, 'USERNAME_TAKEN');
            }
            throw fbError;
        }

        // 3. Create in Database
        const newUser = await User.create({
            firebaseUid: uid,
            email: email,
            displayName: username,
            role: 'staff',
            wineryId: wineryId
        });

        res.status(201).json({
            message: 'Staff account created successfully.',
            staff: {
                id: newUser.id,
                username: cleanUsername,
                email: email,
                role: 'staff'
            }
        });

    } catch (error) {
        next(error);
    }
};

/**
 * List staff for the current user's winery.
 */
exports.listStaff = async (req, res, next) => {
    try {
        const requester = req.user;

        if (!requester.wineryId) {
            throw new AppError('User not associated with a winery.', 400, 'WINERY_REQUIRED');
        }

        const staffMembers = await User.findAll({
            where: {
                wineryId: requester.wineryId,
                role: 'staff'
            },
            attributes: ['id', 'displayName', 'email', 'createdAt']
        });

        res.json({ staff: staffMembers });
    } catch (error) {
        next(error);
    }
};
