import type { OperationalArea } from './api';

export interface WineryContact {
    id: number;
    wineryId: number;
    name: string;
    role: string;
    email?: string;
    phone?: string;
    layer?: string;
    notes?: string;
    reportsToId?: number;
    responsibilities?: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    OperationalAreas?: Array<OperationalArea & {
        WineryContactArea?: { relationshipType: 'PRIMARY' | 'LINKED' };
    }>;
    primaryAreaId?: number | null;
    linkedAreaIds?: number[];
}

export interface OperationalAreaProfile {
    id?: number;
    wineryId?: number;
    areaId: number;
    publicEmail?: string | null;
    publicPhone?: string | null;
    openingHoursText?: string | null;
    guestDirections?: string | null;
    serviceNotes?: string | null;
}

export interface AreaBookingsConfig {
    id?: number;
    wineryId?: number;
    areaId: number;
    walkInsAllowed?: boolean;
    walkInNotes?: string | null;
    groupBookingThreshold?: number;
    leadTimeHours?: number;
    cancellationPolicyText?: string | null;
    kidsPolicy?: string | null;
    petsPolicy?: string | null;
    defaultResponseStrategy?: 'confirm' | 'create_task';
}

export interface AreaBookingType {
    id: number;
    wineryId: number;
    areaId?: number | null;
    name: string;
    description?: string | null;
    priceCents?: number;
}

export interface AreaProductListing {
    id?: number;
    wineryId?: number;
    areaId: number;
    productId: number;
    isAvailable: boolean;
    priceOverride?: number | string | null;
    stockStatusOverride?: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | null;
    isFeatured: boolean;
    salesNotes?: string | null;
}

export interface WineryProduct {
    id: number;
    wineryId?: number;
    name: string;
    category?: string;
    vintage?: string | null;
    price?: number | string;
    stockStatus?: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | string;
    tastingNotes?: string | null;
    keySellingPoints?: string[];
    pairingSuggestions?: string | null;
    awards?: string | null;
    isActive?: boolean;
}

export type WineryProductInput = Omit<Partial<WineryProduct>, 'id' | 'wineryId'> & { name: string };

export interface WineryFAQ {
    id: number;
    wineryId?: number;
    areaId?: number | null;
    question: string;
    answer: string;
    tags?: string[];
}

export type WineryFAQInput = Omit<Partial<WineryFAQ>, 'id' | 'wineryId'> & { question: string; answer: string };

export interface WinerySop {
    id: number;
    wineryId?: number;
    areaId?: number | null;
    title: string;
    body: string;
}

export type WinerySopInput = Omit<Partial<WinerySop>, 'id' | 'wineryId'> & { title: string; body: string };

export interface WineryOperationalArea extends OperationalArea {
    Profile?: OperationalAreaProfile | null;
    BookingsConfig?: AreaBookingsConfig | null;
    BookingTypes?: AreaBookingType[];
    ProductListings?: AreaProductListing[];
    IntegrationConfig?: OperationalAreaIntegrationConfig | null;
}

export interface Winery {
    id: number;
    name: string;
    slug: string;
    description?: string;
    website?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    logoUrl?: string;
    bannerUrl?: string;
    shortName?: string;
    region?: string;
    contactEmail?: string;
    contactPhone?: string;
    publicEmail?: string;
    publicPhone?: string;
    timeZone?: string;
    addressLine1?: string;
    addressLine2?: string;
    suburb?: string;
    postcode?: string;
    brandVoice?: string;
    toneOfVoice?: string;
    formalityLevel?: number;
    keyMessages?: string[];
    wordsToUse?: string[];
    wordsToAvoid?: string[];
    brandStoryShort?: string;
    bookingsConfig?: Partial<AreaBookingsConfig>;
    brandProfile?: WineryBrandProfile;
    createdAt: string;
    updatedAt: string;
    policyProfile?: WineryPolicyProfile;
    integrationConfig?: WineryIntegrationConfig;
    settings?: WinerySettings;
    contacts?: WineryContact[];
    OperationalAreas?: WineryOperationalArea[];
    products?: WineryProduct[];
    faqs?: WineryFAQ[];
    sops?: WinerySop[];
    bookingTypes?: AreaBookingType[];
    configurationAccess?: {
        isGlobalManager: boolean;
        canRead: boolean;
        areaIds: number[];
        managedAreaIds: number[];
    };
}

export interface WineryBrandProfile {
    brandStoryShort?: string;
    tonePreset?: string;
    voiceGuidelines?: string;
    signOffDefault?: string;
    spellingLocale?: string;
    formalityLevel?: number;
    doSayExamples?: string[];
    dontSayExamples?: string[];
}

export interface WinerySettings {
    id?: number;
    wineryId?: number;
    identityMatchingConfig?: {
        autoLinkThreshold: number;
        reviewThreshold: number;
        maxReviewCandidates: number;
        allowPhoneSuffixNameAutoLink: boolean;
        allowNameOnlyReview: boolean;
    };
    authConfig?: {
        pinLoginEnabled: boolean;
        allowManagerBasicPin: boolean;
        pinIdleTimeoutSeconds: number;
        pinSessionHours: number;
        pinMaxAttempts: number;
        pinLockoutMinutes: number;
    };
}

export interface WineryPolicyProfile {
    id: number;
    wineryId: number;
    cancellationPolicy?: string;
    refundPolicy?: string;
    privacyPolicy?: string;
    termsOfService?: string;
    updatedAt: string;
}

export interface WineryIntegrationConfig {
    id: number;
    wineryId: number;
    smsProvider?: string;
    smsFromNumber?: string;
    emailProvider?: string;
    emailFromAddress?: string;
    channelsEnabled?: string[];
    kioskModeEnabled?: boolean;
    posProvider?: string;
    crmProvider?: string;
    bookingProvider?: string;
    deliveryProvider?: string;
    providerConnections?: Record<string, IntegrationConnection>;
    updatedAt: string;
}

export interface OperationalAreaIntegrationConfig {
    id?: number;
    wineryId?: number;
    areaId: number;
    providerConnections: Partial<Record<AreaIntegrationDomain, IntegrationConnection>>;
    updatedAt?: string;
}

export type AreaIntegrationDomain = 'pos' | 'crm' | 'booking' | 'delivery';

export interface IntegrationConnection {
    provider?: string | null;
    executionProvider?: string | null;
    liveAdapterAvailable?: boolean;
    status?: 'not_connected' | 'connected' | 'error' | 'needs_reauth';
    authMethod?: 'none' | 'api_key' | 'oauth' | 'webhook' | 'manual';
    externalAccountId?: string | null;
    externalLocationId?: string | null;
    baseUrl?: string | null;
    webhookUrl?: string | null;
    webhookSigningConfigured?: boolean;
    webhookSecret?: string | null;
    clearWebhookSecret?: boolean;
    webhookSecretLastRotatedAt?: string | null;
    capabilities?: string[];
    lastTestedAt?: string | null;
    lastError?: string | null;
    notes?: string | null;
    summary?: string;
}

export interface EmailSyncResult {
    provider: string;
    mailboxAddress: string;
    folderId: string;
    fetched: number;
    imported: number;
    duplicates: number;
    createdTasks: number;
    syncedAt: string;
    lastMessageReceivedAt?: string | null;
}
