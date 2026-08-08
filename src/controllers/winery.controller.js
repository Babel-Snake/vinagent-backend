const {
    Winery, WineryBrandProfile, WineryBookingsConfig,
    WineryBookingType, WineryProduct, WineryPolicyProfile,
    WineryFAQItem, WineryIntegrationConfig, WinerySop, WineryContact, WinerySettings,
    OperationalArea, OperationalAreaProfile, OperationalAreaBookingsConfig,
    AreaProductListing, OperationalAreaIntegrationConfig,
    WineryContactArea, sequelize
} = require('../models');
const AppError = require('../utils/AppError');
const {
    validate, wineryBrandSchema, wineryBookingsSchema,
    operationalAreaProfileSchema,
    areaProductListingSchema,
    wineryPolicySchema, wineryIntegrationSchema, wineryIntegrationTestSchema,
    areaIntegrationConfigSchema, areaIntegrationTestSchema,
    emailSyncSchema, wineryFaqSchema, wineryFaqUpdateSchema,
    winerySopSchema, winerySopUpdateSchema, winerySettingsSchema, wineryContactSchema
} = require('../utils/validation');
const emailSyncService = require('../services/emailSync.service');
const integrationConnectionService = require('../services/integrationConnection.service');
const wineryConfigurationAccess = require('../services/wineryConfigurationAccess.service');

const OVERVIEW_FIELDS = [
    'name',
    'shortName',
    'keyDescriptors',
    'region',
    'contactEmail',
    'contactPhone',
    'publicEmail',
    'publicPhone',
    'website',
    'addressLine1',
    'addressLine2',
    'suburb',
    'state',
    'postcode',
    'country',
    'openingHours',
    'socialLinks',
    'timeZone'
];

const PRODUCT_FIELDS = [
    'name',
    'category',
    'vintage',
    'price',
    'stockStatus',
    'tastingNotes',
    'keySellingPoints',
    'pairingSuggestions',
    'awards',
    'isFeatured',
    'isActive'
];

const BOOKING_TYPE_FIELDS = [
    'name',
    'description',
    'durationMinutes',
    'priceCents',
    'currency',
    'minGuests',
    'maxGuests',
    'daysAvailable',
    'requiresDeposit',
    'depositCents',
    'notesForGuests',
    'isActive'
];

const FAQ_FIELDS = ['question', 'answer', 'tags', 'isActive'];
const SOP_FIELDS = ['title', 'body', 'isActive'];

function pickAllowedFields(body, allowedFields) {
    const picked = {};
    for (const field of allowedFields) {
        if (body[field] !== undefined) picked[field] = body[field];
    }
    return picked;
}

const CONTACT_FIELDS = [
    'name', 'role', 'email', 'phone', 'layer', 'notes',
    'reportsToId', 'responsibilities', 'isActive'
];

function getContactAreaInclude(wineryId) {
    return {
        model: OperationalArea,
        as: 'OperationalAreas',
        where: { wineryId },
        attributes: ['id', 'name', 'isActive'],
        through: { attributes: ['relationshipType'], where: { wineryId } },
        required: false
    };
}

function normalizeContactPlacement({ primaryAreaId = null, linkedAreaIds = [] }) {
    const primaryId = primaryAreaId ? Number(primaryAreaId) : null;
    const linkedIds = [...new Set((linkedAreaIds || []).map(Number))]
        .filter(areaId => areaId && areaId !== primaryId);
    return {
        primaryAreaId: primaryId,
        linkedAreaIds: linkedIds,
        areaIds: primaryId ? [primaryId, ...linkedIds] : []
    };
}

function placementFromLinks(links = []) {
    const primary = links.find(link => link.relationshipType === 'PRIMARY');
    return normalizeContactPlacement({
        primaryAreaId: primary?.areaId || null,
        linkedAreaIds: links.filter(link => link.relationshipType === 'LINKED').map(link => link.areaId)
    });
}

function placementsEqual(left, right) {
    if (Number(left.primaryAreaId || 0) !== Number(right.primaryAreaId || 0)) return false;
    const leftLinked = [...left.linkedAreaIds].map(Number).sort((a, b) => a - b);
    const rightLinked = [...right.linkedAreaIds].map(Number).sort((a, b) => a - b);
    return leftLinked.length === rightLinked.length && leftLinked.every((areaId, index) => areaId === rightLinked[index]);
}

async function validateContactPlacement(req, placement, { requirePlacementAuthority = true, transaction = null } = {}) {
    const isGlobalManager = ['manager', 'admin'].includes(req.user.role);
    if (!placement.primaryAreaId) {
        if (placement.linkedAreaIds.length > 0) {
            throw new AppError('Linked contact areas require a primary area.', 400, 'VALIDATION_ERROR');
        }
        if (!isGlobalManager) {
            throw new AppError('Only winery managers can manage organisation-wide contacts.', 403, 'FORBIDDEN');
        }
        return;
    }

    const areas = await OperationalArea.findAll({
        where: { id: placement.areaIds, wineryId: req.user.wineryId, isActive: true },
        attributes: ['id'],
        transaction
    });
    if (areas.length !== placement.areaIds.length) {
        throw new AppError('One or more contact areas are invalid or inactive.', 400, 'VALIDATION_ERROR');
    }

    if (!isGlobalManager && requirePlacementAuthority) {
        for (const areaId of placement.areaIds) {
            await wineryConfigurationAccess.assertCanManageArea({
                areaId,
                wineryId: req.user.wineryId,
                userId: req.user.id,
                userRole: req.user.role,
                transaction
            });
        }
    }
}

async function assertCanManageContact(req, currentPlacement, transaction = null) {
    if (['manager', 'admin'].includes(req.user.role)) return;
    if (!currentPlacement.primaryAreaId) {
        throw new AppError('Only winery managers can manage organisation-wide contacts.', 403, 'FORBIDDEN');
    }
    await wineryConfigurationAccess.assertCanManageArea({
        areaId: currentPlacement.primaryAreaId,
        wineryId: req.user.wineryId,
        userId: req.user.id,
        userRole: req.user.role,
        transaction
    });
}

async function validateReportsTo({ wineryId, contactId = null, reportsToId, transaction = null }) {
    if (!reportsToId) return;
    if (contactId && Number(contactId) === Number(reportsToId)) {
        throw new AppError('A contact cannot report to itself.', 400, 'VALIDATION_ERROR');
    }
    const manager = await WineryContact.findOne({ where: { id: reportsToId, wineryId }, transaction });
    if (!manager) throw new AppError('Reporting manager not found', 400, 'VALIDATION_ERROR');
    if (contactId) {
        const visited = new Set([Number(manager.id)]);
        let nextManagerId = manager.reportsToId;
        while (nextManagerId) {
            if (Number(nextManagerId) === Number(contactId)) {
                throw new AppError('Reporting hierarchy cannot contain a cycle.', 400, 'VALIDATION_ERROR');
            }
            if (visited.has(Number(nextManagerId))) break;
            visited.add(Number(nextManagerId));
            const nextManager = await WineryContact.findOne({
                where: { id: nextManagerId, wineryId },
                attributes: ['id', 'reportsToId'],
                transaction
            });
            nextManagerId = nextManager?.reportsToId || null;
        }
    }
}

async function replaceContactAreas({ contact, wineryId, placement, transaction }) {
    await WineryContactArea.destroy({ where: { wineryId, contactId: contact.id }, transaction });
    if (!placement.primaryAreaId) return;
    await WineryContactArea.bulkCreate([
        {
            wineryId,
            contactId: contact.id,
            areaId: placement.primaryAreaId,
            relationshipType: 'PRIMARY'
        },
        ...placement.linkedAreaIds.map(areaId => ({
            wineryId,
            contactId: contact.id,
            areaId,
            relationshipType: 'LINKED'
        }))
    ], { transaction });
}

async function assertCanManageKnowledgeScope(req, areaId, resourceLabel) {
    if (areaId) {
        return wineryConfigurationAccess.assertCanManageArea({
            areaId,
            wineryId: req.user.wineryId,
            userId: req.user.id,
            userRole: req.user.role
        });
    }
    if (!['manager', 'admin'].includes(req.user.role)) {
        throw new AppError(`Only winery managers can manage shared ${resourceLabel}.`, 403, 'FORBIDDEN');
    }
    return null;
}

// --- GET FULL PROFILE ---
exports.getWinery = async (req, res, next) => {
    try {
        const wineryId = req.user.wineryId;
        const configurationAccess = await wineryConfigurationAccess.assertCanRead({
            wineryId,
            userId: req.user.id,
            userRole: req.user.role
        });
        const winery = await Winery.findByPk(wineryId, {
            include: [
                { model: WineryBrandProfile, as: 'brandProfile' },
                { model: WineryBookingsConfig, as: 'bookingsConfig' },
                { model: WineryBookingType, as: 'bookingTypes', separate: true },
                { model: WineryProduct, as: 'products', separate: true }, // Include inactive for admin
                { model: WineryPolicyProfile, as: 'policyProfile' },
                { model: WineryFAQItem, as: 'faqs', separate: true },
                { model: WinerySop, as: 'sops', separate: true },
                { model: WineryIntegrationConfig, as: 'integrationConfig' },
                { model: WineryContact, as: 'contacts', separate: true, include: [getContactAreaInclude(wineryId)] },
                { model: WinerySettings, as: 'settings' },
                {
                    model: OperationalArea,
                    as: 'OperationalAreas',
                    where: { isActive: true },
                    required: false,
                    separate: true,
                    include: [
                        { model: OperationalAreaProfile, as: 'Profile', where: { wineryId }, required: false },
                        { model: OperationalAreaBookingsConfig, as: 'BookingsConfig', where: { wineryId }, required: false },
                        { model: WineryBookingType, as: 'BookingTypes', where: { wineryId }, required: false, separate: true },
                        { model: AreaProductListing, as: 'ProductListings', where: { wineryId }, required: false, separate: true },
                        { model: OperationalAreaIntegrationConfig, as: 'IntegrationConfig', where: { wineryId }, required: false }
                    ]
                }
            ]
        });

        if (!winery) throw new AppError('Winery not found', 404, 'NOT_FOUND');

        const data = winery.toJSON();
        if (data.integrationConfig) {
            data.integrationConfig = integrationConnectionService.serializeIntegrationConfig(data.integrationConfig);
        }
        for (const area of data.OperationalAreas || []) {
            if (area.IntegrationConfig) {
                area.IntegrationConfig = integrationConnectionService.serializeAreaIntegrationConfig(area.IntegrationConfig);
            }
        }
        data.configurationAccess = configurationAccess;

        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
};

// --- SECTION UPDATES ---

exports.updateOverview = async (req, res, next) => {
    try {
        const wineryId = req.user.wineryId;
        const winery = await Winery.findByPk(wineryId);
        if (!winery) throw new AppError('Winery not found', 404, 'NOT_FOUND');

        await winery.update(pickAllowedFields(req.body, OVERVIEW_FIELDS));
        res.json({ success: true, data: winery });
    } catch (err) { next(err); }
};

exports.updateBrand = async (req, res, next) => {
    try {
        const wineryId = req.user.wineryId;
        const payload = validate(wineryBrandSchema, req.body);
        const [profile] = await WineryBrandProfile.findOrCreate({ where: { wineryId } });
        await profile.update(payload);
        res.json({ success: true, data: profile });
    } catch (err) { next(err); }
};

exports.updateBookingsConfig = async (req, res, next) => {
    try {
        const wineryId = req.user.wineryId;
        const payload = validate(wineryBookingsSchema, req.body);
        const [config] = await WineryBookingsConfig.findOrCreate({ where: { wineryId } });
        await config.update(payload);
        res.json({ success: true, data: config });
    } catch (err) { next(err); }
};

exports.updatePolicyProfile = async (req, res, next) => {
    try {
        const wineryId = req.user.wineryId;
        const payload = validate(wineryPolicySchema, req.body);
        const [profile] = await WineryPolicyProfile.findOrCreate({ where: { wineryId } });
        await profile.update(payload);
        res.json({ success: true, data: profile });
    } catch (err) { next(err); }
};

exports.updateIntegrationConfig = async (req, res, next) => {
    try {
        const wineryId = req.user.wineryId;
        const payload = validate(wineryIntegrationSchema, req.body);
        const [config] = await WineryIntegrationConfig.findOrCreate({ where: { wineryId } });
        const providerConnections = integrationConnectionService.normalizeProviderConnections(payload, config);

        await config.update({
            ...payload,
            providerConnections
        });
        const settings = await integrationConnectionService.syncExecutionSettings({
            wineryId,
            integrationConfig: config
        });

        res.json({
            success: true,
            data: integrationConnectionService.serializeIntegrationConfig(config),
            settings
        });
    } catch (err) { next(err); }
};

exports.updateAreaProfile = async (req, res, next) => {
    try {
        const wineryId = req.user.wineryId;
        const areaId = Number(req.params.areaId);
        const payload = validate(operationalAreaProfileSchema, req.body);
        await wineryConfigurationAccess.assertCanManageArea({
            areaId,
            wineryId,
            userId: req.user.id,
            userRole: req.user.role
        });
        const [profile] = await OperationalAreaProfile.findOrCreate({ where: { wineryId, areaId } });
        await profile.update(payload);
        res.json({ success: true, data: profile });
    } catch (err) { next(err); }
};

exports.updateAreaBookingsConfig = async (req, res, next) => {
    try {
        const wineryId = req.user.wineryId;
        const areaId = Number(req.params.areaId);
        const payload = validate(wineryBookingsSchema, req.body);
        await wineryConfigurationAccess.assertCanManageArea({
            areaId,
            wineryId,
            userId: req.user.id,
            userRole: req.user.role
        });
        const [config] = await OperationalAreaBookingsConfig.findOrCreate({ where: { wineryId, areaId } });
        await config.update(payload);
        res.json({ success: true, data: config });
    } catch (err) { next(err); }
};

exports.updateAreaProductListing = async (req, res, next) => {
    try {
        const wineryId = req.user.wineryId;
        const areaId = Number(req.params.areaId);
        const productId = Number(req.params.productId);
        const payload = validate(areaProductListingSchema, req.body);
        await wineryConfigurationAccess.assertCanManageArea({
            areaId,
            wineryId,
            userId: req.user.id,
            userRole: req.user.role
        });
        const product = await WineryProduct.findOne({ where: { id: productId, wineryId } });
        if (!product) throw new AppError('Product not found', 404, 'NOT_FOUND');

        const [listing] = await AreaProductListing.findOrCreate({
            where: { wineryId, areaId, productId },
            defaults: payload
        });
        await listing.update(payload);
        res.json({ success: true, data: listing });
    } catch (err) { next(err); }
};

exports.deleteAreaProductListing = async (req, res, next) => {
    try {
        const wineryId = req.user.wineryId;
        const areaId = Number(req.params.areaId);
        const productId = Number(req.params.productId);
        await wineryConfigurationAccess.assertCanManageArea({
            areaId,
            wineryId,
            userId: req.user.id,
            userRole: req.user.role
        });
        await AreaProductListing.destroy({ where: { wineryId, areaId, productId } });
        res.json({ success: true });
    } catch (err) { next(err); }
};

exports.updateAreaIntegrationConfig = async (req, res, next) => {
    try {
        const wineryId = req.user.wineryId;
        const areaId = Number(req.params.areaId);
        const payload = validate(areaIntegrationConfigSchema, req.body);
        await wineryConfigurationAccess.assertCanManageArea({
            areaId,
            wineryId,
            userId: req.user.id,
            userRole: req.user.role
        });

        const [config] = await OperationalAreaIntegrationConfig.findOrCreate({
            where: { wineryId, areaId },
            defaults: { providerConnections: {} }
        });
        const providerConnections = integrationConnectionService.normalizeAreaProviderConnections(
            payload,
            config,
            { wineryId, areaId }
        );
        await config.update({ providerConnections });

        res.json({
            success: true,
            data: integrationConnectionService.serializeAreaIntegrationConfig(config)
        });
    } catch (err) { next(err); }
};

exports.deleteAreaIntegrationDomain = async (req, res, next) => {
    try {
        const wineryId = req.user.wineryId;
        const areaId = Number(req.params.areaId);
        const domain = String(req.params.domain || '').toLowerCase();
        if (!integrationConnectionService.AREA_DOMAINS.includes(domain)) {
            throw new AppError('Unsupported area integration domain', 400, 'VALIDATION_ERROR');
        }
        await wineryConfigurationAccess.assertCanManageArea({
            areaId,
            wineryId,
            userId: req.user.id,
            userRole: req.user.role
        });

        const config = await OperationalAreaIntegrationConfig.findOne({ where: { wineryId, areaId } });
        if (config) {
            const providerConnections = {
                ...integrationConnectionService.parseJsonObject(config.providerConnections)
            };
            delete providerConnections[domain];
            if (Object.keys(providerConnections).length === 0) await config.destroy();
            else await config.update({ providerConnections });
        }

        res.json({ success: true });
    } catch (err) { next(err); }
};

exports.testAreaIntegrationConnection = async (req, res, next) => {
    try {
        const wineryId = req.user.wineryId;
        const areaId = Number(req.params.areaId);
        const payload = validate(areaIntegrationTestSchema, req.body);
        await wineryConfigurationAccess.assertCanManageArea({
            areaId,
            wineryId,
            userId: req.user.id,
            userRole: req.user.role
        });
        const result = await integrationConnectionService.testAreaConnection({
            wineryId,
            areaId,
            domain: payload.domain
        });
        res.json({ success: true, data: integrationConnectionService.serializeConnectionTestResult(result) });
    } catch (err) { next(err); }
};

exports.testIntegrationConnection = async (req, res, next) => {
    try {
        const wineryId = req.user.wineryId;
        const payload = validate(wineryIntegrationTestSchema, req.body);
        const result = await integrationConnectionService.testConnection({
            wineryId,
            domain: payload.domain
        });

        res.json({ success: true, data: integrationConnectionService.serializeConnectionTestResult(result) });
    } catch (err) { next(err); }
};

exports.syncEmailNow = async (req, res, next) => {
    try {
        const wineryId = req.user.wineryId;
        const payload = validate(emailSyncSchema, req.body || {});
        const result = await emailSyncService.syncWineryEmail({
            wineryId,
            limit: payload.limit
        });

        res.json({ success: true, data: result });
    } catch (err) { next(err); }
};

exports.updateSettings = async (req, res, next) => {
    try {
        const wineryId = req.user.wineryId;
        const payload = validate(winerySettingsSchema, req.body);
        const [settings] = await WinerySettings.findOrCreate({ where: { wineryId } });
        await settings.update(payload);
        res.json({ success: true, data: settings });
    } catch (err) { next(err); }
};

// --- CRUD: PRODUCTS ---
exports.createProduct = async (req, res, next) => {
    try {
        const product = await WineryProduct.create({
            ...pickAllowedFields(req.body, PRODUCT_FIELDS),
            wineryId: req.user.wineryId
        });
        res.status(201).json({ success: true, data: product });
    } catch (err) { next(err); }
};
exports.updateProduct = async (req, res, next) => {
    try {
        const product = await WineryProduct.findOne({ where: { id: req.params.id, wineryId: req.user.wineryId } });
        if (!product) throw new AppError('Product not found', 404, 'NOT_FOUND');

        await product.update(pickAllowedFields(req.body, PRODUCT_FIELDS));
        res.json({ success: true, data: product });
    } catch (err) { next(err); }
};
exports.deleteProduct = async (req, res, next) => {
    try {
        await WineryProduct.destroy({ where: { id: req.params.id, wineryId: req.user.wineryId } });
        res.json({ success: true });
    } catch (err) { next(err); }
};

// --- CRUD: BOOKING TYPES ---
exports.createBookingType = async (req, res, next) => {
    try {
        const areaId = req.body.areaId ? Number(req.body.areaId) : null;
        if (areaId) {
            await wineryConfigurationAccess.assertCanManageArea({
                areaId,
                wineryId: req.user.wineryId,
                userId: req.user.id,
                userRole: req.user.role
            });
        } else if (!['manager', 'admin'].includes(req.user.role)) {
            throw new AppError('Only winery managers can create organisation-level booking types.', 403, 'FORBIDDEN');
        }
        const type = await WineryBookingType.create({
            ...pickAllowedFields(req.body, BOOKING_TYPE_FIELDS),
            wineryId: req.user.wineryId,
            areaId
        });
        res.status(201).json({ success: true, data: type });
    } catch (err) { next(err); }
};
exports.updateBookingType = async (req, res, next) => {
    try {
        const type = await WineryBookingType.findOne({ where: { id: req.params.id, wineryId: req.user.wineryId } });
        if (!type) throw new AppError('Booking type not found', 404, 'NOT_FOUND');

        if (type.areaId) {
            await wineryConfigurationAccess.assertCanManageArea({
                areaId: type.areaId,
                wineryId: req.user.wineryId,
                userId: req.user.id,
                userRole: req.user.role
            });
        } else if (!['manager', 'admin'].includes(req.user.role)) {
            throw new AppError('Only winery managers can update organisation-level booking types.', 403, 'FORBIDDEN');
        }

        await type.update(pickAllowedFields(req.body, BOOKING_TYPE_FIELDS));
        res.json({ success: true, data: type });
    } catch (err) { next(err); }
};
exports.deleteBookingType = async (req, res, next) => {
    try {
        const type = await WineryBookingType.findOne({ where: { id: req.params.id, wineryId: req.user.wineryId } });
        if (!type) throw new AppError('Booking type not found', 404, 'NOT_FOUND');
        if (type.areaId) {
            await wineryConfigurationAccess.assertCanManageArea({
                areaId: type.areaId,
                wineryId: req.user.wineryId,
                userId: req.user.id,
                userRole: req.user.role
            });
        } else if (!['manager', 'admin'].includes(req.user.role)) {
            throw new AppError('Only winery managers can delete organisation-level booking types.', 403, 'FORBIDDEN');
        }
        await type.destroy();
        res.json({ success: true });
    } catch (err) { next(err); }
};

// --- CRUD: FAQS ---
exports.createFAQ = async (req, res, next) => {
    try {
        const payload = validate(wineryFaqSchema, req.body);
        await assertCanManageKnowledgeScope(req, payload.areaId, 'FAQs');
        const faq = await WineryFAQItem.create({
            ...payload,
            wineryId: req.user.wineryId
        });
        res.status(201).json({ success: true, data: faq });
    } catch (err) { next(err); }
};
exports.updateFAQ = async (req, res, next) => {
    try {
        const payload = validate(wineryFaqUpdateSchema, req.body);
        const faq = await WineryFAQItem.findOne({ where: { id: req.params.id, wineryId: req.user.wineryId } });
        if (!faq) throw new AppError('FAQ not found', 404, 'NOT_FOUND');
        await assertCanManageKnowledgeScope(req, faq.areaId, 'FAQs');
        await faq.update(pickAllowedFields(payload, FAQ_FIELDS));
        res.json({ success: true, data: faq });
    } catch (err) { next(err); }
};
exports.deleteFAQ = async (req, res, next) => {
    try {
        const faq = await WineryFAQItem.findOne({ where: { id: req.params.id, wineryId: req.user.wineryId } });
        if (!faq) throw new AppError('FAQ not found', 404, 'NOT_FOUND');
        await assertCanManageKnowledgeScope(req, faq.areaId, 'FAQs');
        await faq.destroy();
        res.json({ success: true });
    } catch (err) { next(err); }
};

// --- CRUD: SOPS ---
exports.createSop = async (req, res, next) => {
    try {
        const payload = validate(winerySopSchema, req.body);
        await assertCanManageKnowledgeScope(req, payload.areaId, 'SOPs');
        const sop = await WinerySop.create({ ...payload, wineryId: req.user.wineryId });
        res.status(201).json({ success: true, data: sop });
    } catch (err) { next(err); }
};

exports.updateSop = async (req, res, next) => {
    try {
        const payload = validate(winerySopUpdateSchema, req.body);
        const sop = await WinerySop.findOne({ where: { id: req.params.id, wineryId: req.user.wineryId } });
        if (!sop) throw new AppError('SOP not found', 404, 'NOT_FOUND');
        await assertCanManageKnowledgeScope(req, sop.areaId, 'SOPs');
        await sop.update(pickAllowedFields(payload, SOP_FIELDS));
        res.json({ success: true, data: sop });
    } catch (err) { next(err); }
};

exports.deleteSop = async (req, res, next) => {
    try {
        const sop = await WinerySop.findOne({ where: { id: req.params.id, wineryId: req.user.wineryId } });
        if (!sop) throw new AppError('SOP not found', 404, 'NOT_FOUND');
        await assertCanManageKnowledgeScope(req, sop.areaId, 'SOPs');
        await sop.destroy();
        res.json({ success: true });
    } catch (err) { next(err); }
};

// --- CRUD: CONTACTS ---
exports.createContact = async (req, res, next) => {
    const transaction = await sequelize.transaction();
    try {
        const payload = validate(wineryContactSchema, req.body);
        const placement = normalizeContactPlacement(payload);
        await validateContactPlacement(req, placement, { transaction });
        await validateReportsTo({ wineryId: req.user.wineryId, reportsToId: payload.reportsToId, transaction });
        const contact = await WineryContact.create({
            ...pickAllowedFields(payload, CONTACT_FIELDS),
            wineryId: req.user.wineryId
        }, { transaction });
        await replaceContactAreas({ contact, wineryId: req.user.wineryId, placement, transaction });
        await transaction.commit();
        const result = await WineryContact.findOne({
            where: { id: contact.id, wineryId: req.user.wineryId },
            include: [getContactAreaInclude(req.user.wineryId)]
        });
        res.status(201).json({ success: true, data: result });
    } catch (err) {
        if (!transaction.finished) await transaction.rollback();
        next(err);
    }
};

exports.updateContact = async (req, res, next) => {
    const transaction = await sequelize.transaction();
    try {
        const payload = validate(wineryContactSchema, req.body);
        const contact = await WineryContact.findOne({
            where: { id: req.params.id, wineryId: req.user.wineryId },
            transaction
        });
        if (!contact) throw new AppError('Contact not found', 404, 'NOT_FOUND');
        const currentLinks = await WineryContactArea.findAll({
            where: { wineryId: req.user.wineryId, contactId: contact.id },
            transaction
        });
        const currentPlacement = placementFromLinks(currentLinks);
        await assertCanManageContact(req, currentPlacement, transaction);

        const hasPlacementUpdate = payload.primaryAreaId !== undefined || payload.linkedAreaIds !== undefined;
        const requestedPlacement = hasPlacementUpdate
            ? normalizeContactPlacement({
                primaryAreaId: payload.primaryAreaId !== undefined ? payload.primaryAreaId : currentPlacement.primaryAreaId,
                linkedAreaIds: payload.linkedAreaIds !== undefined ? payload.linkedAreaIds : currentPlacement.linkedAreaIds
            })
            : currentPlacement;
        const placementChanged = !placementsEqual(currentPlacement, requestedPlacement);
        if (placementChanged) {
            await validateContactPlacement(req, requestedPlacement, { transaction });
        }
        await validateReportsTo({
            wineryId: req.user.wineryId,
            contactId: contact.id,
            reportsToId: payload.reportsToId,
            transaction
        });
        await contact.update(pickAllowedFields(payload, CONTACT_FIELDS), { transaction });
        if (placementChanged) {
            await replaceContactAreas({
                contact,
                wineryId: req.user.wineryId,
                placement: requestedPlacement,
                transaction
            });
        }
        await transaction.commit();
        const result = await WineryContact.findOne({
            where: { id: contact.id, wineryId: req.user.wineryId },
            include: [getContactAreaInclude(req.user.wineryId)]
        });
        res.json({ success: true, data: result });
    } catch (err) {
        if (!transaction.finished) await transaction.rollback();
        next(err);
    }
};

exports.deleteContact = async (req, res, next) => {
    const transaction = await sequelize.transaction();
    try {
        const contact = await WineryContact.findOne({
            where: { id: req.params.id, wineryId: req.user.wineryId },
            transaction
        });
        if (!contact) throw new AppError('Contact not found', 404, 'NOT_FOUND');
        const links = await WineryContactArea.findAll({
            where: { wineryId: req.user.wineryId, contactId: contact.id },
            transaction
        });
        await assertCanManageContact(req, placementFromLinks(links), transaction);
        await contact.destroy({ transaction });
        await transaction.commit();
        res.json({ success: true });
    } catch (err) {
        if (!transaction.finished) await transaction.rollback();
        next(err);
    }
};
