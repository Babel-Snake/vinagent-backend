import { API_BASE, getAuthToken } from './apiCore';
import type {
    AreaBookingType,
    WineryContact,
    WineryFAQInput,
    WineryProductInput,
    WinerySopInput
} from './wineryTypes';

async function resourceRequest(path: string, method: 'POST' | 'PUT' | 'DELETE', data?: unknown): Promise<unknown> {
    const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
            ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
            'Authorization': await getAuthToken()
        },
        ...(data === undefined ? {} : { body: JSON.stringify(data) })
    });
    if (!res.ok) throw new Error(`Failed to ${method === 'POST' ? 'create' : method === 'PUT' ? 'update' : 'delete'} resource`);
    if (res.status === 204) return undefined;
    return await res.json();
}

export const createProduct = (data: WineryProductInput) => resourceRequest('/winery/products', 'POST', data);
export const updateProduct = (id: number, data: WineryProductInput) => resourceRequest(`/winery/products/${id}`, 'PUT', data);
export const deleteProduct = (id: number) => resourceRequest(`/winery/products/${id}`, 'DELETE');

export const createBookingType = (data: Omit<Partial<AreaBookingType>, 'id' | 'wineryId'> & { name: string }) =>
    resourceRequest('/winery/bookings/types', 'POST', data);
export const updateBookingType = (id: number, data: Partial<AreaBookingType>) =>
    resourceRequest(`/winery/bookings/types/${id}`, 'PUT', data);
export const deleteBookingType = (id: number) => resourceRequest(`/winery/bookings/types/${id}`, 'DELETE');

export const createFAQ = (data: WineryFAQInput) => resourceRequest('/winery/faqs', 'POST', data);
export const updateFAQ = (id: number, data: Partial<WineryFAQInput>) => resourceRequest(`/winery/faqs/${id}`, 'PUT', data);
export const deleteFAQ = (id: number) => resourceRequest(`/winery/faqs/${id}`, 'DELETE');

export const createSOP = (data: WinerySopInput) => resourceRequest('/winery/sops', 'POST', data);
export const updateSOP = (id: number, data: Partial<WinerySopInput>) => resourceRequest(`/winery/sops/${id}`, 'PUT', data);
export const deleteSOP = (id: number) => resourceRequest(`/winery/sops/${id}`, 'DELETE');

export async function createWineryContact(data: Partial<WineryContact>): Promise<WineryContact> {
    const response = await resourceRequest('/winery/contacts', 'POST', data) as { data: WineryContact };
    return response.data;
}

export async function updateWineryContact(id: number, data: Partial<WineryContact>): Promise<WineryContact> {
    const response = await resourceRequest(`/winery/contacts/${id}`, 'PUT', data) as { data: WineryContact };
    return response.data;
}

export async function deleteWineryContact(id: number): Promise<void> {
    await resourceRequest(`/winery/contacts/${id}`, 'DELETE');
}
