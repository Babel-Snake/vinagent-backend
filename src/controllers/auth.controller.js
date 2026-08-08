const admin = require('../config/firebase');
const { Op } = require('sequelize');
const { User, Winery, WinerySettings } = require('../models');
const AppError = require('../utils/AppError');
const {
    createPinSessionToken,
    verifyPin
} = require('../utils/pinAuth');
const { buildManagedStaffEmail, normalizeStaffUsername } = require('../utils/staffIdentity');
const { resolveDeploymentWinery } = require('../services/deploymentWinery.service');

const DEFAULT_AUTH_CONFIG = {
    pinLoginEnabled: false,
    allowManagerBasicPin: false,
    pinIdleTimeoutSeconds: 300,
    pinSessionHours: 8,
    pinMaxAttempts: 5,
    pinLockoutMinutes: 5
};

const wineryAttemptState = new Map();

function getAuthConfig(settings) {
    return {
        ...DEFAULT_AUTH_CONFIG,
        ...(settings?.authConfig || {})
    };
}

function attemptKey(req, wineryId) {
    return `${wineryId}:${req.ip || req.headers['x-forwarded-for'] || 'unknown'}`;
}

function checkWineryAttemptLock(req, wineryId) {
    const key = attemptKey(req, wineryId);
    const state = wineryAttemptState.get(key);
    if (!state?.lockedUntil) return;

    if (state.lockedUntil > Date.now()) {
        throw new AppError('Too many incorrect PIN attempts. Try again shortly.', 423, 'PIN_LOCKED');
    }

    wineryAttemptState.delete(key);
}

function recordFailedAttempt(req, wineryId, authConfig) {
    const key = attemptKey(req, wineryId);
    const state = wineryAttemptState.get(key) || { count: 0, lockedUntil: null };
    const nextCount = state.count + 1;
    const lockedUntil = nextCount >= authConfig.pinMaxAttempts
        ? Date.now() + authConfig.pinLockoutMinutes * 60 * 1000
        : null;

    wineryAttemptState.set(key, { count: nextCount, lockedUntil });
}

function clearFailedAttempts(req, wineryId) {
    wineryAttemptState.delete(attemptKey(req, wineryId));
}

/**
 * Get current user context.
 * GET /api/auth/me
 */
exports.getMe = async (req, res, next) => {
    try {
        const wineryConfigurationAccess = require('../services/wineryConfigurationAccess.service');
        const configurationAccess = await wineryConfigurationAccess.getConfigurationAccess({
            wineryId: req.user.wineryId,
            userId: req.user.id,
            userRole: req.user.role
        });
        res.json({
            user: {
                ...req.user,
                canAccessWineryConfig: configurationAccess.canRead,
                managedAreaIds: configurationAccess.managedAreaIds
            }
        });
    } catch (error) {
        next(error);
    }
};

exports.getPinConfig = async (req, res, next) => {
    try {
        const winery = await resolveDeploymentWinery();
        const wineryId = winery.id;
        const settings = await WinerySettings.findOne({ where: { wineryId } });
        const authConfig = getAuthConfig(settings);

        res.json({
            wineryId,
            wineryName: winery.name,
            pinLoginEnabled: Boolean(authConfig.pinLoginEnabled),
            allowManagerBasicPin: Boolean(authConfig.allowManagerBasicPin),
            pinIdleTimeoutSeconds: authConfig.pinIdleTimeoutSeconds
        });
    } catch (error) {
        next(error);
    }
};

exports.pinLogin = async (req, res, next) => {
    try {
        const winery = await resolveDeploymentWinery();
        const wineryId = winery.id;
        const pin = String(req.body.pin || '').trim();

        const settings = await WinerySettings.findOne({ where: { wineryId } });
        const authConfig = getAuthConfig(settings);
        if (!authConfig.pinLoginEnabled) {
            throw new AppError('PIN login is not enabled for this winery.', 403, 'PIN_LOGIN_DISABLED');
        }

        checkWineryAttemptLock(req, wineryId);

        const roles = authConfig.allowManagerBasicPin ? ['staff', 'manager'] : ['staff'];
        const candidates = await User.findAll({
            where: {
                wineryId,
                isActive: true,
                role: { [Op.in]: roles },
                pinHash: { [Op.ne]: null }
            },
            include: [{ model: Winery, attributes: ['name'] }]
        });

        const matches = candidates.filter(user => verifyPin(pin, user.pinHash));

        if (matches.length !== 1) {
            recordFailedAttempt(req, wineryId, authConfig);
            throw new AppError('Invalid PIN.', 401, 'INVALID_PIN');
        }

        const user = matches[0];
        const now = new Date();
        if (user.pinLockedUntil && new Date(user.pinLockedUntil).getTime() > now.getTime()) {
            throw new AppError('This PIN is temporarily locked. Try again shortly.', 423, 'PIN_LOCKED');
        }

        user.pinFailedAttempts = 0;
        user.pinLockedUntil = null;
        user.pinLastLoginAt = now;
        await user.save();
        clearFailedAttempts(req, wineryId);

        const sessionRole = user.role === 'manager' ? 'staff' : user.role;
        const authMode = user.role === 'manager' ? 'pin_basic' : 'pin';
        const token = createPinSessionToken({
            user,
            sessionRole,
            authMode,
            expiresInSeconds: authConfig.pinSessionHours * 60 * 60
        });

        res.json({
            token,
            expiresAt: new Date(Date.now() + authConfig.pinSessionHours * 60 * 60 * 1000).toISOString(),
            idleTimeoutSeconds: authConfig.pinIdleTimeoutSeconds,
            user: {
                id: user.id,
                displayName: user.displayName,
                email: user.email,
                role: sessionRole,
                actualRole: user.role,
                authMode,
                wineryId: user.wineryId,
                wineryName: user.Winery ? user.Winery.name : undefined
            }
        });
    } catch (error) {
        next(error);
    }
};

exports.updateMe = async (req, res, next) => {
    try {
        const { displayName } = req.body;

        if (Object.prototype.hasOwnProperty.call(req.body, 'wineryId')) {
            throw new AppError('Winery assignment cannot be changed through this endpoint.', 400, 'IMMUTABLE_WINERY');
        }

        if (displayName !== undefined && (typeof displayName !== 'string' || displayName.trim().length < 2)) {
            throw new AppError('Display name must be at least 2 characters.', 400, 'INVALID_DISPLAY_NAME');
        }

        const user = await User.findByPk(req.user.id);
        if (!user) {
            throw new AppError('User not found.', 404, 'NOT_FOUND');
        }

        if (displayName !== undefined) {
            const cleanDisplayName = displayName.trim();
            user.displayName = cleanDisplayName;

            if (user.firebaseUid) {
                await admin.auth().updateUser(user.firebaseUid, {
                    displayName: cleanDisplayName
                });
            }
        }

        await user.save();

        res.json({
            user: {
                ...req.user,
                displayName: user.displayName
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Resolve a managed Firebase login identity by immutable staff username.
 * GET /api/public/resolve-staff?username=sarah
 */
exports.resolveStaff = async (req, res, next) => {
    try {
        const { username } = req.query;

        if (!username) {
            throw new AppError('Username is required', 400, 'MISSING_PARAM');
        }

        const cleanUsername = normalizeStaffUsername(username);
        if (cleanUsername.length < 3 || cleanUsername.length > 64) {
            throw new AppError('Staff member not found.', 404, 'NOT_FOUND');
        }

        const winery = await resolveDeploymentWinery();
        const legacyEmail = buildManagedStaffEmail(cleanUsername, winery.id);
        const user = await User.findOne({
            where: {
                wineryId: winery.id,
                role: 'staff',
                isActive: true,
                [Op.or]: [
                    { username: cleanUsername },
                    { username: null, email: legacyEmail }
                ]
            },
            attributes: ['email', 'wineryId']
        });

        if (!user) {
            throw new AppError('Staff member not found.', 404, 'NOT_FOUND');
        }
        res.json({
            email: user.email,
            wineryId: user.wineryId
        });

    } catch (error) {
        next(error);
    }
};
