
'use client';


import { Suspense, useState, useEffect } from 'react';

import CalendarView from '../../../components/Calendar/CalendarView';
import { getMyProfile, getUsers } from '../../../lib/api';


export default function CalendarPage() {
    const [user, setUser] = useState<any>(null);
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            try {
                const [profile, allUsers] = await Promise.all([
                    getMyProfile(),
                    getUsers()
                ]);
                setUser(profile.user);
                setUsers(allUsers);
            } catch (err) {
                console.error('Failed to load user info', err);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    if (loading) return <div className="p-8 text-center text-gray-500">Loading calendar...</div>;

    if (!user) return <div className="p-8 text-center text-red-500">Error loading user profile.</div>;

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
                {/* Add filters if needed later */}
            </div>

            <CalendarView
                userRole={user.role}
                users={users}
            />
        </div>
    );
}
