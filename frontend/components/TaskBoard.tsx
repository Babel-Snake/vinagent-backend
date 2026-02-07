'use client';

import { Task, Staff } from '../lib/api';
import TaskCard from './TaskCard';

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
    onToggleFlag
}: TaskBoardProps) {
    if (tasks.length === 0) {
        return (
            <div className="text-center py-12 bg-white rounded-lg shadow">
                <p className="text-gray-500">No tasks found.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {tasks.map(task => (
                <TaskCard
                    key={task.id}
                    task={task}
                    users={users}
                    onRefresh={onRefresh}
                    canAssign={canAssign}
                    userRole={userRole}
                    isFlagged={flaggedTaskIds.includes(task.id)}
                    highlighted={highlightedTaskId === task.id}
                    onToggleFlag={onToggleFlag}
                    autoExpand={autoExpand && highlightedTaskId === task.id}
                />
            ))}
        </div>
    );
}
