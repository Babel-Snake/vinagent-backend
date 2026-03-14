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
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 mb-6">
            {/* Top Row: Essential Filters */}
            <div className="flex flex-col md:flex-row gap-4 items-end">
                {/* Search */}
                <div className="flex-1 w-full">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Search Tasks</label>
                    <input
                        type="text"
                        className="w-full text-sm border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 placeholder-gray-400"
                        value={filters.search}
                        onChange={(e) => handleChange('search', e.target.value)}
                        placeholder="Search by name, phone, email, or content..."
                    />
                </div>

                {/* Status Filter */}
                <div className="w-full md:w-64">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Status</label>
                    <select
                        className="w-full text-sm border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 bg-gray-50 text-gray-800 font-medium"
                        value={filters.status}
                        onChange={(e) => handleChange('status', e.target.value)}
                    >
                        <option value="all">All Statuses</option>
                        <option value="PENDING_REVIEW">Pending Review</option>
                        <option value="APPROVED">Approved</option>
                        <option value="REJECTED">Rejected</option>
                        <option value="EXECUTED">Executed</option>
                    </select>
                </div>

                {/* Always-visible toggles */}
                <div className="flex gap-2">
                    <button
                        onClick={() => handleChange('mentionedMe', !filters.mentionedMe)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors border ${filters.mentionedMe ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    >
                        <span className={filters.mentionedMe ? 'text-purple-500' : 'text-gray-400'}>@</span>
                        Mentions
                    </button>

                    <button
                        onClick={() => handleChange('showOnlyFlagged', !filters.showOnlyFlagged)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors border ${filters.showOnlyFlagged ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    >
                        <span className={filters.showOnlyFlagged ? 'text-yellow-500' : 'text-gray-400'}>★</span>
                        Flagged
                    </button>
                    
                    <button
                        onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors border ${isAdvancedOpen ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    >
                        <svg className={`w-4 h-4 transition-transform ${isAdvancedOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                        Filters
                    </button>
                </div>
            </div>

            {/* Advanced Filters Collapse */}
            {isAdvancedOpen && (
                <div className="mt-5 pt-5 border-t border-gray-100 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-x-6 gap-y-4">
                        {/* Category Filter */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Category</label>
                            <select
                                className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
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
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Priority</label>
                            <select
                                className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
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
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Assignee</label>
                            <select
                                className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
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

                        {/* Created By Filter */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Created By</label>
                            <select
                                className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
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
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Sentiment</label>
                            <select
                                className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
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
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Sort By</label>
                            <select
                                className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                value={filters.sortBy || 'newest'}
                                onChange={(e) => handleChange('sortBy', e.target.value)}
                            >
                                <option value="newest">Newest First</option>
                                <option value="oldest">Oldest First</option>
                            </select>
                        </div>

                        {/* Date Range Select */}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Date Range</label>
                            <div className="flex gap-4 items-center">
                                <select
                                    className="w-1/2 text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
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
                                    <div className="flex items-center gap-2 w-1/2">
                                        <input
                                            type="date"
                                            className="w-full border-gray-300 rounded-md text-sm shadow-sm"
                                            value={filters.dateFrom || ''}
                                            onChange={e => handleChange('dateFrom', e.target.value)}
                                        />
                                        <span className="text-gray-400 text-xs">to</span>
                                        <input
                                            type="date"
                                            className="w-full border-gray-300 rounded-md text-sm shadow-sm"
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
