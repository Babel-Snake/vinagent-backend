const admin = require('../config/firebase');
const { User, Winery, sequelize } = require('../models');
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
            },
            attributes: ['id', 'displayName', 'email', 'createdAt', 'role', 'isActive', 'responsibilities']
        });

        res.json({ staff: staffMembers });
    } catch (error) {
        next(error);
    }
};

/**
 * Update a staff member's details (currently just displayName).
 */
exports.updateStaff = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { displayName, email, role, isActive, responsibilities } = req.body;
        const requester = req.user;

        if (!requester.wineryId) {
            throw new AppError('User not associated with a winery.', 400, 'WINERY_REQUIRED');
        }

        const staffToUpdate = await User.findByPk(id);
        if (!staffToUpdate) {
            throw new AppError('Staff member not found.', 404, 'NOT_FOUND');
        }

        // Verify staff belongs to manager's winery
        if (staffToUpdate.wineryId !== requester.wineryId) {
            throw new AppError('Unauthorized to modify this staff member.', 403, 'FORBIDDEN');
        }

        // Protect Admins
        if (staffToUpdate.role === 'admin') {
            throw new AppError('Cannot modify admin accounts through this endpoint.', 403, 'INVALID_ROLE');
        }

        // Validate new role
        if (role && role !== 'staff' && role !== 'manager') {
            throw new AppError('Invalid role specified. Must be staff or manager.', 400, 'INVALID_ROLE');
        }

        const fbUpdates = {};
        if (displayName !== undefined) fbUpdates.displayName = displayName;
        if (email !== undefined) fbUpdates.email = email;
        if (isActive !== undefined) fbUpdates.disabled = !isActive;

        if (Object.keys(fbUpdates).length > 0) {
            // 1. Update Firebase
            await admin.auth().updateUser(staffToUpdate.firebaseUid, fbUpdates);
        }

        // 2. Update Database
        if (displayName !== undefined) staffToUpdate.displayName = displayName;
        if (email !== undefined) staffToUpdate.email = email;
        if (role !== undefined) staffToUpdate.role = role;
        if (isActive !== undefined) staffToUpdate.isActive = isActive;
        if (responsibilities !== undefined) staffToUpdate.responsibilities = responsibilities;

        await staffToUpdate.save();

        res.json({
            message: 'Staff updated successfully.',
            staff: {
                id: staffToUpdate.id,
                displayName: staffToUpdate.displayName,
                email: staffToUpdate.email,
                role: staffToUpdate.role,
                isActive: staffToUpdate.isActive,
                responsibilities: staffToUpdate.responsibilities
            }
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Delete a staff member.
 */
exports.deleteStaff = async (req, res, next) => {
    try {
        const { id } = req.params;
        const requester = req.user;

        if (!requester.wineryId) {
            throw new AppError('User not associated with a winery.', 400, 'WINERY_REQUIRED');
        }

        const staffToDelete = await User.findByPk(id);
        if (!staffToDelete) {
            throw new AppError('Staff member not found.', 404, 'NOT_FOUND');
        }

        // Verify staff belongs to manager's winery
        if (staffToDelete.wineryId !== requester.wineryId) {
            throw new AppError('Unauthorized to delete this staff member.', 403, 'FORBIDDEN');
        }

        // Protect Admins
        if (staffToDelete.role === 'admin') {
            throw new AppError('Cannot delete admin accounts through this endpoint.', 403, 'INVALID_ROLE');
        }

        // 1. Delete from Firebase
        try {
            await admin.auth().deleteUser(staffToDelete.firebaseUid);
        } catch (fbError) {
            // If user doesn't exist in firebase but does in DB, we should still allow DB deletion to clean up
            if (fbError.code !== 'auth/user-not-found') {
                throw fbError;
            }
        }

        // 2. Delete from Database
        await staffToDelete.destroy();

        res.json({ message: 'Staff member deleted successfully.' });

    } catch (error) {
        next(error);
    }
};
