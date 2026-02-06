'use client';

import { useEffect, useState } from 'react';
import { fetchTasks, Task, getUsers, Staff, getMyProfile } from '../../../lib/api';
import TaskBoard from '../../../components/TaskBoard';
import CreateTaskModal from '../../../components/CreateTaskModal';
import TaskFilters from '../../../components/TaskFilters';

export default function TasksPage() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [users, setUsers] = useState<Staff[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [userRole, setUserRole] = useState<string | null>(null);
    const [currentUserId, setCurrentUserId] = useState<number | null>(null);
    const [filters, setFilters] = useState({
        category: 'all',
        priority: 'all',
        status: 'PENDING_REVIEW',
        sentiment: 'all',
        assigneeId: 'all',
        createdById: 'all',
        search: ''
    });

    async function loadTasks() {
        try {
            setLoading(true);
            let role = userRole;
            if (!role) {
                const profileData = await getMyProfile();
                role = profileData?.user?.role || null;
                setUserRole(role);
                setCurrentUserId(profileData?.user?.id || null);
            }

            const tasksData = await fetchTasks();
            setTasks(tasksData);

            // Fetch users for everyone to support ID resolution in history
            try {
                const usersData = await getUsers();
                setUsers(usersData);
            } catch (ignore) {
                // If fetching users fails (e.g. permission), we just won't have names
                setUsers([]);
            }
            setError('');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadTasks();
    }, []);

    const normalizePhone = (value: string) => value.replace(/[^\d]/g, '');

    // Filter Logic
    const filteredTasks = tasks.filter(task => {
        if (filters.category !== 'all' && task.category !== filters.category) return false;
        if (filters.priority !== 'all' && task.priority !== filters.priority) return false;
        if (filters.status !== 'all' && task.status !== filters.status) return false;
        if (filters.sentiment !== 'all' && task.sentiment !== filters.sentiment) return false;

        if (filters.assigneeId !== 'all') {
            if (filters.assigneeId === 'unassigned') {
                if (task.assigneeId) return false;
            } else if (filters.assigneeId === 'me') {
                if (task.assigneeId !== currentUserId) return false;
            } else {
                if (task.assigneeId !== Number(filters.assigneeId)) return false;
            }
        }

        if (filters.createdById !== 'all') {
            if (filters.createdById === 'system') {
                if (task.Creator) return false;
            } else {
                if (task.Creator?.id !== Number(filters.createdById)) return false;
            }
        }

        if (filters.search.trim()) {
            const term = filters.search.trim().toLowerCase();
            const member = task.Member;
            const fullName = member ? `${member.firstName} ${member.lastName}`.toLowerCase() : '';
            const email = (member?.email || '').toLowerCase();
            const phone = member?.phone || '';
            const normalizedPhone = normalizePhone(phone);
            const normalizedTerm = normalizePhone(term);

            const matchesName = fullName.includes(term);
            const matchesEmail = email.includes(term);
            const matchesPhone = normalizedTerm ? normalizedPhone.includes(normalizedTerm) : false;

            if (!matchesName && !matchesEmail && !matchesPhone) return false;
        }

        return true;
    });

    const sortedTasks = [...filteredTasks].sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return (
        <div className="px-4 py-6 sm:px-0">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-semibold text-gray-900">Tasks</h1>
                <div className="flex gap-3">
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700 text-sm font-medium flex items-center gap-2"
                    >
                        <span>+</span> New Task (Smart)
                    </button>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
                    <p className="text-sm text-red-700">{error}</p>
                </div>
            )}

            <TaskFilters
                filters={filters}
                onFilterChange={setFilters}
                tasks={tasks}
                currentUserId={currentUserId}
            />

            {loading ? (
                <div className="text-center py-12">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-blue-600"></div>
                    <p className="mt-2 text-gray-500">Loading tasks...</p>
                </div>
            ) : (
                <TaskBoard
                    tasks={sortedTasks}
                    users={users}
                    onRefresh={loadTasks}
                    canAssign={userRole !== 'staff'}
                    userRole={userRole}
                />
            )}

            {showCreateModal && (
                <CreateTaskModal
                    onClose={() => setShowCreateModal(false)}
                    onCreated={() => {
                        setShowCreateModal(false);
                        loadTasks();
                    }}
                />
            )}
        </div>
    );
}
