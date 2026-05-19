import { useState } from 'react';
import { Task, Staff } from '../lib/api';

interface TaskFiltersProps {
    filters: {
        category: string;
        priority: string;
        assigneeId: string;
        createdById: string;
        status: string;
        sentiment: string;
        search: string;
        showOnlyFlagged?: boolean;
        mentionedMe?: boolean;
        deadlineState?: string;
        actionedById?: string;
        sortBy?: string;
        dateRangeType?: string;
        dateFrom?: string;
        dateTo?: string;
    };
    onFilterChange: (newFilters: any) => void;
    tasks: Task[];
    users: Staff[];
    currentUserId?: number | null;
}

export default function TaskFilters({ filters, onFilterChange, tasks, users, currentUserId }: TaskFiltersProps) {
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

    // Extract Unique Creators
    const uniqueCreators = Array.from(new Set(tasks.map(t => t.Creator ? JSON.stringify(t.Creator) : '').filter(Boolean)))
        .map(s => JSON.parse(s));

    // Extract Unique Categories
    const uniqueCategories = Array.from(new Set(tasks.map(t => t.category).filter(Boolean))).sort();

    const handleChange = (field: string, value: any) => {
        onFilterChange({ ...filters, [field]: value });
    };

    return (
        <div className="surface-panel mb-5 p-4">
            {/* Top Row: Essential Filters */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
                {/* Search */}
                <div className="flex-1 w-full">
                    <label className="mb-1.5 block text-xs font-bold uppercase text-[var(--muted)]">Search Tasks</label>
                    <input
                        type="text"
                        className="form-control"
                        value={filters.search}
                        onChange={(e) => handleChange('search', e.target.value)}
                        placeholder="Search by name, phone, email, or content..."
                    />
                </div>

                {/* Status Filter */}
                <div className="w-full md:w-64">
                    <label className="mb-1.5 block text-xs font-bold uppercase text-[var(--muted)]">Status</label>
                    <select
                        className="form-control font-medium"
                        value={filters.status}
                        onChange={(e) => handleChange('status', e.target.value)}
                    >
                        <option value="all">All Statuses</option>
                        <option value="PENDING">Pending</option>
                        <option value="ACTIONED">Actioned</option>
                        <option value="REJECTED">Rejected</option>
                    </select>
                </div>

                {/* Always-visible toggles */}
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => handleChange('mentionedMe', !filters.mentionedMe)}
                        className={`btn-secondary ${filters.mentionedMe ? 'border-violet-200 bg-violet-50 text-violet-700' : ''}`}
                    >
                        <span className={filters.mentionedMe ? 'text-purple-500' : 'text-gray-400'}>@</span>
                        Mentions
                    </button>

                    <button
                        type="button"
                        onClick={() => handleChange('showOnlyFlagged', !filters.showOnlyFlagged)}
                        className={`btn-secondary ${filters.showOnlyFlagged ? 'border-amber-200 bg-amber-50 text-amber-700' : ''}`}
                    >
                        <span className={filters.showOnlyFlagged ? 'text-yellow-500' : 'text-gray-400'}>★</span>
                        Flagged
                    </button>
                    
                    <button
                        type="button"
                        onClick={() => handleChange('deadlineState', filters.deadlineState === 'OVERDUE' ? 'all' : 'OVERDUE')}
                        className={`btn-secondary ${filters.deadlineState === 'OVERDUE' ? 'border-red-200 bg-red-50 text-red-700' : ''}`}
                    >
                        <span className={filters.deadlineState === 'OVERDUE' ? 'text-red-500' : 'text-gray-400'}>!</span>
                        Overdue
                    </button>

                    <button
                        type="button"
                        onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                        className={`btn-secondary ${isAdvancedOpen ? 'border-teal-200 bg-teal-50 text-teal-800' : ''}`}
                    >
                        <svg className={`w-4 h-4 transition-transform ${isAdvancedOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                        {isAdvancedOpen ? 'Less Filters' : 'More Filters'}
                    </button>
                </div>
            </div>

            {/* Advanced Filters Collapse */}
            {isAdvancedOpen && (
                <div className="mt-5 border-t border-[var(--border)] pt-5">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-x-6 gap-y-4">
                        {/* Category Filter */}
                        <div>
                            <label className="mb-1.5 block text-xs font-semibold uppercase text-[var(--muted)]">Category</label>
                            <select
                                className="form-control"
                                value={filters.category}
                                onChange={(e) => handleChange('category', e.target.value)}
                            >
                                <option value="all">All Categories</option>
                                {uniqueCategories.map((c: any) => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>

                        {/* Priority Filter */}
                        <div>
                            <label className="mb-1.5 block text-xs font-semibold uppercase text-[var(--muted)]">Priority</label>
                            <select
                                className="form-control"
                                value={filters.priority}
                                onChange={(e) => handleChange('priority', e.target.value)}
                            >
                                <option value="all">All Priorities</option>
                                <option value="high">High</option>
                                <option value="normal">Normal</option>
                                <option value="low">Low</option>
                            </select>
                        </div>

                        {/* Assignee Filter */}
                        <div>
                            <label className="mb-1.5 block text-xs font-semibold uppercase text-[var(--muted)]">Assignee</label>
                            <select
                                className="form-control"
                                value={filters.assigneeId}
                                onChange={(e) => handleChange('assigneeId', e.target.value)}
                            >
                                <option value="all">All Staff</option>
                                {currentUserId && <option value="me">Assigned to Me</option>}
                                <option value="unassigned">Unassigned</option>
                                {users.map(u => (
                                    <option key={u.id} value={u.id}>{u.displayName}</option>
                                ))}
                            </select>
                        </div>

                        {/* Actioned By Filter */}
                        <div>
                            <label className="mb-1.5 block text-xs font-semibold uppercase text-[var(--muted)]">Actioned By</label>
                            <select
                                className="form-control"
                                value={filters.actionedById || 'all'}
                                onChange={(e) => handleChange('actionedById', e.target.value)}
                            >
                                <option value="all">Anyone</option>
                                {currentUserId && <option value="me">Me</option>}
                                {users.map(u => (
                                    <option key={u.id} value={u.id}>{u.displayName}</option>
                                ))}
                            </select>
                        </div>

                        {/* Created By Filter */}
                        <div>
                            <label className="mb-1.5 block text-xs font-semibold uppercase text-[var(--muted)]">Created By</label>
                            <select
                                className="form-control"
                                value={filters.createdById}
                                onChange={(e) => handleChange('createdById', e.target.value)}
                            >
                                <option value="all">All Creators</option>
                                <option value="system">System</option>
                                {uniqueCreators.map((c: any) => (
                                    <option key={c.id} value={c.id}>{c.displayName}</option>
                                ))}
                            </select>
                        </div>

                        {/* Sentiment Filter */}
                        <div>
                            <label className="mb-1.5 block text-xs font-semibold uppercase text-[var(--muted)]">Sentiment</label>
                            <select
                                className="form-control"
                                value={filters.sentiment}
                                onChange={(e) => handleChange('sentiment', e.target.value)}
                            >
                                <option value="all">Any Sentiment</option>
                                <option value="POSITIVE">Positive</option>
                                <option value="NEUTRAL">Neutral</option>
                                <option value="NEGATIVE">Negative</option>
                            </select>
                        </div>

                        {/* Sort By */}
                        <div>
                            <label className="mb-1.5 block text-xs font-semibold uppercase text-[var(--muted)]">Sort By</label>
                            <select
                                className="form-control"
                                value={filters.sortBy || 'newest'}
                                onChange={(e) => handleChange('sortBy', e.target.value)}
                            >
                                <option value="newest">Newest First</option>
                                <option value="oldest">Oldest First</option>
                            </select>
                        </div>

                        {/* Date Range Select */}
                        <div className="md:col-span-2">
                            <label className="mb-1.5 block text-xs font-semibold uppercase text-[var(--muted)]">Date Range</label>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                <select
                                    className="form-control sm:w-1/2"
                                    value={filters.dateRangeType || 'all'}
                                    onChange={e => {
                                        const type = e.target.value;
                                        const now = new Date();
                                        let dateFrom = '';
                                        let dateTo = '';

                                        if (type === 'this_month') {
                                            const start = new Date(now.getFullYear(), now.getMonth(), 1);
                                            dateFrom = start.toISOString().split('T')[0];
                                            dateTo = now.toISOString().split('T')[0];
                                        } else if (type === 'last_month') {
                                            const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                                            const end = new Date(now.getFullYear(), now.getMonth(), 0);
                                            dateFrom = start.toISOString().split('T')[0];
                                            dateTo = end.toISOString().split('T')[0];
                                        }

                                        onFilterChange({
                                            ...filters,
                                            dateRangeType: type,
                                            dateFrom: type === 'custom' ? (filters.dateFrom || '') : dateFrom,
                                            dateTo: type === 'custom' ? (filters.dateTo || '') : dateTo
                                        });
                                    }}
                                >
                                    <option value="all">All Time</option>
                                    <option value="this_month">This Month</option>
                                    <option value="last_month">Last Month</option>
                                    <option value="custom">Custom Range</option>
                                </select>
                                
                                {filters.dateRangeType === 'custom' && (
                                    <div className="flex items-center gap-2 sm:w-1/2">
                                        <input
                                            type="date"
                                            className="form-control"
                                            value={filters.dateFrom || ''}
                                            onChange={e => handleChange('dateFrom', e.target.value)}
                                        />
                                        <span className="text-gray-400 text-xs">to</span>
                                        <input
                                            type="date"
                                            className="form-control"
                                            value={filters.dateTo || ''}
                                            onChange={e => handleChange('dateTo', e.target.value)}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
