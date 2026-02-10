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
        sortBy?: string;
        dateRangeType?: string;
        dateFrom?: string;
        dateTo?: string;
    };
    onFilterChange: (newFilters: any) => void;
    tasks: Task[];
    users: Staff[]; // Added prop
    currentUserId?: number | null;
}

export default function TaskFilters({ filters, onFilterChange, tasks, users, currentUserId }: TaskFiltersProps) {
    // Extract Unique Creators for Dropdown (Assignees now come from users prop)
    const uniqueCreators = Array.from(new Set(tasks.map(t => t.Creator ? JSON.stringify(t.Creator) : '').filter(Boolean)))
        .map(s => JSON.parse(s));

    // Extract Unique Categories
    const uniqueCategories = Array.from(new Set(tasks.map(t => t.category).filter(Boolean))).sort();

    const handleChange = (field: string, value: string) => {
        onFilterChange({ ...filters, [field]: value });
    };

    return (
        <div className="bg-white p-4 rounded-lg shadow mb-6">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-4">
                {/* Search */}
                <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Search</label>
                    <input
                        type="text"
                        className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        value={filters.search}
                        onChange={(e) => handleChange('search', e.target.value)}
                        placeholder="Name, phone, or email"
                    />
                </div>

                {/* Category Filter */}
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Category</label>
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
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Priority</label>
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

                {/* Status Filter */}
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Status</label>
                    <select
                        className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
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

                {/* Sentiment Filter */}
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Sentiment</label>
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
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                {/* Assignee Filter */}
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Assignee</label>
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
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Created By</label>
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

                {/* Sort By */}
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Sort By</label>
                    <select
                        className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        value={filters.sortBy || 'newest'}
                        onChange={(e) => handleChange('sortBy', e.target.value)}
                    >
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                    </select>
                </div>

                {/* Date Range */}
                <div className="flex gap-2 items-center">
                    <div className="flex-1">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Date</label>
                        <select
                            className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
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
                    </div>
                </div>
            </div>

            {/* Custom Date Inputs & Flagged */}
            <div className="flex flex-wrap items-center gap-4 mt-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
                {filters.dateRangeType === 'custom' && (
                    <div className="flex gap-2 items-center">
                        <span className="text-sm text-gray-500 font-medium">From</span>
                        <input
                            type="date"
                            className="border-gray-300 rounded-md text-sm shadow-sm"
                            value={filters.dateFrom || ''}
                            onChange={e => handleChange('dateFrom', e.target.value)}
                        />
                        <span className="text-sm text-gray-500 font-medium">To</span>
                        <input
                            type="date"
                            className="border-gray-300 rounded-md text-sm shadow-sm"
                            value={filters.dateTo || ''}
                            onChange={e => handleChange('dateTo', e.target.value)}
                        />
                    </div>
                )}

                <div className="ml-auto">
                    <button
                        onClick={() => handleChange('showOnlyFlagged', !filters.showOnlyFlagged)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${filters.showOnlyFlagged ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
                    >
                        <span className={filters.showOnlyFlagged ? 'text-yellow-500' : 'text-gray-400'}>★</span>
                        Show Flagged Only
                    </button>
                </div>
            </div>
        </div>
    );
}
