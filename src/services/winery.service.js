const { 
    Winery, WineryBrandProfile, WineryBookingsConfig, 
    WineryBookingType, WineryProduct, WineryPolicyProfile,
    WineryFAQItem, WinerySop, WinerySettings,
    WineryContact, User, OperationalArea, OperationalAreaProfile,
    OperationalAreaBookingsConfig, AreaProductListing,
    OperationalAreaIntegrationConfig
} = require('../models');
const integrationConnectionService = require('./integrationConnection.service');

/**
 * Aggregates all winery data into a single context object for the AI.
 * This is the "Source of Truth" payload.
 */
exports.getAiContext = async (wineryId, { areaIds = [] } = {}) => {
    const scopedAreaIds = areaIds.map(Number).filter(Number.isInteger);
    const winery = await Winery.findByPk(wineryId, {
        include: [
            { model: WineryBrandProfile, as: 'brandProfile' },
            { model: WineryBookingsConfig, as: 'bookingsConfig' },
            { model: WineryBookingType, as: 'bookingTypes', separate: true },
            { model: WineryProduct, as: 'products', where: { isActive: true }, required: false, separate: true },
            { model: WineryPolicyProfile, as: 'policyProfile' },
            { model: WineryFAQItem, as: 'faqs', where: { isActive: true, areaId: null }, required: false, separate: true },
            { model: WinerySop, as: 'sops', where: { isActive: true, areaId: null }, required: false, separate: true },
            { model: WinerySettings, as: 'settings' },
            {
                model: WineryContact,
                as: 'contacts',
                where: { isActive: true },
                required: false,
                separate: true,
                include: [{
                    model: OperationalArea,
                    as: 'OperationalAreas',
                    where: { wineryId },
                    attributes: ['id', 'name'],
                    through: { attributes: ['relationshipType'], where: { wineryId } },
                    required: false
                }]
            },
            {
                model: OperationalArea,
                as: 'OperationalAreas',
                where: {
                    wineryId,
                    isActive: true,
                    ...(scopedAreaIds.length > 0 ? { id: scopedAreaIds } : {})
                },
                required: false,
                separate: true,
                include: [
                    { model: OperationalAreaProfile, as: 'Profile', where: { wineryId }, required: false },
                    { model: OperationalAreaBookingsConfig, as: 'BookingsConfig', where: { wineryId }, required: false },
                    { model: OperationalAreaIntegrationConfig, as: 'IntegrationConfig', where: { wineryId }, required: false },
                    { model: WineryFAQItem, as: 'FAQs', where: { wineryId, isActive: true }, required: false, separate: true },
                    { model: WinerySop, as: 'Sops', where: { wineryId, isActive: true }, required: false, separate: true },
                    { model: WineryBookingType, as: 'BookingTypes', where: { wineryId, isActive: true }, required: false, separate: true },
                    {
                        model: AreaProductListing,
                        as: 'ProductListings',
                        where: { wineryId, isAvailable: true },
                        required: false,
                        separate: true,
                        include: [{ model: WineryProduct, as: 'Product', where: { wineryId, isActive: true }, required: true }]
                    }
                ]
            }
        ]
    });

    if (!winery) return null;

    // Load active system users (staff) for this winery
    const staffUsers = await User.findAll({
        where: { wineryId, isActive: true },
        attributes: ['id', 'displayName', 'email', 'role', 'responsibilities']
    });

    // Build the org chart with resolved manager names
    const contacts = winery.contacts || [];
    const visibleContactIds = new Set();
    if (scopedAreaIds.length === 0) {
        contacts.forEach(contact => visibleContactIds.add(contact.id));
    } else {
        contacts.forEach(contact => {
            const contactAreas = contact.OperationalAreas || [];
            if (contactAreas.length === 0 || contactAreas.some(area => scopedAreaIds.includes(Number(area.id)))) {
                visibleContactIds.add(contact.id);
            }
        });
        let changed = true;
        while (changed) {
            changed = false;
            for (const contact of contacts) {
                if (!visibleContactIds.has(contact.id) || !contact.reportsToId || visibleContactIds.has(contact.reportsToId)) continue;
                visibleContactIds.add(contact.reportsToId);
                changed = true;
            }
        }
    }
    const visibleContacts = contacts.filter(contact => visibleContactIds.has(contact.id));
    const organisationMap = visibleContacts.map(c => {
        let reportsToName = null;
        if (c.reportsToId) {
            const mgr = contacts.find(x => x.id === c.reportsToId);
            reportsToName = mgr ? mgr.name : null;
        }
        return {
            name: c.name,
            role: c.role,
            layer: c.layer,
            email: c.email || null,
            phone: c.phone || null,
            responsibilities: c.responsibilities || null,
            reportsTo: reportsToName,
            areas: (c.OperationalAreas || []).map(area => ({
                id: area.id,
                name: area.name,
                relationshipType: area.WineryContactArea?.relationshipType || 'LINKED'
            }))
        };
    });

    return {
        identity: {
            name: winery.name,
            shortName: winery.shortName || winery.name,
            region: winery.region,
            address: {
                line1: winery.addressLine1,
                suburb: winery.suburb,
                state: winery.state,
                country: winery.country
            },
            contact: {
                phone: winery.publicPhone || winery.contactPhone,
                email: winery.publicEmail || winery.contactEmail,
                website: winery.website
            },
            hours: winery.openingHours,
            descriptors: winery.keyDescriptors
        },
        brand: winery.brandProfile ? {
            story: winery.brandProfile.brandStoryShort,
            tone: winery.brandProfile.tonePreset,
            guidelines: winery.brandProfile.voiceGuidelines,
            doSay: winery.brandProfile.doSayExamples,
            dontSay: winery.brandProfile.dontSayExamples,
            signOff: winery.brandProfile.signOffDefault
        } : null,
        bookings: winery.bookingsConfig ? {
            policy: winery.bookingsConfig,
            experiences: winery.bookingTypes
        } : null,
        inventory: winery.products ? winery.products.map(p => ({
            name: p.name,
            category: p.category,
            vintage: p.vintage,
            price: p.price,
            stock: p.stockStatus,
            notes: p.tastingNotes,
            sellingPoints: p.keySellingPoints
        })) : [],
        policies: {
            profile: winery.policyProfile,
            faqs: winery.faqs ? winery.faqs.map(f => ({ q: f.question, a: f.answer })) : [],
            sops: winery.sops ? winery.sops.map(sop => ({ title: sop.title, body: sop.body })) : []
        },
        organisation: organisationMap,
        areas: (winery.OperationalAreas || []).map(area => ({
            id: area.id,
            name: area.name,
            description: area.description || null,
            publicProfile: {
                email: area.Profile?.publicEmail || winery.publicEmail || null,
                phone: area.Profile?.publicPhone || winery.publicPhone || null,
                openingHours: area.Profile?.openingHoursText || winery.openingHours || null,
                guestDirections: area.Profile?.guestDirections || null,
                serviceNotes: area.Profile?.serviceNotes || null
            },
            bookings: area.BookingsConfig ? {
                policy: area.BookingsConfig,
                experiences: area.BookingTypes || []
            } : null,
            products: (area.ProductListings || []).map(listing => ({
                id: listing.Product.id,
                name: listing.Product.name,
                category: listing.Product.category,
                vintage: listing.Product.vintage,
                price: listing.priceOverride ?? listing.Product.price,
                stock: listing.stockStatusOverride || listing.Product.stockStatus,
                isFeatured: listing.isFeatured,
                tastingNotes: listing.Product.tastingNotes,
                sellingPoints: listing.Product.keySellingPoints,
                salesNotes: listing.salesNotes || null
            })),
            integrations: Object.entries(integrationConnectionService.parseJsonObject(area.IntegrationConfig?.providerConnections))
                .map(([domain, connection]) => ({
                    domain,
                    provider: connection.provider || 'other',
                    status: connection.status || 'not_connected',
                    capabilities: Array.isArray(connection.capabilities) ? connection.capabilities : []
                })),
            knowledge: {
                faqs: (area.FAQs || []).map(faq => ({ q: faq.question, a: faq.answer, tags: faq.tags || [] })),
                sops: (area.Sops || []).map(sop => ({ title: sop.title, body: sop.body }))
            }
        })),
        staff: staffUsers.map(u => ({
            id: u.id,
            name: u.displayName,
            email: u.email,
            role: u.role,
            responsibilities: u.responsibilities || null
        }))
    };
};
