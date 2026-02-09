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
            className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer flex items-center gap-4 group"
        >
            {/* Status Indicator Line */}
            <div className={`w-1.5 self-stretch rounded-full 
                ${task.status === 'APPROVED' ? 'bg-green-500' : ''} 
                ${task.status === 'PENDING_REVIEW' ? 'bg-yellow-500' : ''} 
                ${task.status === 'IN_PROGRESS' ? 'bg-purple-500' : ''} 
                ${task.status === 'REJECTED' ? 'bg-red-500' : ''} 
                ${task.status === 'EXECUTED' ? 'bg-blue-500' : ''} 
            `}></div>

            {/* Main Content */}
            <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-gray-900 truncate">
                                {task.subType ? task.subType.replace(/_/g, ' ') : task.type}
                            </span>
                            {task.Member && (
                                <span className="text-sm text-gray-500 truncate">
                                    • {task.Member.firstName} {task.Member.lastName}
                                </span>
                            )}
                        </div>

                        {/* Summary / Snippet */}
                        {summaryText && (
                            <p className="text-sm text-gray-600 truncate mb-1">
                                {summaryText}
                            </p>
                        )}

                        {/* Meta Row */}
                        <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                            <span>#{task.id}</span>
                            <span>•</span>
                            <span>{formatDate(task.createdAt)}</span>
                            <span>•</span>
                            <span className={`font-medium ${!task.assigneeId ? 'text-red-400' : 'text-gray-500'}`}>
                                {getAssigneeName()}
                            </span>
                        </div>
                    </div>

                    {/* Right Side Actions/Badges */}
                    <div className="flex flex-col items-end gap-2 ml-4">
                        <button
                            onClick={(e) => {
                                e.stopPropagation(); // Don't open modal
                                if (onToggleFlag) onToggleFlag(task.id);
                            }}
                            className={`text-lg p-1 hover:bg-gray-100 rounded-full transition-colors ${isFlagged ? 'text-yellow-400' : 'text-gray-200 group-hover:text-gray-300'}`}
                            title={isFlagged ? "Unflag" : "Flag for follow-up"}
                        >
                            {isFlagged ? '★' : '☆'}
                        </button>

                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide
                            ${task.priority === 'high' ? 'bg-red-100 text-red-800' : ''}
                            ${task.priority === 'normal' ? 'bg-blue-50 text-blue-600' : ''}
                            ${task.priority === 'low' ? 'bg-gray-100 text-gray-500' : ''}
                        `}>
                            {task.priority || 'normal'}
                        </span>

                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide
                            ${task.category === 'OPERATIONS' ? 'bg-purple-100 text-purple-800' : ''}
                            ${task.category === 'ORDER' ? 'bg-blue-100 text-blue-800' : ''}
                            ${task.category === 'BOOKING' ? 'bg-pink-100 text-pink-800' : ''}
                            ${task.category === 'ACCOUNT' ? 'bg-orange-100 text-orange-800' : ''}
                            ${task.category === 'GENERAL' ? 'bg-gray-100 text-gray-800' : ''}
                        `}>
                            {task.category || 'GENERAL'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
