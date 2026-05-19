
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

    if (loading) return <div className="p-8 text-center text-[var(--muted)]">Loading calendar...</div>;

    if (!user) return <div className="p-8 text-center text-red-500">Error loading user profile.</div>;

    return (
        <div className="page-shell">
            <div className="page-header">
                <div>
                    <h1 className="text-2xl font-bold text-[#1c231f]">Calendar</h1>
                    <p className="page-kicker">Scheduled reminders, task deadlines, meetings, and winery events.</p>
                </div>
            </div>

            <CalendarView
                userRole={user.role}
                users={users}
            />
        </div>
    );
}
