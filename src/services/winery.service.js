const { 
    Winery, WineryBrandProfile, WineryBookingsConfig, 
    WineryBookingType, WineryProduct, WineryPolicyProfile, 
    WineryFAQItem, WineryIntegrationConfig, WinerySettings,
    WineryContact, User
} = require('../models');

/**
 * Aggregates all winery data into a single context object for the AI.
 * This is the "Source of Truth" payload.
 */
exports.getAiContext = async (wineryId) => {
    const winery = await Winery.findByPk(wineryId, {
        include: [
            { model: WineryBrandProfile, as: 'brandProfile' },
            { model: WineryBookingsConfig, as: 'bookingsConfig' },
            { model: WineryBookingType, as: 'bookingTypes' },
            { model: WineryProduct, as: 'products', where: { isActive: true }, required: false },
            { model: WineryPolicyProfile, as: 'policyProfile' },
            { model: WineryFAQItem, as: 'faqs', where: { isActive: true }, required: false },
            { model: WinerySettings, as: 'settings' },
            { model: WineryContact, as: 'contacts', where: { isActive: true }, required: false }
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
    const organisationMap = contacts.map(c => {
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
            reportsTo: reportsToName
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
            faqs: winery.faqs ? winery.faqs.map(f => ({ q: f.question, a: f.answer })) : []
        },
        organisation: organisationMap,
        staff: staffUsers.map(u => ({
            id: u.id,
            name: u.displayName,
            email: u.email,
            role: u.role,
            responsibilities: u.responsibilities || null
        }))
    };
};
