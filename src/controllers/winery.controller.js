const {
    Winery, WineryBrandProfile, WineryBookingsConfig,
    WineryBookingType, WineryProduct, WineryPolicyProfile,
    WineryFAQItem, WineryIntegrationConfig, WinerySop, WineryContact, WinerySettings
} = require('../models');
const AppError = require('../utils/AppError');
const {
    validate, wineryBrandSchema, wineryBookingsSchema,
    wineryPolicySchema, wineryIntegrationSchema, wineryIntegrationTestSchema,
    emailSyncSchema, winerySopSchema, winerySettingsSchema, wineryContactSchema
} = require('../utils/validation');
const emailSyncService = require('../services/emailSync.service');
const integrationConnectionService = require('../services/integrationConnection.service');

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

function pickAllowedFields(body, allowedFields) {
    const picked = {};
    for (const field of allowedFields) {
        if (body[field] !== undefined) picked[field] = body[field];
    }
    return picked;
}

// --- GET FULL PROFILE ---
exports.getWinery = async (req, res, next) => {
    try {
        const wineryId = req.user.wineryId;
        const winery = await Winery.findByPk(wineryId, {
            include: [
                { model: WineryBrandProfile, as: 'brandProfile' },
                { model: WineryBookingsConfig, as: 'bookingsConfig' },
                { model: WineryBookingType, as: 'bookingTypes' },
                { model: WineryProduct, as: 'products' }, // Include inactive for admin
                { model: WineryPolicyProfile, as: 'policyProfile' },
                { model: WineryFAQItem, as: 'faqs' },
                { model: WinerySop, as: 'sops' },
                { model: WineryIntegrationConfig, as: 'integrationConfig' },
                { model: WineryContact, as: 'contacts' },
                { model: WinerySettings, as: 'settings' }
            ]
        });

        if (!winery) throw new AppError('Winery not found', 404, 'NOT_FOUND');

        res.json({ success: true, data: winery });
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

        res.json({ success: true, data: config, settings });
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

        res.json({ success: true, data: result });
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
        const type = await WineryBookingType.create({
            ...pickAllowedFields(req.body, BOOKING_TYPE_FIELDS),
            wineryId: req.user.wineryId
        });
        res.status(201).json({ success: true, data: type });
    } catch (err) { next(err); }
};
exports.updateBookingType = async (req, res, next) => {
    try {
        const type = await WineryBookingType.findOne({ where: { id: req.params.id, wineryId: req.user.wineryId } });
        if (!type) throw new AppError('Booking type not found', 404, 'NOT_FOUND');

        await type.update(pickAllowedFields(req.body, BOOKING_TYPE_FIELDS));
        res.json({ success: true, data: type });
    } catch (err) { next(err); }
};
exports.deleteBookingType = async (req, res, next) => {
    try {
        await WineryBookingType.destroy({ where: { id: req.params.id, wineryId: req.user.wineryId } });
        res.json({ success: true });
    } catch (err) { next(err); }
};

// --- CRUD: FAQS ---
exports.createFAQ = async (req, res, next) => {
    try {
        const faq = await WineryFAQItem.create({
            ...pickAllowedFields(req.body, FAQ_FIELDS),
            wineryId: req.user.wineryId
        });
        res.status(201).json({ success: true, data: faq });
    } catch (err) { next(err); }
};
exports.updateFAQ = async (req, res, next) => {
    try {
        const faq = await WineryFAQItem.findOne({ where: { id: req.params.id, wineryId: req.user.wineryId } });
        if (!faq) throw new AppError('FAQ not found', 404, 'NOT_FOUND');

        await faq.update(pickAllowedFields(req.body, FAQ_FIELDS));
        res.json({ success: true, data: faq });
    } catch (err) { next(err); }
};
exports.deleteFAQ = async (req, res, next) => {
    try {
        const { id } = req.params;
        // Handle Rename: if user hits /policies endpoint, it might route here
        await WineryFAQItem.destroy({ where: { id, wineryId: req.user.wineryId } });
        res.json({ success: true });
    } catch (err) { next(err); }
};

// --- CRUD: SOPS ---
exports.createSop = async (req, res, next) => {
    try {
        const payload = validate(winerySopSchema, req.body);
        const sop = await WinerySop.create({ ...payload, wineryId: req.user.wineryId });
        res.status(201).json({ success: true, data: sop });
    } catch (err) { next(err); }
};

exports.updateSop = async (req, res, next) => {
    try {
        const payload = validate(winerySopSchema, req.body);
        const sop = await WinerySop.findOne({ where: { id: req.params.id, wineryId: req.user.wineryId } });
        if (!sop) throw new AppError('SOP not found', 404, 'NOT_FOUND');
        await sop.update(payload);
        res.json({ success: true, data: sop });
    } catch (err) { next(err); }
};

exports.deleteSop = async (req, res, next) => {
    try {
        const { id } = req.params;
        await WinerySop.destroy({ where: { id, wineryId: req.user.wineryId } });
        res.json({ success: true });
    } catch (err) { next(err); }
};

// --- CRUD: CONTACTS ---
exports.createContact = async (req, res, next) => {
    try {
        const payload = validate(wineryContactSchema, req.body);
        const contact = await WineryContact.create({ ...payload, wineryId: req.user.wineryId });
        res.status(201).json({ success: true, data: contact });
    } catch (err) { next(err); }
};

exports.updateContact = async (req, res, next) => {
    try {
        const payload = validate(wineryContactSchema, req.body);
        const contact = await WineryContact.findOne({ where: { id: req.params.id, wineryId: req.user.wineryId } });
        if (!contact) throw new AppError('Contact not found', 404, 'NOT_FOUND');
        await contact.update(payload);
        res.json({ success: true, data: contact });
    } catch (err) { next(err); }
};

exports.deleteContact = async (req, res, next) => {
    try {
        const { id } = req.params;
        await WineryContact.destroy({ where: { id, wineryId: req.user.wineryId } });
        res.json({ success: true });
    } catch (err) { next(err); }
};
