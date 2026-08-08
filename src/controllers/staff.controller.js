const admin = require('../config/firebase');
const { Op } = require('sequelize');
const { OperationalArea, User, UserAreaMembership } = require('../models');
const AppError = require('../utils/AppError');
const { hashPin, validatePin, verifyPin } = require('../utils/pinAuth');
const { buildManagedStaffEmail, normalizeStaffUsername } = require('../utils/staffIdentity');
const { safeRecordUsageEvent } = require('../services/usageTracking.service');
const { METRICS } = require('../services/usageMetricCatalog');

function staffPayload(user) {
    return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        createdAt: user.createdAt,
        role: user.role,
        isActive: user.isActive,
        responsibilities: user.responsibilities,
        areaMemberships: (user.AreaMemberships || []).map(membership => ({
            id: membership.id,
            areaId: membership.areaId,
            membershipRole: membership.membershipRole,
            isPrimary: Boolean(membership.isPrimary),
            Area: membership.Area ? {
                id: membership.Area.id,
                name: membership.Area.name,
                isActive: membership.Area.isActive
            } : undefined
        })),
        pinEnabled: Boolean(user.pinHash),
        pinUpdatedAt: user.pinUpdatedAt,
        pinLockedUntil: user.pinLockedUntil,
        pinLastLoginAt: user.pinLastLoginAt
    };
}

async function assertPinAvailable({ pin, wineryId, excludeUserId = null }) {
    if (!pin) return;

    if (!validatePin(pin)) {
        throw new AppError('PIN must be 4 to 12 letters or numbers.', 400, 'INVALID_PIN');
    }

    const where = {
        wineryId,
        isActive: true,
        role: { [Op.in]: ['staff', 'manager'] },
        pinHash: { [Op.ne]: null }
    };

    if (excludeUserId) {
        where.id = { [Op.ne]: excludeUserId };
    }

    const usersWithPins = await User.findAll({ where });
    const duplicate = usersWithPins.find(user => verifyPin(pin, user.pinHash));
    if (duplicate) {
        throw new AppError('That PIN is already assigned to another staff member in this winery.', 409, 'PIN_TAKEN');
    }
}

async function applyPinUpdate(user, { pin, clearPin = false }) {
    const cleanPin = typeof pin === 'string' ? pin.trim() : '';

    if (clearPin) {
        user.pinHash = null;
        user.pinUpdatedAt = null;
        user.pinFailedAttempts = 0;
        user.pinLockedUntil = null;
        return;
    }

    if (cleanPin) {
        await assertPinAvailable({
            pin: cleanPin,
            wineryId: user.wineryId,
            excludeUserId: user.id
        });
        user.pinHash = hashPin(cleanPin);
        user.pinUpdatedAt = new Date();
        user.pinFailedAttempts = 0;
        user.pinLockedUntil = null;
    }
}

/**
 * Create a new Managed Staff account.
 * Only accessible by Managers or Admins.
 */
exports.createStaff = async (req, res, next) => {
    try {
        const { username, password } = req.body;
        const pin = typeof req.body.pin === 'string' ? req.body.pin.trim() : '';
        const requester = req.user; // From authMiddleware

        // RBAC: Only Manager/Admin can create staff
        if (requester.role !== 'manager' && requester.role !== 'admin') {
            throw new AppError('Only Managers or Admins can create staff accounts.', 403, 'FORBIDDEN');
        }

        if (Object.prototype.hasOwnProperty.call(req.body, 'wineryId')) {
            throw new AppError('Winery assignment is controlled by the authenticated account.', 400, 'IMMUTABLE_WINERY');
        }

        const wineryId = requester.wineryId;
        if (!wineryId) {
            throw new AppError('Manager must belong to a winery to create staff.', 400, 'WINERY_REQUIRED');
        }

        // 1. Generate Internal Email
        // Format: username.w{ID}@vinagent.internal
        // Sanitize username (alphanumeric only)
        const cleanDisplayName = typeof username === 'string' ? username.trim() : '';
        const cleanUsername = normalizeStaffUsername(cleanDisplayName);
        if (cleanUsername.length < 3 || cleanUsername.length > 64) {
            throw new AppError('Username must be 3 to 64 alphanumeric characters.', 400, 'INVALID_USERNAME');
        }

        // Password Validation (min 8 chars, at least 1 number)
        if (typeof password !== 'string' || password.length < 8) {
            throw new AppError('Password must be at least 8 characters.', 400, 'WEAK_PASSWORD');
        }
        if (!/\d/.test(password)) {
            throw new AppError('Password must contain at least one number.', 400, 'WEAK_PASSWORD');
        }

        const email = buildManagedStaffEmail(cleanUsername, wineryId);
        if (pin) {
            await assertPinAvailable({ pin, wineryId });
        }

        // 2. Create in Firebase
        let uid;
        try {
            const userRecord = await admin.auth().createUser({
                email: email,
                password: password,
                displayName: cleanDisplayName,
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
            username: cleanUsername,
            email: email,
            displayName: cleanDisplayName,
            role: 'staff',
            wineryId: wineryId,
            pinHash: pin ? hashPin(pin) : null,
            pinUpdatedAt: pin ? new Date() : null
        });

        await safeRecordUsageEvent({
            wineryId,
            actorUserId: requester.id,
            metricKey: METRICS.SEAT_ACTIVATED,
            quantity: 1,
            occurredAt: newUser.createdAt || new Date(),
            sourceType: 'user',
            sourceId: newUser.id,
            idempotencyKey: `user:${newUser.id}:seat:activated:${new Date(newUser.createdAt || Date.now()).toISOString()}`,
            dimensions: { role: newUser.role }
        });

        res.status(201).json({
            message: 'Staff account created successfully.',
            staff: {
                ...staffPayload(newUser),
                username: cleanUsername
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
            attributes: [
                'id',
                'username',
                'displayName',
                'email',
                'createdAt',
                'role',
                'isActive',
                'responsibilities',
                'pinHash',
                'pinUpdatedAt',
                'pinLockedUntil',
                'pinLastLoginAt'
            ],
            include: [{
                model: UserAreaMembership,
                as: 'AreaMemberships',
                include: [{ model: OperationalArea, as: 'Area', attributes: ['id', 'name', 'isActive'] }],
                required: false
            }],
            order: [['displayName', 'ASC']]
        });

        res.json({ staff: staffMembers.map(staffPayload) });
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
        const { displayName, role, isActive, responsibilities } = req.body;
        const requester = req.user;

        if (!requester.wineryId) {
            throw new AppError('User not associated with a winery.', 400, 'WINERY_REQUIRED');
        }

        if (['wineryId', 'username', 'email'].some(field => Object.prototype.hasOwnProperty.call(req.body, field))) {
            throw new AppError(
                'Winery, username, and login email are immutable in staff management.',
                400,
                'IMMUTABLE_STAFF_IDENTITY'
            );
        }

        if (displayName !== undefined && (typeof displayName !== 'string' || displayName.trim().length < 2)) {
            throw new AppError('Display name must be at least 2 characters.', 400, 'INVALID_DISPLAY_NAME');
        }

        const staffToUpdate = await User.findOne({ where: { id, wineryId: requester.wineryId } });
        if (!staffToUpdate) {
            throw new AppError('Staff member not found.', 404, 'NOT_FOUND');
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
        if (displayName !== undefined) fbUpdates.displayName = displayName.trim();
        if (isActive !== undefined) fbUpdates.disabled = !isActive;

        if (Object.keys(fbUpdates).length > 0) {
            // 1. Update Firebase
            await admin.auth().updateUser(staffToUpdate.firebaseUid, fbUpdates);
        }

        const wasActive = Boolean(staffToUpdate.isActive);

        // 2. Update Database
        if (displayName !== undefined) staffToUpdate.displayName = displayName.trim();
        if (role !== undefined) staffToUpdate.role = role;
        if (isActive !== undefined) staffToUpdate.isActive = isActive;
        if (responsibilities !== undefined) staffToUpdate.responsibilities = responsibilities;

        await staffToUpdate.save();

        if (isActive !== undefined && Boolean(isActive) !== wasActive) {
            const metricKey = isActive ? METRICS.SEAT_ACTIVATED : METRICS.SEAT_DEACTIVATED;
            await safeRecordUsageEvent({
                wineryId: requester.wineryId,
                actorUserId: requester.id,
                metricKey,
                quantity: 1,
                occurredAt: staffToUpdate.updatedAt || new Date(),
                sourceType: 'user',
                sourceId: staffToUpdate.id,
                idempotencyKey: `user:${staffToUpdate.id}:seat:${isActive ? 'activated' : 'deactivated'}:${new Date(staffToUpdate.updatedAt || Date.now()).toISOString()}`,
                dimensions: { role: staffToUpdate.role }
            });
        }

        res.json({
            message: 'Staff updated successfully.',
            staff: staffPayload(staffToUpdate)
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Reset a staff member's access code.
 * Only accessible by Managers or Admins for users in the same winery.
 */
exports.resetStaffPassword = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { password, clearPin = false } = req.body;
        const pin = typeof req.body.pin === 'string' ? req.body.pin.trim() : '';
        const requester = req.user;

        if (!requester.wineryId) {
            throw new AppError('User not associated with a winery.', 400, 'WINERY_REQUIRED');
        }

        const cleanPassword = typeof password === 'string' ? password.trim() : '';
        if (!cleanPassword && !pin && !clearPin) {
            throw new AppError('Provide an access code, a PIN, or choose to clear the PIN.', 400, 'MISSING_CREDENTIAL_UPDATE');
        }

        if (cleanPassword && cleanPassword.length < 8) {
            throw new AppError('Access code must be at least 8 characters.', 400, 'WEAK_PASSWORD');
        }
        if (cleanPassword && !/\d/.test(cleanPassword)) {
            throw new AppError('Access code must contain at least one number.', 400, 'WEAK_PASSWORD');
        }

        const staffToUpdate = await User.findOne({ where: { id, wineryId: requester.wineryId } });
        if (!staffToUpdate) {
            throw new AppError('Staff member not found.', 404, 'NOT_FOUND');
        }

        if (staffToUpdate.role === 'admin') {
            throw new AppError('Cannot reset admin credentials through this endpoint.', 403, 'INVALID_ROLE');
        }

        if (pin && !clearPin) {
            await assertPinAvailable({
                pin,
                wineryId: staffToUpdate.wineryId,
                excludeUserId: staffToUpdate.id
            });
        }

        if (cleanPassword) {
            await admin.auth().updateUser(staffToUpdate.firebaseUid, { password: cleanPassword });
        }

        await applyPinUpdate(staffToUpdate, { pin, clearPin });
        await staffToUpdate.save();

        res.json({
            message: 'Staff credentials updated successfully.',
            staff: staffPayload(staffToUpdate)
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

        const staffToDelete = await User.findOne({ where: { id, wineryId: requester.wineryId } });
        if (!staffToDelete) {
            throw new AppError('Staff member not found.', 404, 'NOT_FOUND');
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
