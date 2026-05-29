require('dotenv').config();

const admin = require('../config/firebase');
const db = require('../models');

const SIDEWOOD_KEY = 'sidewood-estate';

const providerConnections = {
    booking: {
        provider: 'opentable',
        status: 'connected',
        authMethod: 'manual',
        externalAccountId: '',
        externalLocationId: '',
        baseUrl: '',
        webhookUrl: '',
        webhookSigningConfigured: false,
        capabilities: [
            'public online bookings',
            'cellar door experiences',
            'restaurant bookings',
            'credit card details for no-show / late-cancellation policy'
        ],
        notes: 'Public website routes bookings through OpenTable/Groove OpenTable. Exact account/location IDs must be added internally.'
    },
    crm: {
        provider: 'other',
        status: 'needs_reauth',
        authMethod: 'manual',
        externalAccountId: '',
        externalLocationId: '',
        baseUrl: 'https://sidewood.com.au',
        webhookUrl: '',
        webhookSigningConfigured: false,
        capabilities: [
            'online wine shop',
            'wine club signup',
            'customer newsletter capture'
        ],
        notes: 'Public shop appears Shopify-based. Confirm exact CRM/wine club provider internally before production integration.'
    },
    pos: {
        provider: 'other',
        status: 'not_connected',
        authMethod: 'none',
        externalAccountId: '',
        externalLocationId: '',
        baseUrl: '',
        webhookUrl: '',
        webhookSigningConfigured: false,
        capabilities: [],
        notes: 'No reliable public source found for cellar door POS provider. Leave disconnected in demo unless you know the provider.'
    },
    email: {
        provider: 'other',
        status: 'not_connected',
        authMethod: 'none',
        externalAccountId: '',
        externalLocationId: '',
        baseUrl: '',
        webhookUrl: '',
        webhookSigningConfigured: false,
        capabilities: ['outbound customer email'],
        notes: 'Public email addresses are known, but email delivery provider is not publicly verified.'
    },
    sms: {
        provider: 'other',
        status: 'not_connected',
        authMethod: 'none',
        externalAccountId: '',
        externalLocationId: '',
        baseUrl: '',
        webhookUrl: '',
        webhookSigningConfigured: false,
        capabilities: [],
        notes: 'No public SMS provider identified. Keep off for initial demo unless configured.'
    },
    delivery: {
        provider: 'other',
        status: 'not_connected',
        authMethod: 'none',
        externalAccountId: '',
        externalLocationId: '',
        baseUrl: '',
        webhookUrl: '',
        webhookSigningConfigured: false,
        capabilities: [],
        notes: 'No reliable public delivery provider identified.'
    }
};

const experiences = [
    {
        name: 'Interactive Tasting',
        priceCents: 2000,
        description: 'A guided, conversational tasting through a bespoke selection of Sidewood\'s award-winning wines and ciders. Public information lists tastings up to 6 people from $20 per person, with OpenTable showing $0-$25 depending on booking setup.',
        notesForGuests: 'Best for individuals and small groups wanting guidance from the cellar door team.',
        maxGuests: 6,
        isActive: true
    },
    {
        name: 'Group Tasting',
        priceCents: 2000,
        description: 'A set tasting for groups of 6-20 guests, guided by the cellar door team in a conversational and memorable way.',
        notesForGuests: 'For groups over 20, contact cellardoor@sidewood.com.au.',
        minGuests: 6,
        maxGuests: 20,
        isActive: true
    },
    {
        name: 'Self-Guided Wine Flight',
        priceCents: 2600,
        description: 'Four 60mL pours presented on a tasting paddle, designed for guests to enjoy at their own pace. Public booking information lists self-guided flights from approximately $26-$35 per person. Redeemable on a dozen-bottle take-home purchase.',
        notesForGuests: 'Good for guests who want a relaxed, self-paced tasting.',
        isActive: true
    },
    {
        name: 'Nearly Naked 0% Alcohol Wine Flight',
        priceCents: 2400,
        description: 'A four-pour, 60mL zero-alcohol wine flight showcasing Sidewood\'s Nearly Naked 0% range.',
        notesForGuests: 'A strong option for designated drivers, non-drinkers, or guests wanting a no-alcohol tasting experience.',
        isActive: true
    },
    {
        name: 'Introduction to Wine Tasting Masterclass',
        priceCents: 5000,
        description: 'A 60-minute masterclass teaching wine tasting basics, common wine terms, and palate vocabulary while tasting highly awarded Australian wines.',
        durationMinutes: 60,
        isActive: true
    },
    {
        name: 'Sabrage Masterclass',
        priceCents: 5500,
        description: 'A 45-minute sparkling wine experience where guests learn the traditional technique of opening a bottle of sparkling with a sword, then enjoy the bottle they opened.',
        durationMinutes: 45,
        minGuests: 2,
        notesForGuests: 'Minimum 2 people. One bottle per couple.',
        isActive: true
    },
    {
        name: 'Cider Tasting Paddle',
        priceCents: 1200,
        description: 'A tasting paddle featuring Sidewood handcrafted ciders made from Adelaide Hills fruit, including apple, pear, and apple-strawberry.',
        notesForGuests: 'Available in cellar door.',
        isActive: true
    }
];

const products = [
    {
        name: 'NV Sidewood Estate Sparkling',
        vintage: 'NV',
        category: 'Sparkling',
        price: 28,
        stockStatus: 'IN_STOCK',
        tastingNotes: 'Lifted aromas of strawberry, lemon citrus and biscotti. Elegant, well-integrated palate with strawberry, nectarine, cashew, citrus and nougat.',
        keySellingPoints: ['60% Pinot Noir and 40% Chardonnay', 'Adelaide Hills cool-climate sparkling', 'estate bottled', 'Charmat secondary ferment', 'strong award history'],
        awards: 'Great Gold 2025 Catavinum Wine Show Spain; Great Gold 2024 Catavinum Wine Show Spain; Gold + 98 points 2026 50 Great Sparkling Wines Awards.',
        pairingSuggestions: 'Aperitif, seafood, light canapes, soft cheeses, celebration occasions.'
    },
    {
        name: 'NV Sidewood Estate Sparkling Pinot Rose',
        vintage: 'NV',
        category: 'Sparkling',
        price: 28,
        stockStatus: 'IN_STOCK',
        tastingNotes: 'Fresh strawberry, wild raspberries and dried fig aromas. Round, balanced palate with cherry, white peach, strawberry, crisp minerality and a touch of brioche.',
        keySellingPoints: ['100% Pinot Noir', 'cool-climate Adelaide Hills fruit', 'fresh and generous sparkling rose', 'strong sparkling awards record'],
        awards: 'Great Gold + 95 points 2025 Catavinum World Wine Spain; Great Gold + 95 points 2024 Australian Sparkling Wine Show; 92 points Wine Orbit; 92 points James Suckling.',
        pairingSuggestions: 'Charcuterie, smoked salmon, soft cheeses, strawberries, brunch-style dishes.'
    },
    {
        name: '2025 Sidewood Estate Sauvignon Blanc',
        vintage: '2025',
        category: 'White',
        price: 26,
        stockStatus: 'IN_STOCK',
        tastingNotes: 'Vibrant aromas of passionfruit, citrus blossom and lime zest, with zippy acidity and a refreshing finish.',
        keySellingPoints: ['Charleston and Oakbank fruit', 'low-yielding parcels', 'cool fermented for freshness', 'highly awarded 2025 vintage'],
        awards: 'Trophy + 95 points + Best Sauvignon Blanc 2025 Royal Perth Wine Show; Top Gold + 96 points 2025 Cowra Wine Show; Gold 2025 Rutherglen Wine Show.',
        pairingSuggestions: 'Seafood, goat cheese, salads, Thai-style dishes, fresh summer plates.'
    },
    {
        name: '2025 Sidewood Estate Pinot Gris',
        vintage: '2025',
        category: 'White',
        price: 28,
        stockStatus: 'IN_STOCK',
        tastingNotes: 'Lifted pear, white nectarine and subtle floral notes. Medium-bodied and textural with gentle stone fruit, rounded mouthfeel, bright acidity and a clean poised finish.',
        keySellingPoints: ['estate-grown Adelaide Hills Pinot Gris', 'hand-picked Charleston and Oakbank fruit', 'portion wild fermented in large-format French oak', 'one of Sidewood\'s strongest current award performers'],
        awards: 'Trophy + Best Pinot Gris or Grigio Royal Sydney Wine Show; Top Gold Royal Perth Wine Show; 95 points Halliday Wine Companion.',
        pairingSuggestions: 'Seafood, lighter spice-driven dishes, modern Australian cuisine, chicken, pork.'
    },
    {
        name: '2024 Mappinga Chardonnay',
        vintage: '2024',
        category: 'White',
        price: 60,
        stockStatus: 'IN_STOCK',
        tastingNotes: 'White peach, nectarine and grapefruit with grilled hazelnut and flinty complexity. Concentrated stone fruit, citrus, saline minerality and fine oak tannins.',
        keySellingPoints: ['flagship Mappinga range', 'estate-grown fruit', 'wild yeast fermented', 'large-format French oak', 'long-term cellaring potential'],
        awards: 'Trophy Best White Wine in Show, International Cool Climate Wine Show 2025; 95 points Sam Kim Wine Orbit; 94 points Halliday Wine Companion.',
        pairingSuggestions: 'Rich seafood, roast poultry, cream-based dishes, lobster, scallops.'
    },
    {
        name: '2025 Sidewood Estate Rose',
        vintage: '2025',
        category: 'Rose',
        price: 26,
        stockStatus: 'IN_STOCK',
        tastingNotes: 'Dry, bright and refreshing with red berries, citrus peel, subtle florals, fresh strawberry, red cherry, crisp acidity and a savoury mineral thread.',
        keySellingPoints: ['dry Adelaide Hills rose', 'estate-grown fruit', 'fresh savoury style', 'designed for immediate enjoyment'],
        awards: '',
        pairingSuggestions: 'Warm weather dishes, antipasto, salads, seafood, grilled chicken, picnic-style food.'
    },
    {
        name: '2024 Sidewood Estate Pinot Noir',
        vintage: '2024',
        category: 'Red',
        price: 35,
        stockStatus: 'IN_STOCK',
        tastingNotes: 'Wild strawberry and dark cherry with forest floor and bay leaf. Elegant red fruit palate with violet, spice, delicate tannins, length and drive.',
        keySellingPoints: ['Adelaide Hills Pinot Noir', 'hand-picked low-yielding vines', 'wild ferment', 'large-format French oak', 'pairs strongly with duck and game'],
        awards: 'Double Gold 2026 Gilbert & Gaillard France; Double Gold + 96 points 2025 Melbourne International Wine Competition; Gold + 94 points 2025 Catavinum World Wine Spain.',
        pairingSuggestions: 'Duck, game dishes, wild mushrooms, roast chicken, mushroom risotto.'
    },
    {
        name: '2022 Estate Shiraz',
        vintage: '2022',
        category: 'Red',
        price: 30,
        stockStatus: 'IN_STOCK',
        tastingNotes: 'Medium-bodied cool-climate Shiraz with dark berries, plum, cracked pepper, spice, floral notes, blackberry, cherry, fine tannins and bright acidity.',
        keySellingPoints: ['estate-grown Adelaide Hills Shiraz', 'cool-climate style', 'strong value at cellar door price', 'food-friendly red'],
        awards: '95 points James Halliday Wine Companion; 93 points Tony Love Wine Pilot.',
        pairingSuggestions: 'Lamb, beef, chargrilled vegetables, mushroom dishes, winter mains.'
    },
    {
        name: '2025 Sidewood Estate Gamay',
        vintage: '2025',
        category: 'Red',
        price: 35,
        stockStatus: 'IN_STOCK',
        tastingNotes: 'Raspberry, black cherry, violets and spice. Juicy and succulent palate with vibrant fruit, a hint of gaminess, soft tannins and bright acidity.',
        keySellingPoints: ['Adelaide Hills Gamay', 'carbonic maceration and whole-berry ferment', 'wild yeast', 'seasoned French oak puncheons', 'approachable young but cellarable'],
        awards: '94 points Halliday Wine Companion; 94 points Sam Kim Wine Orbit.',
        pairingSuggestions: 'Pork terrine, grilled salmon with Dijon glaze, charcuterie, lightly chilled red wine service.'
    },
    {
        name: '2024 Vigneron\'s Release Abel Pinot Noir',
        vintage: '2024',
        category: 'Red',
        price: 50,
        stockStatus: 'IN_STOCK',
        tastingNotes: 'Dark cherry, Davidson plum and pine forest floor, with wild berries, allspice, seamless tannins and a fine complex finish.',
        keySellingPoints: ['limited release', '250 dozen produced', 'single vineyard', 'Abel / Gumboot Pinot Noir clone', 'estate grown and bottled'],
        awards: '95 points Andrew Caillard, The Vintage Journal.',
        pairingSuggestions: 'Duck, mushroom dishes, roast poultry, game meats, premium tasting flights.'
    },
    {
        name: 'Sidewood Rare 22 Year Old Tawny',
        vintage: '22 Year Old',
        category: 'Fortified',
        price: 64,
        stockStatus: 'IN_STOCK',
        tastingNotes: 'Detailed tasting notes should be confirmed from the current product sheet before live use.',
        keySellingPoints: ['rare aged tawny', 'premium after-dinner option', 'gift-friendly'],
        awards: '',
        pairingSuggestions: 'Dark chocolate, blue cheese, dried fruits, nuts, after-dinner service.'
    },
    {
        name: 'Sidewood Cap',
        vintage: '',
        category: 'Merchandise',
        price: 20,
        stockStatus: 'IN_STOCK',
        tastingNotes: '',
        keySellingPoints: ['branded merchandise', 'cellar door add-on sale'],
        awards: '',
        pairingSuggestions: ''
    }
];

const sops = [
    ['Booking Guidance', 'Encourage guests to book ahead, especially for tastings, restaurant bookings, weekends, masterclasses, and groups. Walk-ins can be welcomed subject to capacity, but staff should avoid guaranteeing availability without checking the booking system.'],
    ['Groups Over 20 Guests', 'For groups over 20 people, direct the customer to the cellar door team at cellardoor@sidewood.com.au so the team can review space, staffing and suitable experience options.'],
    ['OpenTable Card Handling', 'If customers ask about card details, explain that credit card details are handled by OpenTable for no-show and late-cancellation policy enforcement. Sidewood cannot access full card details.'],
    ['Children and Booking Numbers', 'Children are welcome in suitable areas, especially the garden area. Children and infants must be included in booking guest numbers.'],
    ['Pets Policy', 'Pets are permitted in the Garden Area only and must be kept on a leash at all times. Pets are not permitted in the Courtyard, Deck Area or Gallery Restaurant.'],
    ['Garden Area Service', 'The Garden Area is a relaxed self-service area on weekends. Guests can order from the garden/wood-fired pizza offering and use a buzzer when food is ready.'],
    ['Responsible Service Reminder', 'Staff should follow RSA obligations at all times. Offer water, food, zero-alcohol options and transport-aware recommendations when appropriate.']
];

const faqs = [
    ['Where is Sidewood Estate Cellar Door?', 'Sidewood Estate Cellar Door & Restaurant is located at 6 River Road, Hahndorf SA 5245.', ['location', 'cellar-door', 'directions']],
    ['What is the best phone number for cellar door enquiries?', 'Please call the Cellar Door & Restaurant team on (08) 8388 1157.', ['contact', 'phone']],
    ['What email should customers use for cellar door enquiries?', 'For cellar door enquiries, use cellardoor@sidewood.com.au. For restaurant bookings, bookings@sidewood.com.au is also publicly listed.', ['contact', 'email', 'bookings']],
    ['Do guests need to book?', 'Bookings are highly recommended, especially for tastings, restaurant visits, masterclasses, weekends and groups. Walk-ins may be possible subject to availability.', ['bookings', 'walk-ins']],
    ['Can groups book a tasting?', 'Yes. Group tastings are listed for groups of 6-20 people. For groups over 20, contact cellardoor@sidewood.com.au.', ['groups', 'tastings']],
    ['Are children welcome?', 'Yes. Sidewood has a family-friendly garden area with swings and space for children to run and play. Children and infants should be included in booking numbers.', ['kids', 'families', 'garden']],
    ['Are pets allowed?', 'Pets are allowed in the Garden Area only and must remain on a leash. Pets are not allowed in the Courtyard, Deck Area or Gallery Restaurant.', ['pets', 'dogs', 'garden']],
    ['What tasting experiences are available?', 'Current public tasting options include Interactive Tasting, Group Tasting, Self-Guided Wine Flight, Nearly Naked 0% Alcohol Wine Flight, Introduction to Wine Tasting Masterclass, Sabrage Masterclass and Cider Tasting Paddle.', ['tastings', 'experiences']],
    ['Is there a zero-alcohol tasting option?', 'Yes. The Nearly Naked 0% Alcohol Wine Flight includes four 60mL pours from Sidewood\'s zero-alcohol wine range.', ['zero-alcohol', 'nearly-naked', 'tastings']],
    ['Can tasting fees be redeemed?', 'Public information says self-guided wine flights are redeemable on a dozen-bottle take-home purchase.', ['tastings', 'redeemable', 'purchases']],
    ['What should staff say if customers ask about opening hours?', 'Confirm the current opening hours before replying. Public sources currently vary between 10am-5pm and 11am-5pm for the cellar door.', ['hours', 'verify', 'internal-warning']]
];

const contacts = [
    {
        name: 'Owen',
        role: 'Executive',
        email: 'owen@sidewood.com.au',
        layer: 'Executive',
        responsibilities: 'Executive leadership and internal escalation.'
    },
    {
        name: 'Clare',
        role: 'Wine Club Manager',
        email: 'clare@sidewood.com.au',
        layer: 'Wine Club',
        responsibilities: 'Wine club enquiries, member support and subscriptions.'
    },
    {
        name: 'Bradley',
        role: 'Logistics',
        email: 'bradley@sidewood.com.au',
        layer: 'Logistics',
        responsibilities: 'Logistics, dispatch and fulfilment coordination.'
    },
    {
        name: 'Lisa',
        role: 'Accounts',
        email: 'lisa@sidewood.com.au',
        layer: 'Accounts',
        responsibilities: 'Accounts enquiries, payments and finance follow-up.'
    },
    {
        name: 'Lara',
        role: 'Media/Marketing',
        email: 'lara@sidewood.com.au',
        layer: 'Media/Marketing',
        responsibilities: 'Media, marketing and brand communications.'
    }
];

const users = [
    {
        username: 'serena',
        email: 'serena@sidewood.com.au',
        displayName: 'Serena',
        role: 'manager',
        responsibilities: 'Main Sidewood demo manager account.'
    },
    { username: 'jacob', displayName: 'Jacob', role: 'staff' },
    { username: 'nick', displayName: 'Nick', role: 'staff' },
    { username: 'james', displayName: 'James', role: 'staff' },
    { username: 'joanna', displayName: 'Joanna', role: 'staff' }
];

const customers = [
    {
        firstName: 'Amelia',
        lastName: 'Hart',
        email: 'amelia.hart@example.test',
        phone: '0401 110 221',
        suburb: 'Norwood',
        state: 'SA',
        postcode: '5067',
        source: 'wine_club',
        loyaltyTier: 'gold',
        isWineClubMember: true,
        tags: ['VIP', 'sparkling', 'local'],
        preferredContactMethod: 'email',
        marketingOptIn: true,
        lifetimeSpend: 1840,
        totalOrders: 12,
        visitCount: 7,
        notes: 'Demo member. Prefers sparkling releases and lunch booking reminders.'
    },
    {
        firstName: 'Thomas',
        lastName: 'Nguyen',
        email: 'thomas.nguyen@example.test',
        phone: '0402 334 556',
        suburb: 'Hahndorf',
        state: 'SA',
        postcode: '5245',
        source: 'wine_club',
        loyaltyTier: 'silver',
        isWineClubMember: true,
        tags: ['local', 'pinot-noir'],
        preferredContactMethod: 'sms',
        marketingOptIn: true,
        lifetimeSpend: 960,
        totalOrders: 7,
        visitCount: 9,
        notes: 'Demo member. Often asks about Pinot Noir allocations.'
    },
    {
        firstName: 'Charlotte',
        lastName: 'Bennett',
        email: 'charlotte.bennett@example.test',
        phone: '0403 778 991',
        suburb: 'Unley',
        state: 'SA',
        postcode: '5061',
        source: 'website',
        loyaltyTier: 'platinum',
        isWineClubMember: true,
        tags: ['corporate', 'events', 'premium'],
        preferredContactMethod: 'email',
        marketingOptIn: true,
        lifetimeSpend: 3260,
        totalOrders: 18,
        visitCount: 5,
        notes: 'Demo member. Interested in masterclasses and corporate gifting.'
    },
    {
        firstName: 'Ethan',
        lastName: 'Walker',
        email: 'ethan.walker@example.test',
        phone: '0404 222 883',
        suburb: 'Mount Barker',
        state: 'SA',
        postcode: '5251',
        source: 'pos',
        loyaltyTier: 'bronze',
        isWineClubMember: true,
        tags: ['shiraz', 'pickup'],
        preferredContactMethod: 'phone',
        marketingOptIn: false,
        lifetimeSpend: 430,
        totalOrders: 4,
        visitCount: 6,
        notes: 'Demo member. Usually collects orders in person.'
    },
    {
        firstName: 'Mia',
        lastName: 'Kowalski',
        email: 'mia.kowalski@example.test',
        phone: '0405 660 112',
        suburb: 'Stirling',
        state: 'SA',
        postcode: '5152',
        source: 'wine_club',
        loyaltyTier: 'gold',
        isWineClubMember: true,
        tags: ['chardonnay', 'gift-buyer'],
        preferredContactMethod: 'email',
        marketingOptIn: true,
        lifetimeSpend: 1425,
        totalOrders: 10,
        visitCount: 4,
        notes: 'Demo member. Buys Mappinga Chardonnay as gifts.'
    },
    {
        firstName: 'Oliver',
        lastName: 'Singh',
        email: 'oliver.singh@example.test',
        phone: '0406 991 734',
        suburb: 'Adelaide',
        state: 'SA',
        postcode: '5000',
        source: 'referral',
        loyaltyTier: 'silver',
        isWineClubMember: true,
        tags: ['zero-alcohol', 'events'],
        preferredContactMethod: 'email',
        marketingOptIn: true,
        lifetimeSpend: 780,
        totalOrders: 6,
        visitCount: 3,
        notes: 'Demo member. Interested in Nearly Naked 0% and event options.'
    },
    {
        firstName: 'Grace',
        lastName: 'Miller',
        email: 'grace.miller@example.test',
        phone: '0407 128 450',
        suburb: 'Glenelg',
        state: 'SA',
        postcode: '5045',
        source: 'import',
        loyaltyTier: 'bronze',
        isWineClubMember: true,
        tags: ['rose', 'summer'],
        preferredContactMethod: 'sms',
        marketingOptIn: true,
        lifetimeSpend: 360,
        totalOrders: 3,
        visitCount: 2,
        notes: 'Demo member. Responds well to seasonal rose offers.'
    },
    {
        firstName: 'Noah',
        lastName: 'Reed',
        email: 'noah.reed@example.test',
        phone: '0408 441 909',
        suburb: 'Prospect',
        state: 'SA',
        postcode: '5082',
        source: 'wine_club',
        loyaltyTier: 'gold',
        isWineClubMember: true,
        tags: ['fortified', 'tawny'],
        preferredContactMethod: 'email',
        marketingOptIn: false,
        lifetimeSpend: 1675,
        totalOrders: 9,
        visitCount: 1,
        notes: 'Demo member. Primarily purchases fortified and premium red wines.'
    },
    {
        firstName: 'Sophie',
        lastName: 'Taylor',
        email: 'sophie.taylor@example.test',
        phone: '0411 320 882',
        suburb: 'Mawson Lakes',
        state: 'SA',
        postcode: '5095',
        source: 'booking',
        loyaltyTier: 'none',
        isWineClubMember: false,
        tags: ['birthday', 'group-booking'],
        preferredContactMethod: 'email',
        marketingOptIn: true,
        lifetimeSpend: 120,
        totalOrders: 1,
        visitCount: 1,
        notes: 'Demo guest. Booked a birthday tasting for six guests.'
    },
    {
        firstName: 'Liam',
        lastName: 'Roberts',
        email: 'liam.roberts@example.test',
        phone: '0412 876 221',
        suburb: 'Melbourne',
        state: 'VIC',
        postcode: '3000',
        source: 'walk_in',
        loyaltyTier: 'none',
        isWineClubMember: false,
        tags: ['tourist', 'sparkling'],
        preferredContactMethod: 'email',
        marketingOptIn: false,
        lifetimeSpend: 56,
        totalOrders: 1,
        visitCount: 1,
        notes: 'Demo guest. Walk-in visitor who bought sparkling.'
    },
    {
        firstName: 'Isabella',
        lastName: 'Chen',
        email: 'isabella.chen@example.test',
        phone: '0413 221 004',
        suburb: 'Sydney',
        state: 'NSW',
        postcode: '2000',
        source: 'website',
        loyaltyTier: 'none',
        isWineClubMember: false,
        tags: ['shipping-question', 'online-shop'],
        preferredContactMethod: 'email',
        marketingOptIn: true,
        lifetimeSpend: 210,
        totalOrders: 2,
        visitCount: 0,
        notes: 'Demo guest. Online customer with shipping questions.'
    },
    {
        firstName: 'Henry',
        lastName: 'Olsen',
        email: 'henry.olsen@example.test',
        phone: '0414 559 304',
        suburb: 'Bridgewater',
        state: 'SA',
        postcode: '5155',
        source: 'sms',
        loyaltyTier: 'none',
        isWineClubMember: false,
        tags: ['pets', 'garden-area'],
        preferredContactMethod: 'sms',
        marketingOptIn: false,
        lifetimeSpend: 0,
        totalOrders: 0,
        visitCount: 0,
        notes: 'Demo guest. Asked whether dogs are allowed in the garden area.'
    },
    {
        firstName: 'Ava',
        lastName: 'Martin',
        email: 'ava.martin@example.test',
        phone: '0415 304 771',
        suburb: 'Blackwood',
        state: 'SA',
        postcode: '5051',
        source: 'email',
        loyaltyTier: 'none',
        isWineClubMember: false,
        tags: ['masterclass', 'sabrage'],
        preferredContactMethod: 'email',
        marketingOptIn: true,
        lifetimeSpend: 110,
        totalOrders: 1,
        visitCount: 1,
        notes: 'Demo guest. Interested in sabrage masterclass availability.'
    },
    {
        firstName: 'Jack',
        lastName: 'Wilson',
        email: 'jack.wilson@example.test',
        phone: '0416 992 610',
        suburb: 'Perth',
        state: 'WA',
        postcode: '6000',
        source: 'booking',
        loyaltyTier: 'none',
        isWineClubMember: false,
        tags: ['restaurant', 'dietary'],
        preferredContactMethod: 'phone',
        marketingOptIn: false,
        lifetimeSpend: 0,
        totalOrders: 0,
        visitCount: 0,
        notes: 'Demo guest. Asked about restaurant dietary options before booking.'
    },
    {
        firstName: 'Ruby',
        lastName: 'Anderson',
        email: 'ruby.anderson@example.test',
        phone: '0417 488 117',
        suburb: 'Brighton',
        state: 'SA',
        postcode: '5048',
        source: 'pos',
        loyaltyTier: 'none',
        isWineClubMember: false,
        tags: ['merchandise', 'cap'],
        preferredContactMethod: 'any',
        marketingOptIn: true,
        lifetimeSpend: 48,
        totalOrders: 2,
        visitCount: 2,
        notes: 'Demo guest. Bought cider and merchandise at cellar door.'
    },
    {
        firstName: 'Samuel',
        lastName: 'Davies',
        email: 'samuel.davies@example.test',
        phone: '0418 705 664',
        suburb: 'Canberra',
        state: 'ACT',
        postcode: '2601',
        source: 'referral',
        loyaltyTier: 'none',
        isWineClubMember: false,
        tags: ['large-group', 'over-20'],
        preferredContactMethod: 'email',
        marketingOptIn: false,
        lifetimeSpend: 0,
        totalOrders: 0,
        visitCount: 0,
        notes: 'Demo guest. Enquired about a group larger than 20 guests.'
    },
    {
        firstName: 'Top Food and Wine',
        lastName: 'Tours',
        email: 'bookings@topfoodandwinetours.example.test',
        phone: '0420 510 118',
        suburb: 'Adelaide',
        state: 'SA',
        postcode: '5000',
        source: 'booking',
        customerType: 'tour_operator',
        loyaltyTier: 'none',
        isWineClubMember: false,
        tags: ['tour-operator', 'bus-tour', 'groups'],
        preferredContactMethod: 'email',
        marketingOptIn: true,
        lifetimeSpend: 840,
        totalOrders: 4,
        visitCount: 6,
        notes: 'Demo tour operator. Coordinates organised bus tours and group tasting bookings.'
    },
    {
        firstName: 'Hills Luxury',
        lastName: 'Day Tours',
        email: 'hello@hillsluxurydaytours.example.test',
        phone: '0421 640 772',
        suburb: 'Stirling',
        state: 'SA',
        postcode: '5152',
        source: 'referral',
        customerType: 'tour_operator',
        loyaltyTier: 'none',
        isWineClubMember: false,
        tags: ['tour-operator', 'luxury-tour', 'private-groups'],
        preferredContactMethod: 'phone',
        marketingOptIn: true,
        lifetimeSpend: 1260,
        totalOrders: 6,
        visitCount: 8,
        notes: 'Demo tour operator. Usually brings smaller private groups seeking premium experiences.'
    },
    {
        firstName: 'Trail',
        lastName: 'Hopper',
        email: 'sidewood@trailhopper.example.test',
        phone: '0422 882 445',
        suburb: 'Hahndorf',
        state: 'SA',
        postcode: '5245',
        source: 'booking',
        customerType: 'tour_operator',
        loyaltyTier: 'none',
        isWineClubMember: false,
        tags: ['tour-operator', 'hop-on-hop-off', 'groups'],
        preferredContactMethod: 'email',
        marketingOptIn: true,
        lifetimeSpend: 620,
        totalOrders: 3,
        visitCount: 10,
        notes: 'Demo tour operator. Makes bookings on behalf of guests using organised Adelaide Hills tour routes.'
    }
];

function internalStaffEmail(username, wineryId) {
    return `${username.toLowerCase().replace(/[^a-z0-9]/g, '')}.w${wineryId}@vinagent.internal`;
}

function readRequiredEnv(name, { minLength = 8 } = {}) {
    const value = process.env[name];
    if (!value || value.trim().length < minLength) {
        throw new Error(`${name} must be set and at least ${minLength} characters long.`);
    }
    return value.trim();
}

async function upsertOne(model, where, values, transaction) {
    const existing = await model.findOne({ where, transaction });
    if (existing) {
        await existing.update(values, { transaction });
        return existing;
    }
    return model.create({ ...where, ...values }, { transaction });
}

async function ensureFirebaseUser({ email, password, displayName }) {
    if (!admin.apps || admin.apps.length === 0) {
        return `seed:${email}`;
    }

    try {
        const existing = await admin.auth().getUserByEmail(email);
        await admin.auth().updateUser(existing.uid, {
            password,
            displayName,
            emailVerified: true,
            disabled: false
        });
        return existing.uid;
    } catch (error) {
        if (error.code !== 'auth/user-not-found') throw error;
        const created = await admin.auth().createUser({
            email,
            password,
            displayName,
            emailVerified: true
        });
        return created.uid;
    }
}

async function seedSidewoodEstate() {
    const transaction = await db.sequelize.transaction();
    const managerPassword = readRequiredEnv('SIDEWOOD_MANAGER_PASSWORD');
    const staffAccessCode = readRequiredEnv('SIDEWOOD_STAFF_ACCESS_CODE');

    try {
        const [winery] = await db.Winery.findOrCreate({
            where: { name: 'Sidewood Estate' },
            defaults: {
                shortName: 'Sidewood',
                keyDescriptors: [SIDEWOOD_KEY, 'demo-seed'],
                region: 'Adelaide Hills',
                contactEmail: null,
                contactPhone: null,
                publicEmail: 'cellardoor@sidewood.com.au',
                publicPhone: '(08) 8388 1157',
                website: 'https://sidewood.com.au',
                addressLine1: '6 River Road',
                suburb: 'Hahndorf',
                state: 'SA',
                postcode: '5245',
                country: 'Australia',
                openingHours: {
                    internalNote: 'VERIFY BEFORE LIVE USE: public sources currently vary between Cellar Door 10am-5pm and 11am-5pm. Use this as an internal warning so staff confirm current hours before responding to customers.'
                },
                timeZone: 'Australia/Adelaide'
            },
            transaction
        });

        await winery.update({
            shortName: 'Sidewood',
            keyDescriptors: [SIDEWOOD_KEY, 'demo-seed'],
            region: 'Adelaide Hills',
            contactEmail: null,
            contactPhone: null,
            publicEmail: 'cellardoor@sidewood.com.au',
            publicPhone: '(08) 8388 1157',
            website: 'https://sidewood.com.au',
            addressLine1: '6 River Road',
            addressLine2: 'Ops phone/email should be confirmed internally before production use. bookings@sidewood.com.au is also publicly listed for restaurant/bookings enquiries.',
            suburb: 'Hahndorf',
            state: 'SA',
            postcode: '5245',
            country: 'Australia',
            openingHours: {
                internalNote: 'VERIFY BEFORE LIVE USE: public sources currently vary between Cellar Door 10am-5pm and 11am-5pm. Use this as an internal warning so staff confirm current hours before responding to customers.'
            },
            timeZone: 'Australia/Adelaide'
        }, { transaction });

        await upsertOne(db.WineryBrandProfile, { wineryId: winery.id }, {
            brandStoryShort: 'Sidewood Estate is a proudly family-owned Adelaide Hills winery founded in 2004 by Owen and Cassandra Inglis. Rooted in cool-climate winemaking, sustainability, family, and place, Sidewood crafts elegant, authentic wines and ciders that reflect the character of the Adelaide Hills.',
            tonePreset: 'premium',
            formalityLevel: 3,
            spellingLocale: 'AU',
            signOffDefault: 'Best enjoyed,\nThe Sidewood Cellar Door Team',
            voiceGuidelines: 'Warm, polished and helpful. Speak with confidence, but avoid sounding stiff or corporate. Keep customer responses clear, welcoming and practical. Highlight the Adelaide Hills, cool-climate wines, family ownership, sustainability, award-winning quality, and relaxed premium hospitality.',
            doSayExamples: [
                'award-winning Adelaide Hills wines and ciders',
                'cool-climate wines',
                'family-owned',
                'estate-grown',
                'certified sustainable',
                'warm and knowledgeable cellar door team',
                'bookings are highly recommended',
                'we would be delighted to help',
                'please contact our cellar door team for larger groups',
                'Sidewood\'s relaxed premium cellar door experience'
            ],
            dontSayExamples: [
                'cheap wine',
                'booze',
                'guaranteed table without a booking',
                'kids can roam unsupervised',
                'pets are welcome everywhere',
                'we can access your full credit card details',
                'no need to book for large groups',
                'discount automatically applies unless confirmed'
            ]
        }, transaction);

        await upsertOne(db.WineryBookingsConfig, { wineryId: winery.id }, {
            walkInsAllowed: true,
            walkInNotes: 'Bookings are highly recommended. Walk-ins may be possible subject to availability, staffing and space. For a polished demo, staff should suggest booking ahead for tastings, restaurant visits and larger groups.',
            groupBookingThreshold: 6,
            leadTimeHours: 24,
            cancellationPolicyText: 'Credit card details may be taken through OpenTable to enforce the no-show and late-cancellation policy. The card is not charged at the time of booking, and Sidewood cannot access full card details because they are securely handled by OpenTable.',
            kidsPolicy: 'Children are welcome in suitable areas. The garden area is family-friendly, with swings and space to run and play. Children and infants should be included in guest booking numbers.',
            petsPolicy: 'Pets are permitted in the Garden Area only and must remain on a leash at all times. Pets are strictly prohibited from the Courtyard, Deck Area and Gallery Restaurant.',
            defaultResponseStrategy: 'create_task'
        }, transaction);

        await upsertOne(db.WinerySettings, { wineryId: winery.id }, {
            tier: 'ADVANCED',
            enableBookingModule: true,
            enableWineClubModule: true,
            enableOrdersModule: true,
            enableSecureLinks: true,
            enableInsights: true,
            enableVoice: false,
            bookingProvider: 'mock',
            crmProvider: 'mock'
        }, transaction);

        await upsertOne(db.WineryIntegrationConfig, { wineryId: winery.id }, {
            smsProvider: 'other',
            smsFromNumber: null,
            emailProvider: 'other',
            emailFromAddress: 'cellardoor@sidewood.com.au',
            channelsEnabled: ['email'],
            kioskModeEnabled: false,
            posProvider: 'other',
            crmProvider: 'other',
            bookingProvider: 'opentable',
            deliveryProvider: 'other',
            providerConnections,
            planTier: 'advanced'
        }, transaction);

        for (const experience of experiences) {
            await upsertOne(db.WineryBookingType, { wineryId: winery.id, name: experience.name }, {
                description: experience.description,
                durationMinutes: experience.durationMinutes || null,
                priceCents: experience.priceCents,
                currency: 'AUD',
                minGuests: experience.minGuests || 1,
                maxGuests: experience.maxGuests || null,
                notesForGuests: experience.notesForGuests || null,
                isActive: experience.isActive
            }, transaction);
        }

        for (const product of products) {
            await upsertOne(db.WineryProduct, { wineryId: winery.id, name: product.name }, {
                ...product,
                isActive: true
            }, transaction);
        }

        for (const [title, body] of sops) {
            await upsertOne(db.WinerySop, { wineryId: winery.id, title }, { body, isActive: true }, transaction);
        }

        for (const [question, answer, tags] of faqs) {
            await upsertOne(db.WineryFAQItem, { wineryId: winery.id, question }, { answer, tags, isActive: true }, transaction);
        }

        for (const contact of contacts) {
            await upsertOne(db.WineryContact, { wineryId: winery.id, email: contact.email }, {
                ...contact,
                phone: null,
                notes: 'VERIFY_INTERNAL',
                isActive: true
            }, transaction);
        }

        for (const customer of customers) {
            const customerType = customer.customerType || (customer.isWineClubMember ? 'member' : 'guest');
            await upsertOne(db.Member, { wineryId: winery.id, email: customer.email }, {
                ...customer,
                customerType,
                country: 'Australia'
            }, transaction);
        }

        await transaction.commit();

        for (const user of users) {
            const email = user.email || internalStaffEmail(user.username, winery.id);
            const password = user.role === 'manager' ? managerPassword : staffAccessCode;
            const firebaseUid = await ensureFirebaseUser({
                email,
                password,
                displayName: user.displayName
            });

            await upsertOne(db.User, { email }, {
                firebaseUid,
                displayName: user.displayName,
                role: user.role,
                responsibilities: user.responsibilities || null,
                isActive: true,
                wineryId: winery.id
            });
        }

        console.log(`Seeded Sidewood Estate demo winery (id=${winery.id}).`);
        console.log(`Seeded Sidewood demo customers: ${customers.filter(customer => (customer.customerType || (customer.isWineClubMember ? 'member' : 'guest')) === 'member').length} members, ${customers.filter(customer => (customer.customerType || (customer.isWineClubMember ? 'member' : 'guest')) === 'guest').length} guests, ${customers.filter(customer => customer.customerType === 'tour_operator').length} tour operators.`);
        console.log('Manager login email: serena@sidewood.com.au. Password was read from SIDEWOOD_MANAGER_PASSWORD and was not printed.');
        console.log('Staff login usernames: Jacob, Nick, James, Joanna. Access code was read from SIDEWOOD_STAFF_ACCESS_CODE and was not printed.');
    } catch (error) {
        await transaction.rollback();
        console.error('Failed to seed Sidewood Estate demo winery:', error);
        process.exitCode = 1;
    } finally {
        await db.sequelize.close();
    }
}

seedSidewoodEstate();
