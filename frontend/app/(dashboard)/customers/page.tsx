'use client';

import { useState, useEffect, useRef } from 'react';
import { getCustomers, createCustomer, updateCustomer, deleteCustomer } from '../../../lib/api';

const SOURCE_LABELS: Record<string, string> = {
    manual: 'Manual', sms: 'SMS', email: 'Email', booking: 'Booking',
    wine_club: 'Wine Club', pos: 'POS', import: 'Import', website: 'Website',
    referral: 'Referral', walk_in: 'Walk-in'
};

const LOYALTY_LABELS: Record<string, string> = {
    none: 'None', bronze: 'Bronze', silver: 'Silver', gold: 'Gold', platinum: 'Platinum'
};

const LOYALTY_COLORS: Record<string, string> = {
    none: 'bg-gray-100 text-gray-600',
    bronze: 'bg-amber-100 text-amber-800',
    silver: 'bg-gray-200 text-gray-700',
    gold: 'bg-yellow-100 text-yellow-800',
    platinum: 'bg-indigo-100 text-indigo-800'
};

function formatDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function CustomersPage() {
    const [customers, setCustomers] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Filters
    const [search, setSearch] = useState('');
    const [sourceFilter, setSourceFilter] = useState('all');
    const [sortBy, setSortBy] = useState('');

    // Modals
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState<any>(null);
    const [deletingCustomer, setDeletingCustomer] = useState<any>(null);

    // Action menu
    const [openMenuId, setOpenMenuId] = useState<number | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Form state for create/edit
    const [form, setForm] = useState<any>({});
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Debounced search
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpenMenuId(null);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const loadCustomers = async (p = page) => {
        setLoading(true);
        try {
            const data = await getCustomers({ q: search, source: sourceFilter, sortBy, page: p });
            setCustomers(data.members);
            setTotal(data.total);
            setTotalPages(data.totalPages);
            setPage(data.page);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadCustomers(1);
    }, [sourceFilter, sortBy]);

    useEffect(() => {
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(() => loadCustomers(1), 400);
        return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
    }, [search]);

    const resetForm = () => setForm({
        firstName: '', lastName: '', email: '', phone: '',
        source: 'manual', loyaltyTier: 'none', isWineClubMember: false,
        tags: '', notes: '', preferredContactMethod: 'any', marketingOptIn: false,
        addressLine1: '', suburb: '', state: '', postcode: '',
        dateOfBirth: '', gender: '',
        lifetimeSpend: 0, totalOrders: 0, visitCount: 0
    });

    const handleCreate = () => { resetForm(); setShowCreateModal(true); };

    const handleEdit = (c: any) => {
        setForm({
            ...c,
            tags: (c.tags || []).join(', '),
            dateOfBirth: c.dateOfBirth || '',
            lifetimeSpend: c.lifetimeSpend || 0,
            totalOrders: c.totalOrders || 0,
            visitCount: c.visitCount || 0
        });
        setEditingCustomer(c);
        setOpenMenuId(null);
    };

    const handleSubmitCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const payload = { ...form, tags: form.tags ? form.tags.split(',').map((s: string) => s.trim()).filter(Boolean) : [] };
            if (!payload.dateOfBirth) delete payload.dateOfBirth;
            await createCustomer(payload);
            setShowCreateModal(false);
            loadCustomers(1);
        } catch (err: any) { alert(err.message); }
        finally { setIsSaving(false); }
    };

    const handleSubmitEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingCustomer) return;
        setIsSaving(true);
        try {
            const payload = { ...form, tags: form.tags ? form.tags.split(',').map((s: string) => s.trim()).filter(Boolean) : [] };
            if (!payload.dateOfBirth) delete payload.dateOfBirth;
            delete payload.id; delete payload.wineryId; delete payload.createdAt; delete payload.updatedAt; delete payload.taskCount; delete payload.Tasks;
            await updateCustomer(editingCustomer.id, payload);
            setEditingCustomer(null);
            loadCustomers();
        } catch (err: any) { alert(err.message); }
        finally { setIsSaving(false); }
    };

    const handleConfirmDelete = async () => {
        if (!deletingCustomer) return;
        setIsDeleting(true);
        try {
            await deleteCustomer(deletingCustomer.id);
            setDeletingCustomer(null);
            loadCustomers();
        } catch (err: any) { alert(err.message); }
        finally { setIsDeleting(false); }
    };

    const CustomerFormFields = () => (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">First Name *</label>
                    <input type="text" required value={form.firstName || ''} onChange={e => setForm({ ...form, firstName: e.target.value })} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm text-sm" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Last Name *</label>
                    <input type="text" required value={form.lastName || ''} onChange={e => setForm({ ...form, lastName: e.target.value })} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm text-sm" />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Email</label>
                    <input type="email" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm text-sm" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Phone</label>
                    <input type="text" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm text-sm" />
                </div>
            </div>

            <div className="border-t pt-4">
                <h4 className="text-sm font-medium text-gray-900 mb-2">Address</h4>
                <div className="grid grid-cols-1 gap-2">
                    <input type="text" placeholder="Street Address" value={form.addressLine1 || ''} onChange={e => setForm({ ...form, addressLine1: e.target.value })} className="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm text-sm" />
                    <div className="grid grid-cols-3 gap-2">
                        <input type="text" placeholder="Suburb" value={form.suburb || ''} onChange={e => setForm({ ...form, suburb: e.target.value })} className="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm text-sm" />
                        <input type="text" placeholder="State" value={form.state || ''} onChange={e => setForm({ ...form, state: e.target.value })} className="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm text-sm" />
                        <input type="text" placeholder="Postcode" value={form.postcode || ''} onChange={e => setForm({ ...form, postcode: e.target.value })} className="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm text-sm" />
                    </div>
                </div>
            </div>

            <div className="border-t pt-4">
                <h4 className="text-sm font-medium text-gray-900 mb-2">Demographics</h4>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Date of Birth</label>
                        <input type="date" value={form.dateOfBirth || ''} onChange={e => setForm({ ...form, dateOfBirth: e.target.value })} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm text-sm" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Gender</label>
                        <input type="text" value={form.gender || ''} onChange={e => setForm({ ...form, gender: e.target.value })} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm text-sm" placeholder="e.g. Male, Female, Other" />
                    </div>
                </div>
            </div>

            <div className="border-t pt-4">
                <h4 className="text-sm font-medium text-gray-900 mb-2">Segmentation & Loyalty</h4>
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Source</label>
                        <select value={form.source || 'manual'} onChange={e => setForm({ ...form, source: e.target.value })} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm text-sm">
                            {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Loyalty Tier</label>
                        <select value={form.loyaltyTier || 'none'} onChange={e => setForm({ ...form, loyaltyTier: e.target.value })} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm text-sm">
                            {Object.entries(LOYALTY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Contact Pref</label>
                        <select value={form.preferredContactMethod || 'any'} onChange={e => setForm({ ...form, preferredContactMethod: e.target.value })} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm text-sm">
                            <option value="any">Any</option>
                            <option value="email">Email</option>
                            <option value="sms">SMS</option>
                            <option value="phone">Phone</option>
                        </select>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                    <label className="flex items-center space-x-2 text-sm">
                        <input type="checkbox" checked={form.isWineClubMember || false} onChange={e => setForm({ ...form, isWineClubMember: e.target.checked })} className="h-4 w-4 text-indigo-600 rounded" />
                        <span>Wine Club Member</span>
                    </label>
                    <label className="flex items-center space-x-2 text-sm">
                        <input type="checkbox" checked={form.marketingOptIn || false} onChange={e => setForm({ ...form, marketingOptIn: e.target.checked })} className="h-4 w-4 text-indigo-600 rounded" />
                        <span>Marketing Opt-In</span>
                    </label>
                </div>
            </div>

            <div className="border-t pt-4">
                <h4 className="text-sm font-medium text-gray-900 mb-2">Engagement Metrics</h4>
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Lifetime Spend ($)</label>
                        <input type="number" step="0.01" min="0" value={form.lifetimeSpend || 0} onChange={e => setForm({ ...form, lifetimeSpend: parseFloat(e.target.value) || 0 })} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm text-sm" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Total Orders</label>
                        <input type="number" min="0" value={form.totalOrders || 0} onChange={e => setForm({ ...form, totalOrders: parseInt(e.target.value) || 0 })} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm text-sm" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Visit Count</label>
                        <input type="number" min="0" value={form.visitCount || 0} onChange={e => setForm({ ...form, visitCount: parseInt(e.target.value) || 0 })} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm text-sm" />
                    </div>
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700">Tags</label>
                <input type="text" value={form.tags || ''} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="VIP, trade, local (comma separated)" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm text-sm" />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700">Notes</label>
                <textarea rows={2} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm text-sm" />
            </div>
        </div>
    );

    return (
        <div className="px-4 py-6 sm:px-0" onClick={() => setOpenMenuId(null)}>
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
                    <p className="text-sm text-gray-500 mt-1">{total} total customers</p>
                </div>
                <button onClick={handleCreate} className="px-4 py-2 bg-indigo-600 text-white rounded shadow hover:bg-indigo-700 text-sm font-medium flex items-center gap-2">
                    <span>+</span> Add Customer
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
                <input
                    type="text"
                    placeholder="Search by name, email, phone..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="flex-1 min-w-[200px] rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
                />
                <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm">
                    <option value="all">All Sources</option>
                    {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm">
                    <option value="">Sort: A-Z</option>
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                    <option value="lastContact">Last Contact</option>
                    <option value="highestSpend">Highest Spend</option>
                    <option value="mostVisits">Most Visits</option>
                </select>
            </div>

            {error && (
                <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6 rounded-md">
                    <p className="text-sm text-red-700">{error}</p>
                </div>
            )}

            {/* Table */}
            <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tier</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Spend</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Visits</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tasks</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Contact</th>
                                <th className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {loading ? (
                                <tr><td colSpan={11} className="px-6 py-12 text-center text-gray-400">Loading...</td></tr>
                            ) : customers.length === 0 ? (
                                <tr><td colSpan={11} className="px-6 py-12 text-center text-gray-500">No customers found.</td></tr>
                            ) : customers.map((c) => (
                                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div className="flex-shrink-0 h-10 w-10">
                                                <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-lg">
                                                    {(c.firstName || '?').charAt(0).toUpperCase()}
                                                </div>
                                            </div>
                                            <div className="ml-4">
                                                <div className="text-sm font-medium text-gray-900">{c.firstName} {c.lastName}</div>
                                                {c.isWineClubMember && <span className="text-xs text-purple-600 font-medium">🍷 Wine Club</span>}
                                                {(c.tags || []).length > 0 && (
                                                    <div className="flex gap-1 mt-0.5">
                                                        {(c.tags || []).slice(0, 3).map((t: string) => (
                                                            <span key={t} className="inline-flex text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{t}</span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {c.isWineClubMember ? (
                                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-purple-100 text-purple-800">🍷 Member</span>
                                        ) : (
                                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-600">Casual</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {c.email ? <a href={`mailto:${c.email}`} className="text-blue-600 hover:text-blue-800 hover:underline">{c.email}</a> : <span className="text-gray-400">—</span>}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {c.phone ? <a href={`tel:${c.phone}`} className="text-blue-600 hover:text-blue-800 hover:underline">{c.phone}</a> : <span className="text-gray-400">—</span>}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-50 text-blue-700">
                                            {SOURCE_LABELS[c.source] || c.source || '—'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${LOYALTY_COLORS[c.loyaltyTier] || LOYALTY_COLORS.none}`}>
                                            {LOYALTY_LABELS[c.loyaltyTier] || 'None'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-medium">
                                        ${parseFloat(c.lifetimeSpend || 0).toLocaleString('en-AU', { minimumFractionDigits: 0 })}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{c.visitCount || 0}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{c.taskCount || 0}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(c.lastContactAt)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium relative">
                                        <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === c.id ? null : c.id); }} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100">•••</button>
                                        {openMenuId === c.id && (
                                            <div ref={menuRef} className="absolute right-8 top-10 mt-2 w-36 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
                                                <div className="py-1">
                                                    <button onClick={(e) => { e.stopPropagation(); handleEdit(c); }} className="w-full text-left block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Edit</button>
                                                    <button onClick={(e) => { e.stopPropagation(); setDeletingCustomer(c); setOpenMenuId(null); }} className="w-full text-left block px-4 py-2 text-sm text-red-700 hover:bg-red-50">Delete</button>
                                                </div>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                        <div className="text-sm text-gray-700">
                            Page {page} of {totalPages} ({total} total)
                        </div>
                        <div className="flex gap-2">
                            <button disabled={page <= 1} onClick={() => loadCustomers(page - 1)} className="px-3 py-1 border rounded text-sm disabled:opacity-50">Prev</button>
                            <button disabled={page >= totalPages} onClick={() => loadCustomers(page + 1)} className="px-3 py-1 border rounded text-sm disabled:opacity-50">Next</button>
                        </div>
                    </div>
                )}
            </div>

            {/* Create Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">Add New Customer</h2>
                            <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                        </div>
                        <form onSubmit={handleSubmitCreate}>
                            <CustomerFormFields />
                            <div className="flex justify-end gap-3 pt-4 mt-4 border-t">
                                <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-gray-700 hover:bg-gray-50 border rounded-md text-sm font-medium">Cancel</button>
                                <button type="submit" disabled={isSaving} className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-md text-sm font-medium disabled:opacity-50">{isSaving ? 'Adding...' : 'Add Customer'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editingCustomer && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">Edit Customer</h2>
                            <button onClick={() => setEditingCustomer(null)} className="text-gray-400 hover:text-gray-600">✕</button>
                        </div>
                        <form onSubmit={handleSubmitEdit}>
                            <CustomerFormFields />
                            <div className="flex justify-end gap-3 pt-4 mt-4 border-t">
                                <button type="button" onClick={() => setEditingCustomer(null)} className="px-4 py-2 text-gray-700 hover:bg-gray-50 border rounded-md text-sm font-medium">Cancel</button>
                                <button type="submit" disabled={isSaving} className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-md text-sm font-medium disabled:opacity-50">{isSaving ? 'Saving...' : 'Save Changes'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {deletingCustomer && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg max-w-sm w-full p-6 text-center">
                        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">Delete {deletingCustomer.firstName} {deletingCustomer.lastName}?</h3>
                        <p className="text-sm text-gray-500 mb-6">This will permanently remove this customer and their data. This action cannot be undone.</p>
                        <div className="flex justify-center gap-3">
                            <button type="button" onClick={() => setDeletingCustomer(null)} className="px-4 py-2 w-full text-gray-700 hover:bg-gray-50 border rounded-md text-sm font-medium">Cancel</button>
                            <button type="button" onClick={handleConfirmDelete} disabled={isDeleting} className="px-4 py-2 w-full bg-red-600 text-white hover:bg-red-700 rounded-md text-sm font-medium disabled:opacity-50">{isDeleting ? 'Deleting...' : 'Delete'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
