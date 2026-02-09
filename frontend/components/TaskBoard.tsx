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
            <div className="text-center py-12 bg-white rounded-lg shadow">
                <p className="text-gray-500">No tasks found.</p>
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
