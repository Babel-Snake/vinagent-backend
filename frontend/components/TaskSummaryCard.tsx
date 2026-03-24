'use client';

import { Task, Staff } from '../lib/api';

interface TaskSummaryCardProps {
    task: Task;
    users: Staff[];
    isFlagged: boolean;
    onToggleFlag?: (taskId: number) => void;
    onClick: () => void;
}

export default function TaskSummaryCard({
    task,
    users,
    isFlagged,
    onToggleFlag,
    onClick
}: TaskSummaryCardProps) {

    // Helper to get formatted date
    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    };

    // Helper for assignee name
    const getAssigneeName = () => {
        if (!task.assigneeId) return 'Unassigned';
        const user = users.find(u => u.id === task.assigneeId);
        return user ? user.displayName : 'Unknown';
    };

    // Extract summary if available
    const getSummary = () => {
        let raw = task.payload;
        if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) { } }
        if (raw && typeof raw === 'object' && raw.summary) return raw.summary;
        return null; // Don't show if no summary
    };

    const summaryText = getSummary();

    return (
        <div
            onClick={onClick}
            className={`bg-white border-y border-r border-l-4 border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer flex items-start gap-4 group mb-4
                ${task.priority === 'high' ? 'border-l-red-500 hover:border-l-red-600' : ''}
                ${task.priority === 'normal' || !task.priority ? 'border-l-amber-500 hover:border-l-amber-600' : ''}
                ${task.priority === 'low' ? 'border-l-blue-400 hover:border-l-blue-500' : ''}
            `}
        >
            {/* Main Content */}
            <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                    <div className="min-w-0 flex-1 pr-4">
                        <div className="flex items-center gap-3 mb-2">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation(); // Don't open modal
                                    if (onToggleFlag) onToggleFlag(task.id);
                                }}
                                className={`text-2xl hover:scale-110 transition-transform ${isFlagged ? 'text-yellow-400' : 'text-gray-200 group-hover:text-gray-300'}`}
                                title={isFlagged ? "Unflag" : "Flag for follow-up"}
                            >
                                {isFlagged ? '★' : '☆'}
                            </button>
                            <span className="text-lg font-bold text-gray-900 truncate tracking-tight">
                                {task.subType ? task.subType.replace(/_/g, ' ') : task.type}
                            </span>
                            {task.Member && (
                                <span className="text-sm font-semibold text-gray-600 truncate bg-gray-100 px-2.5 py-0.5 rounded-full">
                                    {task.Member.firstName} {task.Member.lastName}
                                </span>
                            )}
                        </div>

                        {/* Summary / Snippet */}
                        {summaryText && (
                            <p className="text-sm text-gray-600 line-clamp-2 leading-relaxed mb-3">
                                {summaryText}
                            </p>
                        )}

                        {/* Meta Row */}
                        <div className="flex items-center gap-4 text-sm text-gray-500 font-medium mt-2">
                            <span className="flex items-center gap-1.5">
                                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {formatDate(task.createdAt)}
                            </span>
                            <span className="text-gray-300">•</span>
                            <span className={`flex items-center gap-1.5 ${!task.assigneeId ? 'text-red-500 font-bold' : ''}`}>
                                <svg className="w-4 h-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                {getAssigneeName()}
                            </span>
                        </div>
                    </div>

                    {/* Right Side Actions/Badges */}
                    <div className="flex flex-col items-end gap-3 shrink-0">
                        {/* Status Row */}
                        <div className="flex items-center gap-3">
                            <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider
                                ${task.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' : ''}
                                ${task.status === 'ACTIONED' ? 'bg-green-100 text-green-800 border border-green-200' : ''}
                                ${task.status === 'REJECTED' ? 'bg-red-100 text-red-800 border border-red-200' : ''}
                            `}>
                                {task.status.replace(/_/g, ' ')}
                            </span>
                        </div>

                        {/* Category Row */}
                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider
                            ${task.category === 'OPERATIONS' ? 'bg-purple-50 text-purple-700 border border-purple-200' : ''}
                            ${task.category === 'ORDER' ? 'bg-sky-50 text-sky-700 border border-sky-200' : ''}
                            ${task.category === 'BOOKING' ? 'bg-pink-50 text-pink-700 border border-pink-200' : ''}
                            ${task.category === 'ACCOUNT' ? 'bg-orange-50 text-orange-700 border border-orange-200' : ''}
                            ${task.category === 'GENERAL' ? 'bg-gray-50 text-gray-700 border border-gray-200' : ''}
                        `}>
                            {task.category || 'GENERAL'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
