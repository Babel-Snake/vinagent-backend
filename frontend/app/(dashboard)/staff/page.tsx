'use client';

import { useState } from 'react';
import CreateStaffModal from '../../../components/CreateStaffModal';

export default function StaffPage() {
    const [showStaffModal, setShowStaffModal] = useState(false);

    return (
        <div className="px-4 py-6 sm:px-0">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-semibold text-gray-900">Staff Management</h1>
                <button
                    onClick={() => setShowStaffModal(true)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded shadow hover:bg-indigo-700 text-sm font-medium flex items-center gap-2"
                >
                    <span>+</span> Add New Staff
                </button>
            </div>

            <div className="bg-white shadow overflow-hidden sm:rounded-md p-6 text-center text-gray-500">
                <p>Staff list will appear here in a future update.</p>
                <p className="text-sm mt-2">Use the button above to create new staff accounts.</p>
            </div>

            {showStaffModal && (
                <CreateStaffModal
                    onClose={() => setShowStaffModal(false)}
                />
            )}
        </div>
    );
}
