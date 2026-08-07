
'use client';


import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

import CalendarView from '../../../components/Calendar/CalendarView';
import { getMyProfile, getUsers, type Staff, type UserProfile } from '../../../lib/api';
import { clientLogger } from '../../../lib/clientLogger';


export default function CalendarPage() {
    const searchParams = useSearchParams();
    const [user, setUser] = useState<UserProfile | null>(null);
    const [users, setUsers] = useState<Staff[]>([]);
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
                clientLogger.error('Failed to load user info', err);
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
                    <h1 className="page-title">Calendar</h1>
                    <p className="page-kicker">Scheduled reminders, task deadlines, meetings, and winery events.</p>
                </div>
            </div>

            <CalendarView
                userRole={user.role}
                users={users}
                initialEventId={Number(searchParams.get('eventId')) || null}
                currentUser={user}
            />
        </div>
    );
}
