import { Task } from '../lib/api';

interface TaskFiltersProps {
    filters: {
        category: string;
        priority: string;
        assigneeId: string; // 'all' or number
        createdById: string; // 'all' or number or 'system'
        status: string;
        sentiment: string;
        search: string;
    };
    onFilterChange: (newFilters: any) => void;
    tasks: Task[]; // Passed to extract unique options dynamically (e.g. Assignees)
}

export default function TaskFilters({ filters, onFilterChange, tasks }: TaskFiltersProps) {
    // Extract Unique Assignees for Dropdown
    const uniqueAssignees = Array.from(new Set(tasks.map(t => t.Assignee ? JSON.stringify(t.Assignee) : '').filter(Boolean)))
        .map(s => JSON.parse(s));

    // Extract Unique Creators for Dropdown
    const uniqueCreators = Array.from(new Set(tasks.map(t => t.Creator ? JSON.stringify(t.Creator) : '').filter(Boolean)))
        .map(s => JSON.parse(s));

    // Extract Unique Categories
    const uniqueCategories = Array.from(new Set(tasks.map(t => t.category).filter(Boolean))).sort();

    const handleChange = (field: string, value: string) => {
        onFilterChange({ ...filters, [field]: value });
    };

    return (
        <div className="bg-white p-4 rounded-lg shadow mb-6 grid grid-cols-2 md:grid-cols-6 gap-4">

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
                    {uniqueCategories.map(c => (
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

            {/* Assignee Filter */}
            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Assignee</label>
                <select
                    className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    value={filters.assigneeId}
                    onChange={(e) => handleChange('assigneeId', e.target.value)}
                >
                    <option value="all">All Staff</option>
                    <option value="unassigned">Unassigned</option>
                    {uniqueAssignees.map((a: any) => (
                        <option key={a.id} value={a.id}>{a.displayName}</option>
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
        </div>
    );
}
