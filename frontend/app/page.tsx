'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { fetchTasks, Task } from '../lib/api';
import TaskBoard from '../components/TaskBoard';
import CreateTaskModal from '../components/CreateTaskModal';
import TaskFilters from '../components/TaskFilters';

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filters, setFilters] = useState({
    category: 'all',
    priority: 'all',
    status: 'PENDING_REVIEW', // Default to Pending for better workflow focus
    sentiment: 'all',
    assigneeId: 'all'
  });
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        loadTasks();
      } else {
        setLoading(false);
        router.push('/login');
      }
    });
    return () => unsubscribe();
  }, []);

  async function handleLogout() {
    await signOut(auth);
    router.push('/login');
  }

  async function loadTasks() {
    try {
      setLoading(true);
      const data = await fetchTasks(); // Fetches ALL tasks (could optimise to fetch by status later)
      setTasks(data);
      setError('');
    } catch (err: any) {
      setError(err.message);
      if (err.message.includes('401') || err.message.toLowerCase().includes('unauthorized')) {
        router.push('/login');
      }
    } finally {
      setLoading(false);
    }
  }

  // Client-side Filtering Logic
  const filteredTasks = tasks.filter(task => {
    if (filters.category !== 'all' && task.category !== filters.category) return false;
    if (filters.priority !== 'all' && task.priority !== filters.priority) return false;
    if (filters.status !== 'all' && task.status !== filters.status) return false;
    if (filters.sentiment !== 'all' && task.sentiment !== filters.sentiment) return false;

    if (filters.assigneeId !== 'all') {
      if (filters.assigneeId === 'unassigned') {
        if (task.assigneeId) return false;
      } else {
        if (task.assigneeId !== Number(filters.assigneeId)) return false;
      }
    }
    return true;
  });

  // Sorting: Pending first, then Newest First
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    // 1. Status Priority (Pending > Approved > Executed > Rejected) -- actually Filter usually handles status isolation.
    // Let's just sort by Date Descending (Newest Top)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <header className="max-w-6xl mx-auto mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">VinAgent Dashboard</h1>
          <p className="text-gray-500">Winery: Task Test Winery</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700 text-sm font-medium flex items-center gap-2"
          >
            <span>+</span> New Task (Smart)
          </button>
          <button
            onClick={() => loadTasks()}
            className="px-4 py-2 bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-50 text-sm font-medium"
          >
            Refresh
          </button>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-50 border border-red-200 text-red-600 rounded shadow-sm hover:bg-red-100 text-sm font-medium"
          >
            Logout
          </button>
        </div>
      </header>

      <section className="max-w-6xl mx-auto">
        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Filter Bar */}
        <TaskFilters
          filters={filters}
          onFilterChange={setFilters}
          tasks={tasks}
        />

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-blue-600"></div>
            <p className="mt-2 text-gray-500">Loading tasks...</p>
          </div>
        ) : (
          <TaskBoard tasks={sortedTasks} onRefresh={loadTasks} />
        )}
      </section>

      {showCreateModal && (
        <CreateTaskModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            loadTasks();
          }}
        />
      )}
    </main>
  );
}
