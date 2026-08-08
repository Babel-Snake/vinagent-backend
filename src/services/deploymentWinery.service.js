const { Winery } = require('../models');
const AppError = require('../utils/AppError');
const logger = require('../config/logger');

function configuredWineryId() {
    const rawValue = String(process.env.DEPLOYMENT_WINERY_ID || '').trim();
    if (!rawValue) return null;

    const wineryId = Number(rawValue);
    if (!Number.isInteger(wineryId) || wineryId < 1) {
        logger.error('DEPLOYMENT_WINERY_ID must be a positive integer.');
        throw new AppError('Staff login is not configured for this deployment.', 503, 'DEPLOYMENT_WINERY_INVALID');
    }

    return wineryId;
}

async function resolveDeploymentWinery() {
    const wineryId = configuredWineryId();

    if (wineryId) {
        const winery = await Winery.findByPk(wineryId);
        if (!winery) {
            logger.error('DEPLOYMENT_WINERY_ID does not match an existing winery.', { wineryId });
            throw new AppError('Staff login is not configured for this deployment.', 503, 'DEPLOYMENT_WINERY_NOT_FOUND');
        }
        return winery;
    }

    const wineries = await Winery.findAll({
        attributes: ['id', 'name'],
        order: [['id', 'ASC']],
        limit: 2
    });

    if (wineries.length !== 1) {
        logger.error('DEPLOYMENT_WINERY_ID is required unless exactly one winery exists.', {
            candidateCount: wineries.length
        });
        throw new AppError('Staff login is not configured for this deployment.', 503, 'DEPLOYMENT_WINERY_REQUIRED');
    }

    return wineries[0];
}

module.exports = {
    configuredWineryId,
    resolveDeploymentWinery
};
