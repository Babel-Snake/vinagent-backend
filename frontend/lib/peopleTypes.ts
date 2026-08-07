import type { AreaMembership, Task } from './api';

export interface Staff {
    id: number;
    displayName: string;
    email: string;
    createdAt: string;
    role?: string;
    isActive?: boolean;
    responsibilities?: string;
    areaMemberships?: AreaMembership[];
    areaIds?: number[];
    managedAreaIds?: number[];
    pinEnabled?: boolean;
    pinUpdatedAt?: string | null;
    pinLockedUntil?: string | null;
    pinLastLoginAt?: string | null;
}

export interface UserProfile extends Staff {
    wineryId: number;
    role: string;
    wineryName?: string;
    canAccessWineryConfig?: boolean;
    isPinSession?: boolean;
    authMode?: 'firebase' | 'pin' | 'pin_basic' | string;
}

export interface AuthDisplayUser {
    uid: string;
    email: string | null;
    displayName: string | null;
    isPinSession?: boolean;
}

export interface ProfileResponse {
    user: UserProfile;
}

export interface Member {
    id: number;
    wineryId: number;
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
    customerType?: string | null;
    source?: string | null;
    loyaltyTier?: string | null;
    isWineClubMember?: boolean;
    tags?: string[];
    notes?: string | null;
    preferredContactMethod?: string | null;
    marketingOptIn?: boolean;
    addressLine1?: string | null;
    addressLine2?: string | null;
    suburb?: string | null;
    state?: string | null;
    postcode?: string | null;
    country?: string | null;
    dateOfBirth?: string | null;
    gender?: string | null;
    lifetimeSpend?: number | string;
    totalOrders?: number;
    visitCount?: number;
    taskCount?: number;
    lastContactAt?: string | null;
    createdAt?: string;
    updatedAt?: string;
    Tasks?: Task[];
}

export type MemberInput = Omit<Partial<Member>, 'id' | 'wineryId' | 'createdAt' | 'updatedAt' | 'taskCount' | 'Tasks'>;

export interface MemberFilters {
    q?: string;
    source?: string;
    state?: string;
    loyaltyTier?: string;
    customerType?: string;
    isWineClubMember?: boolean;
    sortBy?: string;
    page?: number;
    limit?: number;
}

export interface MemberListResponse {
    members: Member[];
    total: number;
    page: number;
    totalPages: number;
}
