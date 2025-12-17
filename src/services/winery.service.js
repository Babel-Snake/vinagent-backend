const { 
    Winery, WineryBrandProfile, WineryBookingsConfig, 
    WineryBookingType, WineryProduct, WineryPolicyProfile, 
    WineryFAQItem, WineryIntegrationConfig, WinerySettings 
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
            { model: WinerySettings, as: 'settings' } // Legacy settings
        ]
    });

    if (!winery) return null;

    // Transform into a clean, prose-ready object if needed, 
    // but raw JSON is usually fine for LLMs if keys are descriptive.
    // We might want to strip IDs or timestamps to save tokens.
    
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
            experiences: winery.bookingTypes // List of active types
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
        }
    };
};
