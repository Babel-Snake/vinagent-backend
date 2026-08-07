export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface Pagination {
    page: number;
    pageSize?: number;
    limit?: number;
    total: number;
    totalPages: number;
}

export type AttachmentEntityType = 'TASK' | 'TASK_STEP' | 'TASK_OUTCOME' | 'TASK_FOLLOW_UP' | 'NOTICE' | 'REQUEST' | 'NOTE' | 'PROJECT';

export interface Attachment {
    id: number;
    entityType: AttachmentEntityType;
    entityId: number;
    wineryId: number;
    filename: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    uploadedBy?: number | null;
    createdAt: string;
    updatedAt: string;
    downloadUrl: string;
    Uploader?: {
        id: number;
        displayName?: string | null;
        email?: string | null;
        role?: string;
    } | null;
}

export interface Notification {
    id: number;
    userId: number;
    type: string;
    message: string;
    isRead: boolean;
    data: JsonObject;
    createdAt: string;
}
