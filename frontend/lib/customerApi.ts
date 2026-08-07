import { API_BASE, getAuthToken } from './apiCore';
import type { Member, MemberFilters, MemberInput, MemberListResponse } from './peopleTypes';

export async function searchMembers(query: string): Promise<Member[]> {
    const res = await fetch(`${API_BASE}/members/search?q=${encodeURIComponent(query)}`, {
        headers: { 'Authorization': await getAuthToken() }
    });
    if (!res.ok) throw new Error('Failed to search members');
    const data = await res.json();
    return data.members;
}

export async function getCustomers(filters: MemberFilters = {}): Promise<MemberListResponse> {
    const params = new URLSearchParams();
    if (filters.q) params.append('q', filters.q);
    if (filters.source && filters.source !== 'all') params.append('source', filters.source);
    if (filters.state && filters.state !== 'all') params.append('state', filters.state);
    if (filters.loyaltyTier && filters.loyaltyTier !== 'all') params.append('loyaltyTier', filters.loyaltyTier);
    if (filters.customerType && filters.customerType !== 'all') params.append('customerType', filters.customerType);
    if (filters.isWineClubMember) params.append('isWineClubMember', 'true');
    if (filters.sortBy) params.append('sortBy', filters.sortBy);
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());

    const res = await fetch(`${API_BASE}/members?${params.toString()}`, {
        headers: { 'Authorization': await getAuthToken() },
        cache: 'no-store'
    });
    if (!res.ok) throw new Error('Failed to fetch customers');
    return await res.json();
}

export async function getCustomer(id: number): Promise<Member> {
    const res = await fetch(`${API_BASE}/members/${id}`, { headers: { 'Authorization': await getAuthToken() } });
    if (!res.ok) throw new Error('Failed to fetch customer');
    return await res.json();
}

export async function createCustomer(data: MemberInput): Promise<Member> {
    const res = await fetch(`${API_BASE}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': await getAuthToken() },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create customer');
    return await res.json();
}

export async function mergeCustomers(targetId: number, sourceMemberId: number, fieldOverrides?: Record<string, string>): Promise<Member> {
    const res = await fetch(`${API_BASE}/members/${targetId}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': await getAuthToken() },
        body: JSON.stringify({ sourceMemberId, fieldOverrides: fieldOverrides || {} })
    });
    if (!res.ok) throw new Error('Failed to merge customers');
    return await res.json();
}

export async function updateCustomer(id: number, data: MemberInput): Promise<Member> {
    const res = await fetch(`${API_BASE}/members/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': await getAuthToken() },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update customer');
    return await res.json();
}

export async function deleteCustomer(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/members/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': await getAuthToken() }
    });
    if (!res.ok) throw new Error('Failed to delete customer');
}
