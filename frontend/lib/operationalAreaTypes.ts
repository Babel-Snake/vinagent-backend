export type AreaScope = 'ORGANISATION' | 'AREAS';

export interface AreaMembership {
    id?: number;
    userId?: number;
    areaId: number;
    membershipRole: 'MEMBER' | 'MANAGER';
    isPrimary: boolean;
    Area?: Pick<OperationalArea, 'id' | 'name' | 'isActive'>;
}

export interface OperationalArea {
    id: number;
    wineryId: number;
    name: string;
    description?: string | null;
    isActive: boolean;
    sortOrder: number;
    myMembership?: AreaMembership | null;
    Memberships?: AreaMembership[];
    createdAt?: string;
    updatedAt?: string;
}
