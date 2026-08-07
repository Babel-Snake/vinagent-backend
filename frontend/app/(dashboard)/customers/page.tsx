'use client';

import { useState, useEffect, useEffectEvent, useRef } from 'react';
import {
    getCustomers,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    searchMembers,
    mergeCustomers,
    getWineryFull,
    updateWinerySettings,
    type Member,
    type MemberInput
} from '../../../lib/api';
import Dialog from '../../../components/ui/Dialog';

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

const STATE_FILTER_OPTIONS = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'];

function formatDate(d?: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

type CustomerForm = Omit<Partial<Member>, 'tags'> & { tags: string };

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'An unexpected error occurred';
}

function formatLocation(customer: Member) {
    const locality = [customer.suburb, customer.state, customer.postcode].filter(Boolean).join(' ');
    return [customer.addressLine1, locality].filter(Boolean).join(', ');
}

function buildCustomerPayload(form: CustomerForm): MemberInput {
    const payload = {
        ...form,
        tags: form.tags ? form.tags.split(',').map(tag => tag.trim()).filter(Boolean) : []
    };
    delete payload.id;
    delete payload.wineryId;
    delete payload.createdAt;
    delete payload.updatedAt;
    delete payload.taskCount;
    delete payload.Tasks;
    return payload;
}

export default function CustomersPage() {
    const [customers, setCustomers] = useState<Member[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [operationError, setOperationError] = useState('');

    // Filters
    const [search, setSearch] = useState('');
    const [customerTypeFilter, setCustomerTypeFilter] = useState('all');
    const [sourceFilter, setSourceFilter] = useState('all');
    const [stateFilter, setStateFilter] = useState('all');
    const [sortBy, setSortBy] = useState('');
    const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);

    // Modals
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState<Member | null>(null);
    const [deletingCustomer, setDeletingCustomer] = useState<Member | null>(null);
    const [mergeTargetCustomer, setMergeTargetCustomer] = useState<Member | null>(null);
    const [mergeSourceCustomer, setMergeSourceCustomer] = useState<Member | null>(null);
    const [mergeQuery, setMergeQuery] = useState('');
    const [mergeCandidates, setMergeCandidates] = useState<Member[]>([]);
    const [mergeOverrides, setMergeOverrides] = useState<Record<string, string>>({});
    const [isMerging, setIsMerging] = useState(false);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [isSavingSettings, setIsSavingSettings] = useState(false);
    const [matchingConfig, setMatchingConfig] = useState({
        autoLinkThreshold: 180,
        reviewThreshold: 120,
        maxReviewCandidates: 3,
        allowPhoneSuffixNameAutoLink: true,
        allowNameOnlyReview: true
    });

    // Action menu
    const [openMenuId, setOpenMenuId] = useState<number | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Form state for create/edit
    const [form, setForm] = useState<CustomerForm>({ tags: '' });
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
            const data = await getCustomers({ q: search, customerType: customerTypeFilter, source: sourceFilter, state: stateFilter, sortBy, page: p, limit: pageSize });
            setCustomers(data.members);
            setTotal(data.total);
            setTotalPages(data.totalPages);
            setPage(data.page);
        } catch (err: unknown) {
            setError(errorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    const loadCustomersFromEffect = useEffectEvent((p: number) => {
        void loadCustomers(p);
    });

    useEffect(() => {
        loadCustomersFromEffect(1);
    }, [customerTypeFilter, sourceFilter, stateFilter, sortBy, pageSize]);

    useEffect(() => {
        getWineryFull()
            .then((winery) => {
                if (winery.settings?.identityMatchingConfig) {
                    setMatchingConfig({
                        autoLinkThreshold: winery.settings.identityMatchingConfig.autoLinkThreshold ?? 180,
                        reviewThreshold: winery.settings.identityMatchingConfig.reviewThreshold ?? 120,
                        maxReviewCandidates: winery.settings.identityMatchingConfig.maxReviewCandidates ?? 3,
                        allowPhoneSuffixNameAutoLink: winery.settings.identityMatchingConfig.allowPhoneSuffixNameAutoLink ?? true,
                        allowNameOnlyReview: winery.settings.identityMatchingConfig.allowNameOnlyReview ?? true
                    });
                }
            })
            .catch(() => undefined);
    }, []);

    useEffect(() => {
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(() => loadCustomersFromEffect(1), 400);
        return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
    }, [search]);

    useEffect(() => {
        if (!mergeTargetCustomer || mergeQuery.trim().length < 2) {
            setMergeCandidates([]);
            return;
        }

        const timeout = setTimeout(async () => {
            try {
                const results = await searchMembers(mergeQuery.trim());
                setMergeCandidates(results.filter((member) => member.id !== mergeTargetCustomer.id));
            } catch {
                setMergeCandidates([]);
            }
        }, 300);

        return () => clearTimeout(timeout);
    }, [mergeQuery, mergeTargetCustomer]);

    const resetForm = () => setForm({
        firstName: '', lastName: '', email: '', phone: '',
        customerType: 'guest', source: 'manual', loyaltyTier: 'none', isWineClubMember: false,
        tags: '', notes: '', preferredContactMethod: 'any', marketingOptIn: false,
        addressLine1: '', suburb: '', state: '', postcode: '',
        dateOfBirth: '', gender: '',
        lifetimeSpend: 0, totalOrders: 0, visitCount: 0
    });

    const handleCreate = () => { resetForm(); setOperationError(''); setShowCreateModal(true); };

    const handleEdit = (c: Member) => {
        setOperationError('');
        setForm({
            ...c,
            customerType: c.customerType || (c.isWineClubMember ? 'member' : 'guest'),
            tags: (c.tags || []).join(', '),
            dateOfBirth: c.dateOfBirth || '',
            lifetimeSpend: c.lifetimeSpend || 0,
            totalOrders: c.totalOrders || 0,
            visitCount: c.visitCount || 0
        });
        setEditingCustomer(c);
        setOpenMenuId(null);
    };

    const handleOpenMerge = (customer: Member) => {
        setOperationError('');
        setMergeTargetCustomer(customer);
        setMergeSourceCustomer(null);
        setMergeQuery(`${customer.firstName || ''} ${customer.lastName || ''}`.trim());
        setMergeOverrides({});
        setOpenMenuId(null);
    };

    const handleSubmitCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setOperationError('');
        setIsSaving(true);
        try {
            const payload = buildCustomerPayload(form);
            if (!payload.dateOfBirth) delete payload.dateOfBirth;
            await createCustomer(payload);
            setShowCreateModal(false);
            loadCustomers(1);
        } catch (err: unknown) { setOperationError(errorMessage(err)); }
        finally { setIsSaving(false); }
    };

    const handleSubmitEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingCustomer) return;
        setOperationError('');
        setIsSaving(true);
        try {
            const payload = buildCustomerPayload(form);
            if (!payload.dateOfBirth) delete payload.dateOfBirth;
            await updateCustomer(editingCustomer.id, payload);
            setEditingCustomer(null);
            loadCustomers();
        } catch (err: unknown) { setOperationError(errorMessage(err)); }
        finally { setIsSaving(false); }
    };

    const handleConfirmDelete = async () => {
        if (!deletingCustomer) return;
        setOperationError('');
        setIsDeleting(true);
        try {
            await deleteCustomer(deletingCustomer.id);
            setDeletingCustomer(null);
            loadCustomers();
        } catch (err: unknown) { setOperationError(errorMessage(err)); }
        finally { setIsDeleting(false); }
    };

    const handleConfirmMerge = async () => {
        if (!mergeTargetCustomer || !mergeSourceCustomer) return;
        setOperationError('');
        setIsMerging(true);
        try {
            await mergeCustomers(mergeTargetCustomer.id, mergeSourceCustomer.id, mergeOverrides);
            setMergeTargetCustomer(null);
            setMergeSourceCustomer(null);
            setMergeQuery('');
            setMergeCandidates([]);
            loadCustomers(1);
        } catch (err: unknown) {
            setOperationError(errorMessage(err));
        } finally {
            setIsMerging(false);
        }
    };

    const handleSaveMatchingSettings = async () => {
        setOperationError('');
        setIsSavingSettings(true);
        try {
            await updateWinerySettings({ identityMatchingConfig: matchingConfig });
            setShowSettingsModal(false);
        } catch (err: unknown) {
            setOperationError(errorMessage(err));
        } finally {
            setIsSavingSettings(false);
        }
    };

    const hasMergeConflict = (field: 'email' | 'phone') => {
        if (!mergeTargetCustomer || !mergeSourceCustomer) return false;
        return Boolean(mergeTargetCustomer[field] && mergeSourceCustomer[field] && mergeTargetCustomer[field] !== mergeSourceCustomer[field]);
    };

    const activeAdvancedFilterCount = [
        customerTypeFilter !== 'all',
        sourceFilter !== 'all',
        stateFilter !== 'all',
        Boolean(sortBy),
        pageSize !== 50
    ].filter(Boolean).length;

    const handleFormCustomerTypeChange = (customerType: string) => {
        setForm({
            ...form,
            customerType,
            isWineClubMember: customerType === 'member'
        });
    };

    const displayCustomerType = (customer: Member) => customer.customerType || (customer.isWineClubMember ? 'member' : 'guest');

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
                        <label className="block text-sm font-medium text-gray-700">Customer Type</label>
                        <select value={form.customerType || 'guest'} onChange={e => handleFormCustomerTypeChange(e.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm text-sm">
                            <option value="guest">Guest</option>
                            <option value="member">Member</option>
                            <option value="tour_operator">Tour Operator</option>
                        </select>
                    </div>
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
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Contact Pref</label>
                        <select value={form.preferredContactMethod || 'any'} onChange={e => setForm({ ...form, preferredContactMethod: e.target.value })} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm text-sm">
                            <option value="any">Any</option>
                            <option value="email">Email</option>
                            <option value="sms">SMS</option>
                            <option value="phone">Phone</option>
                        </select>
                    </div>
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
        <div className="page-shell" onClick={() => setOpenMenuId(null)}>
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">Customers</h1>
                    <p className="page-kicker">{total} customer records with merge, identity, and engagement context.</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3">
                    <button onClick={() => { setOperationError(''); setShowSettingsModal(true); }} className="btn-secondary">
                        Matching Settings
                    </button>
                    <button onClick={handleCreate} className="btn-primary">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m7-7H5" />
                        </svg>
                        Add Customer
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="surface-panel mb-4 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                    <div className="flex-1">
                        <label className="mb-1.5 block text-xs font-bold uppercase text-[var(--muted)]">Search Customers</label>
                        <input
                            type="text"
                            placeholder="Search by name, email, phone, or location..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="form-control"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsAdvancedFiltersOpen(!isAdvancedFiltersOpen)}
                        className={`btn-secondary ${isAdvancedFiltersOpen ? 'border-teal-200 bg-teal-50 text-teal-800' : ''}`}
                    >
                        <svg className={`h-4 w-4 transition-transform ${isAdvancedFiltersOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                        {isAdvancedFiltersOpen ? 'Less Filters' : 'More Filters'}
                        {activeAdvancedFilterCount > 0 && (
                            <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-800">{activeAdvancedFilterCount}</span>
                        )}
                    </button>
                </div>

                {isAdvancedFiltersOpen && (
                    <div className="mt-5 border-t border-[var(--border)] pt-5">
                        <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-5">
                            <div>
                                <label className="mb-1.5 block text-xs font-semibold uppercase text-[var(--muted)]">Customer Type</label>
                                <select value={customerTypeFilter} onChange={e => setCustomerTypeFilter(e.target.value)} className="form-control">
                                    <option value="all">All Customers</option>
                                    <option value="members">Members</option>
                                    <option value="guests">Guests</option>
                                    <option value="tour_operators">Tour Operators</option>
                                </select>
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-semibold uppercase text-[var(--muted)]">Source</label>
                                <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} className="form-control">
                                    <option value="all">All Sources</option>
                                    {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-semibold uppercase text-[var(--muted)]">State</label>
                                <select value={stateFilter} onChange={e => setStateFilter(e.target.value)} className="form-control">
                                    <option value="all">All States</option>
                                    {STATE_FILTER_OPTIONS.map(state => <option key={state} value={state}>{state}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-semibold uppercase text-[var(--muted)]">Sort By</label>
                                <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="form-control">
                                    <option value="">A-Z</option>
                                    <option value="newest">Newest First</option>
                                    <option value="oldest">Oldest First</option>
                                    <option value="lastContact">Last Contact</option>
                                    <option value="highestSpend">Highest Spend</option>
                                    <option value="mostVisits">Most Visits</option>
                                </select>
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-semibold uppercase text-[var(--muted)]">Page Size</label>
                                <select value={pageSize} onChange={e => setPageSize(Number(e.target.value) || 50)} className="form-control">
                                    <option value={25}>25 / page</option>
                                    <option value={50}>50 / page</option>
                                    <option value={100}>100 / page</option>
                                </select>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {error && (
                <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6 rounded-md">
                    <p className="text-sm text-red-700">{error}</p>
                </div>
            )}

            {/* Table */}
            <div className="surface-panel overflow-hidden">
                <div className="divide-y divide-[var(--border)] lg:hidden">
                    {loading ? (
                        <div className="px-4 py-12 text-center text-[var(--muted)]">Loading customers...</div>
                    ) : customers.length === 0 ? (
                        <div className="px-4 py-12 text-center text-[var(--muted)]">No customers found.</div>
                    ) : customers.map(c => (
                        <article key={c.id} className="space-y-4 p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--brand-soft)] text-lg font-bold text-[var(--brand)]">{(c.firstName || '?').charAt(0).toUpperCase()}</div>
                                    <div className="min-w-0">
                                        <h2 className="truncate text-base font-semibold text-[#1c231f]">{c.firstName} {c.lastName}</h2>
                                        <p className="mt-0.5 text-sm text-[var(--muted)]">{displayCustomerType(c) === 'member' ? 'Wine Club member' : displayCustomerType(c) === 'tour_operator' ? 'Tour operator' : 'Guest'}</p>
                                    </div>
                                </div>
                                {c.loyaltyTier && <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${LOYALTY_COLORS[c.loyaltyTier] || LOYALTY_COLORS.none}`}>{LOYALTY_LABELS[c.loyaltyTier] || c.loyaltyTier}</span>}
                            </div>
                            <div className="space-y-1 text-sm">
                                {c.email ? <a href={`mailto:${c.email}`} className="block break-all text-[var(--brand-strong)] hover:underline">{c.email}</a> : <span className="block text-[var(--muted)]">No email recorded</span>}
                                {c.phone ? <a href={`tel:${c.phone}`} className="block text-[var(--brand-strong)] hover:underline">{c.phone}</a> : <span className="block text-[var(--muted)]">No phone recorded</span>}
                            </div>
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-[var(--border)] py-3 text-sm">
                                <div><dt className="text-xs font-semibold uppercase text-[var(--muted)]">Location</dt><dd className="mt-0.5 text-[#344039]">{formatLocation(c) || 'Not recorded'}</dd></div>
                                <div><dt className="text-xs font-semibold uppercase text-[var(--muted)]">Last contact</dt><dd className="mt-0.5 text-[#344039]">{formatDate(c.lastContactAt)}</dd></div>
                                <div><dt className="text-xs font-semibold uppercase text-[var(--muted)]">Spend</dt><dd className="mt-0.5 font-medium text-[#344039]">${Number(c.lifetimeSpend || 0).toLocaleString('en-AU', { maximumFractionDigits: 0 })}</dd></div>
                                <div><dt className="text-xs font-semibold uppercase text-[var(--muted)]">Tasks</dt><dd className="mt-0.5 font-medium text-[#344039]">{c.taskCount || 0}</dd></div>
                            </dl>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => handleEdit(c)} className="btn-secondary">Edit</button>
                                <button type="button" onClick={() => handleOpenMerge(c)} className="btn-secondary text-amber-800">Merge</button>
                                <button type="button" onClick={() => setDeletingCustomer(c)} className="btn-secondary text-red-700">Delete</button>
                            </div>
                        </article>
                    ))}
                </div>

                <div className="hidden overflow-x-auto lg:block">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-[#f8faf6]">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-[var(--muted)]">Customer</th>
                                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-[var(--muted)]">Type</th>
                                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-[var(--muted)]">Email</th>
                                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-[var(--muted)]">Phone</th>
                                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-[var(--muted)]">Location</th>
                                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-[var(--muted)]">Source</th>
                                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-[var(--muted)]">Tier</th>
                                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-[var(--muted)]">Spend</th>
                                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-[var(--muted)]">Visits</th>
                                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-[var(--muted)]">Tasks</th>
                                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-[var(--muted)]">Last Contact</th>
                                <th className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {loading ? (
                                <tr><td colSpan={12} className="px-6 py-12 text-center text-gray-400">Loading...</td></tr>
                            ) : customers.length === 0 ? (
                                <tr><td colSpan={12} className="px-6 py-12 text-center text-gray-500">No customers found.</td></tr>
                            ) : customers.map((c) => (
                                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div className="flex-shrink-0 h-10 w-10">
                                                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--brand-soft)] text-lg font-bold text-[var(--brand)]">
                                                    {(c.firstName || '?').charAt(0).toUpperCase()}
                                                </div>
                                            </div>
                                            <div className="ml-4">
                                                <div className="text-sm font-medium text-gray-900">{c.firstName} {c.lastName}</div>
                                                {displayCustomerType(c) === 'member' && <span className="text-xs font-medium text-[var(--brand)]">Wine Club</span>}
                                                {displayCustomerType(c) === 'tour_operator' && <span className="text-xs font-medium text-amber-700">Tour Operator</span>}
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
                                        {displayCustomerType(c) === 'member' ? (
                                            <span className="inline-flex rounded-md bg-[var(--brand-soft)] px-2 text-xs font-semibold leading-5 text-[var(--brand)]">Member</span>
                                        ) : displayCustomerType(c) === 'tour_operator' ? (
                                            <span className="inline-flex rounded-md bg-amber-100 px-2 text-xs font-semibold leading-5 text-amber-800">Tour Operator</span>
                                        ) : (
                                            <span className="inline-flex rounded-md bg-gray-100 px-2 text-xs font-semibold leading-5 text-gray-600">Guest</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {c.email ? <a href={`mailto:${c.email}`} className="text-blue-600 hover:text-blue-800 hover:underline">{c.email}</a> : <span className="text-gray-400">—</span>}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {c.phone ? <a href={`tel:${c.phone}`} className="text-blue-600 hover:text-blue-800 hover:underline">{c.phone}</a> : <span className="text-gray-400">—</span>}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600 max-w-xs">
                                        {formatLocation(c) || <span className="text-gray-400">-</span>}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-50 text-blue-700">
                                            {c.source ? (SOURCE_LABELS[c.source] || c.source) : '—'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${c.loyaltyTier ? (LOYALTY_COLORS[c.loyaltyTier] || LOYALTY_COLORS.none) : LOYALTY_COLORS.none}`}>
                                            {c.loyaltyTier ? (LOYALTY_LABELS[c.loyaltyTier] || c.loyaltyTier) : 'None'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-medium">
                                        ${Number(c.lifetimeSpend || 0).toLocaleString('en-AU', { minimumFractionDigits: 0 })}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{c.visitCount || 0}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{c.taskCount || 0}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(c.lastContactAt)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium relative">
                                        <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === c.id ? null : c.id); }} className="icon-button text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Open customer actions">
                                            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                                                <path d="M6 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm6 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm6 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" />
                                            </svg>
                                        </button>
                                        {openMenuId === c.id && (
                                            <div ref={menuRef} className="absolute right-8 top-10 mt-2 w-36 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
                                                <div className="py-1">
                                                    <button onClick={(e) => { e.stopPropagation(); handleEdit(c); }} className="w-full text-left block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Edit</button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleOpenMerge(c); }} className="w-full text-left block px-4 py-2 text-sm text-amber-700 hover:bg-amber-50">Merge Into This</button>
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
                            Page {page} of {totalPages} ({total} total, {pageSize} per page)
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
                <Dialog open={showCreateModal} onClose={() => setShowCreateModal(false)} title="Add new customer" showHeader={false} className="max-w-2xl">
                    <div className="p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">Add New Customer</h2>
                            <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                        </div>
                        <form onSubmit={handleSubmitCreate}>
                            {operationError && <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{operationError}</p>}
                            <CustomerFormFields />
                            <div className="flex justify-end gap-3 pt-4 mt-4 border-t">
                                <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-gray-700 hover:bg-gray-50 border rounded-md text-sm font-medium">Cancel</button>
                                <button type="submit" disabled={isSaving} className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-md text-sm font-medium disabled:opacity-50">{isSaving ? 'Adding...' : 'Add Customer'}</button>
                            </div>
                        </form>
                    </div>
                </Dialog>
            )}

            {mergeTargetCustomer && (
                <Dialog open={Boolean(mergeTargetCustomer)} onClose={() => setMergeTargetCustomer(null)} title="Merge customers" showHeader={false} className="max-w-2xl">
                    <div className="p-6">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h2 className="text-xl font-bold">Merge Customers</h2>
                                <p className="text-sm text-gray-500 mt-1">Everything from the source record will be folded into {mergeTargetCustomer.firstName} {mergeTargetCustomer.lastName}.</p>
                            </div>
                            <button onClick={() => setMergeTargetCustomer(null)} className="text-gray-400 hover:text-gray-600">×</button>
                        </div>

                        {operationError && <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{operationError}</p>}
                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 mb-4">
                            <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">Merge Target</div>
                            <div className="font-semibold text-gray-900">{mergeTargetCustomer.firstName} {mergeTargetCustomer.lastName}</div>
                            <div className="text-sm text-gray-600">{mergeTargetCustomer.email || 'No email'} • {mergeTargetCustomer.phone || 'No phone'}</div>
                        </div>

                        <label className="block text-sm font-medium text-gray-700">Find source customer to merge</label>
                        <input
                            type="text"
                            value={mergeQuery}
                            onChange={(e) => setMergeQuery(e.target.value)}
                            placeholder="Search by name, email, or phone..."
                            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm text-sm"
                        />

                        <div className="mt-3 space-y-2 max-h-56 overflow-y-auto">
                            {mergeCandidates.map((candidate) => (
                                <button
                                    key={candidate.id}
                                    type="button"
                                    onClick={() => setMergeSourceCustomer(candidate)}
                                    className={`w-full text-left rounded-lg border p-3 ${mergeSourceCustomer?.id === candidate.id ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:border-gray-300'}`}
                                >
                                    <div className="font-semibold text-gray-900">{candidate.firstName} {candidate.lastName}</div>
                                    <div className="text-sm text-gray-600">{candidate.email || 'No email'} • {candidate.phone || 'No phone'}</div>
                                </button>
                            ))}
                            {mergeQuery.trim().length >= 2 && mergeCandidates.length === 0 && (
                                <div className="text-sm text-gray-500 py-4 text-center">No other customers matched that search.</div>
                            )}
                        </div>

                        {mergeSourceCustomer && (
                            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-4">
                                <div>
                                    <div className="text-xs font-bold uppercase tracking-wide text-amber-700 mb-1">Source Record</div>
                                    <div className="font-semibold text-gray-900">{mergeSourceCustomer.firstName} {mergeSourceCustomer.lastName}</div>
                                    <div className="text-sm text-gray-700">{mergeSourceCustomer.email || 'No email'} • {mergeSourceCustomer.phone || 'No phone'}</div>
                                </div>

                                {(hasMergeConflict('email') || hasMergeConflict('phone')) && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {hasMergeConflict('email') && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">Preferred email</label>
                                                <select
                                                    value={mergeOverrides.email || 'target'}
                                                    onChange={(e) => setMergeOverrides((prev) => ({ ...prev, email: e.target.value }))}
                                                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                                                >
                                                    <option value="target">Keep target email: {mergeTargetCustomer.email}</option>
                                                    <option value="source">Use source email: {mergeSourceCustomer.email}</option>
                                                </select>
                                            </div>
                                        )}
                                        {hasMergeConflict('phone') && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">Preferred phone</label>
                                                <select
                                                    value={mergeOverrides.phone || 'target'}
                                                    onChange={(e) => setMergeOverrides((prev) => ({ ...prev, phone: e.target.value }))}
                                                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                                                >
                                                    <option value="target">Keep target phone: {mergeTargetCustomer.phone}</option>
                                                    <option value="source">Use source phone: {mergeSourceCustomer.phone}</option>
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Notes strategy</label>
                                    <select
                                        value={mergeOverrides.notes || 'combine'}
                                        onChange={(e) => setMergeOverrides((prev) => ({ ...prev, notes: e.target.value }))}
                                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                                    >
                                        <option value="combine">Combine both notes</option>
                                        <option value="target">Keep target notes only</option>
                                        <option value="source">Use source notes only</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end gap-3 pt-4 mt-4 border-t">
                            <button type="button" onClick={() => setMergeTargetCustomer(null)} className="px-4 py-2 text-gray-700 hover:bg-gray-50 border rounded-md text-sm font-medium">Cancel</button>
                            <button type="button" onClick={handleConfirmMerge} disabled={isMerging || !mergeSourceCustomer} className="px-4 py-2 bg-amber-600 text-white hover:bg-amber-700 rounded-md text-sm font-medium disabled:opacity-50">
                                {isMerging ? 'Merging...' : 'Merge Customers'}
                            </button>
                        </div>
                    </div>
                </Dialog>
            )}

            {showSettingsModal && (
                <Dialog open={showSettingsModal} onClose={() => setShowSettingsModal(false)} title="Matching settings" showHeader={false} className="max-w-lg">
                    <div className="p-6">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h2 className="text-xl font-bold">Matching Settings</h2>
                                <p className="text-sm text-gray-500 mt-1">Tune how aggressively the system links inbound contacts to existing customers.</p>
                            </div>
                            <button onClick={() => setShowSettingsModal(false)} className="text-gray-400 hover:text-gray-600">×</button>
                        </div>

                        {operationError && <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{operationError}</p>}
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Auto-link threshold</label>
                                <input type="number" min="100" max="400" value={matchingConfig.autoLinkThreshold} onChange={(e) => setMatchingConfig((prev) => ({ ...prev, autoLinkThreshold: Number(e.target.value) || 180 }))} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                                <p className="mt-1 text-xs text-gray-500">Higher means fewer automatic customer links.</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Review threshold</label>
                                <input type="number" min="0" max="400" value={matchingConfig.reviewThreshold} onChange={(e) => setMatchingConfig((prev) => ({ ...prev, reviewThreshold: Number(e.target.value) || 120 }))} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                                <p className="mt-1 text-xs text-gray-500">Lower means more possible matches are surfaced for human review.</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Max review candidates</label>
                                <input type="number" min="1" max="10" value={matchingConfig.maxReviewCandidates} onChange={(e) => setMatchingConfig((prev) => ({ ...prev, maxReviewCandidates: Number(e.target.value) || 3 }))} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                            </div>
                            <label className="flex items-center space-x-2 text-sm">
                                <input type="checkbox" checked={matchingConfig.allowPhoneSuffixNameAutoLink} onChange={(e) => setMatchingConfig((prev) => ({ ...prev, allowPhoneSuffixNameAutoLink: e.target.checked }))} className="h-4 w-4 text-indigo-600 rounded" />
                                <span>Allow auto-linking on phone suffix + strong name match</span>
                            </label>
                            <label className="flex items-center space-x-2 text-sm">
                                <input type="checkbox" checked={matchingConfig.allowNameOnlyReview} onChange={(e) => setMatchingConfig((prev) => ({ ...prev, allowNameOnlyReview: e.target.checked }))} className="h-4 w-4 text-indigo-600 rounded" />
                                <span>Allow name-only matches to appear in human review lists</span>
                            </label>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 mt-4 border-t">
                            <button type="button" onClick={() => setShowSettingsModal(false)} className="px-4 py-2 text-gray-700 hover:bg-gray-50 border rounded-md text-sm font-medium">Cancel</button>
                            <button type="button" onClick={handleSaveMatchingSettings} disabled={isSavingSettings} className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-md text-sm font-medium disabled:opacity-50">
                                {isSavingSettings ? 'Saving...' : 'Save Settings'}
                            </button>
                        </div>
                    </div>
                </Dialog>
            )}

            {/* Edit Modal */}
            {editingCustomer && (
                <Dialog open={Boolean(editingCustomer)} onClose={() => setEditingCustomer(null)} title="Edit customer" showHeader={false} className="max-w-2xl">
                    <div className="p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">Edit Customer</h2>
                            <button onClick={() => setEditingCustomer(null)} className="text-gray-400 hover:text-gray-600">✕</button>
                        </div>
                        <form onSubmit={handleSubmitEdit}>
                            {operationError && <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{operationError}</p>}
                            <CustomerFormFields />
                            <div className="flex justify-end gap-3 pt-4 mt-4 border-t">
                                <button type="button" onClick={() => setEditingCustomer(null)} className="px-4 py-2 text-gray-700 hover:bg-gray-50 border rounded-md text-sm font-medium">Cancel</button>
                                <button type="submit" disabled={isSaving} className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-md text-sm font-medium disabled:opacity-50">{isSaving ? 'Saving...' : 'Save Changes'}</button>
                            </div>
                        </form>
                    </div>
                </Dialog>
            )}

            {/* Delete Confirmation */}
            {deletingCustomer && (
                <Dialog open={Boolean(deletingCustomer)} onClose={() => setDeletingCustomer(null)} title="Delete customer" showHeader={false} className="max-w-sm">
                    <div className="p-6 text-center">
                        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">Delete {deletingCustomer.firstName} {deletingCustomer.lastName}?</h3>
                        <p className="text-sm text-gray-500 mb-6">This will permanently remove this customer and their data. This action cannot be undone.</p>
                        {operationError && <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-left text-sm text-red-800">{operationError}</p>}
                        <div className="flex justify-center gap-3">
                            <button type="button" onClick={() => setDeletingCustomer(null)} className="px-4 py-2 w-full text-gray-700 hover:bg-gray-50 border rounded-md text-sm font-medium">Cancel</button>
                            <button type="button" onClick={handleConfirmDelete} disabled={isDeleting} className="px-4 py-2 w-full bg-red-600 text-white hover:bg-red-700 rounded-md text-sm font-medium disabled:opacity-50">{isDeleting ? 'Deleting...' : 'Delete'}</button>
                        </div>
                    </div>
                </Dialog>
            )}
        </div>
    );
}
