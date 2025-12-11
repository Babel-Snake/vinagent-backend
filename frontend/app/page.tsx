'use client';

import { useEffect, useState } from 'react';
import { fetchTasks, Task } from '../lib/api';
import TaskBoard from '../components/TaskBoard';
import CreateTaskModal from '../components/CreateTaskModal';

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    try {
      setLoading(true);
      const data = await fetchTasks();
      setTasks(data);
      setError('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

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
        </div>
      </header>

      <section className="max-w-6xl mx-auto">
        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-blue-600"></div>
            <p className="mt-2 text-gray-500">Loading tasks...</p>
          </div>
        ) : (
          <TaskBoard tasks={tasks} onRefresh={loadTasks} />
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
