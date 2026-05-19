'use client';

import { Task, Staff } from '../lib/api';
import TaskSummaryCard from './TaskSummaryCard';

interface TaskBoardProps {
    tasks: Task[];
    users: Staff[];
    onRefresh: () => void;
    canAssign?: boolean;
    userRole?: string | null;
    highlightedTaskId?: number;
    autoExpand?: boolean;
    flaggedTaskIds?: number[];
    onToggleFlag?: (taskId: number) => void;
    onTaskClick?: (taskId: number) => void;
}

export default function TaskBoard({
    tasks,
    users,
    onRefresh,
    canAssign = true,
    userRole,
    highlightedTaskId,
    autoExpand,
    flaggedTaskIds = [],
    onToggleFlag,
    onTaskClick
}: TaskBoardProps) {
    if (tasks.length === 0) {
        return (
            <div className="empty-state">
                <div>
                    <p className="font-semibold text-[#344039]">No matching tasks</p>
                    <p className="mt-1 text-sm">Adjust filters or create a new case when fresh work arrives.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {tasks.map(task => (
                <TaskSummaryCard
                    key={task.id}
                    task={task}
                    users={users}
                    isFlagged={flaggedTaskIds.includes(task.id)}
                    onToggleFlag={onToggleFlag}
                    onClick={() => onTaskClick && onTaskClick(task.id)}
                />
            ))}
        </div>
    );
}
