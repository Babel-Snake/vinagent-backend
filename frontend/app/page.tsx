'use client';

import { useEffect, useState } from 'react';
import { fetchTasks, updateTaskStatus, Task } from '../lib/api';

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  async function handleStatusChange(id: number, newStatus: string) {
    try {
      // Optimistic update
      setTasks(current =>
        current.map(t => t.id === id ? { ...t, status: newStatus } : t)
      );

      await updateTaskStatus(id, newStatus);
      await loadTasks(); // Refresh to ensure sync
    } catch (err: any) {
      alert('Failed to update task: ' + err.message);
      loadTasks(); // Revert
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <header className="max-w-5xl mx-auto mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">VinAgent Dashboard</h1>
          <p className="text-gray-500">Winery: Task Test Winery</p>
        </div>
        <button
          onClick={() => loadTasks()}
          className="px-4 py-2 bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-50 text-sm font-medium"
        >
          Refresh
        </button>
      </header>

      <section className="max-w-5xl mx-auto">
        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
            <div className="flex">
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
                <p className="text-xs text-red-500 mt-1">Is the backend running on port 3000?</p>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-blue-600"></div>
            <p className="mt-2 text-gray-500">Loading tasks...</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {tasks.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg shadow">
                <p className="text-gray-500">No tasks found. Send an SMS to create one!</p>
              </div>
            ) : (
              tasks.map(task => (
                <div key={task.id} className="bg-white rounded-lg shadow p-6 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium 
                          ${task.status === 'PENDING_REVIEW' ? 'bg-yellow-100 text-yellow-800' : ''}
                          ${task.status === 'APPROVED' ? 'bg-green-100 text-green-800' : ''}
                          ${task.status === 'REJECTED' ? 'bg-red-100 text-red-800' : ''}
                          ${task.status === 'EXECUTED' ? 'bg-blue-100 text-blue-800' : ''}
                        `}>
                        {task.status.replace('_', ' ')}
                      </span>
                      <span className="text-sm text-gray-500">
                        ID: #{task.id}
                      </span>
                      <span className="text-sm text-gray-500">
                        {new Date(task.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {task.type.replace('_', ' ')}
                    </h3>

                    <div className="text-sm text-gray-600 mb-4">
                      Member: {task.Member ? `${task.Member.firstName} ${task.Member.lastName}` : 'Unknown'}
                    </div>

                    <div className="bg-gray-50 rounded p-3 text-sm font-mono text-gray-700 whitespace-pre-wrap">
                      {JSON.stringify(task.payload, null, 2)}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    {task.status === 'PENDING_REVIEW' && (
                      <>
                        <button
                          onClick={() => handleStatusChange(task.id, 'APPROVED')}
                          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleStatusChange(task.id, 'REJECTED')}
                          className="px-4 py-2 bg-white border border-red-300 text-red-700 rounded hover:bg-red-50 text-sm font-medium transition-colors"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {task.status !== 'PENDING_REVIEW' && (
                      <div className="text-sm text-gray-400 font-medium text-center">
                        Actioned
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </section>
    </main>
  );
}
