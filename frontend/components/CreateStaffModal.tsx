'use client';
import { useState } from 'react';
import { createStaff } from '../lib/api';
import { errorMessage } from '../lib/errors';
import Dialog from './ui/Dialog';

interface CreateStaffModalProps {
    onClose: () => void;
}

export default function CreateStaffModal({ onClose }: CreateStaffModalProps) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [successUser, setSuccessUser] = useState<string | null>(null);
    const [successPin, setSuccessPin] = useState('');

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');

        try {
            const staff = await createStaff({ username, password, pin: pin.trim() || undefined });
            setSuccessUser(staff.username || username);
            setSuccessPin(pin.trim());
        } catch (err: unknown) {
            setError(errorMessage(err));
        }
    }

    if (successUser) {
        return (
            <Dialog open onClose={onClose} title="Staff account created" showHeader={false} className="max-w-md">
                <div className="p-6 text-center">
                    <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                        <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900">Staff Account Created!</h3>
                    <div className="mt-4 bg-gray-50 p-4 rounded text-left">
                        <p className="text-sm text-gray-500 mb-2">Please share these login details with your staff member:</p>
                        <p className="text-sm"><strong>Username:</strong> {successUser}</p>
                        <p className="text-sm"><strong>Access Code:</strong> {password}</p>
                        {successPin && <p className="text-sm"><strong>Quick PIN:</strong> {successPin}</p>}
                        <p className="text-xs text-gray-400 mt-2">They can use Staff Login, or Quick PIN if it is enabled for the winery.</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="mt-6 w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 sm:text-sm"
                    >
                        Done
                    </button>
                </div>
            </Dialog>
        );
    }

    return (
        <Dialog open onClose={onClose} title="Add staff member" showHeader={false} className="max-w-md">
            <div className="p-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">Add Staff Member</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Username</label>
                        <input
                            type="text"
                            required
                            placeholder="e.g. sarah"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            Simple, case-insensitive ID (e.g. &quot;sarah&quot; or &quot;bar_team&quot;).
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Access Code (Password)</label>
                        <input
                            type="text" // Visible text for clearer setup
                            required
                            placeholder="e.g. 123456"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            Use at least 8 characters, including one number.
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Quick PIN</label>
                        <input
                            type="text"
                            placeholder="e.g. 4821"
                            value={pin}
                            onChange={e => setPin(e.target.value)}
                            pattern="[A-Za-z0-9]{4,12}"
                            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            Optional. Use 4 to 12 letters or numbers for quick kiosk login.
                        </p>
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50 text-red-700 text-sm rounded">
                            {error}
                        </div>
                    )}

                    <div className="pt-2">
                        <button
                            type="submit"
                            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                            Create Account
                        </button>
                    </div>
                </form>
            </div>
        </Dialog>
    );
}
