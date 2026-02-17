
'use client';


import { useState, useEffect, useCallback } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { getCalendarEvents, CalendarEvent } from '../../lib/api';
import EventModal from './EventModal';
import TaskDetailModal from '../TaskDetailModal';

const locales = {
    'en-US': enUS,
};

const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek,
    getDay,
    locales,
});

interface CalendarViewProps {
    userRole: string; // 'manager' | 'admin' | 'staff'
    users: any[]; // For task assignment in modal if needed, or just passed through
}

export default function CalendarView({ userRole, users }: CalendarViewProps) {
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [date, setDate] = useState(new Date());
    const [view, setView] = useState(Views.MONTH);
    const [loading, setLoading] = useState(false);

    // Modal States
    const [selectedSlot, setSelectedSlot] = useState<{ start: Date; end: Date } | null>(null);
    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
    const [showEventModal, setShowEventModal] = useState(false);
    const [
        selectedTaskForPopup,
        setSelectedTaskForPopup
    ] = useState<number | null>(null);

    const fetchEvents = useCallback(async () => {
        setLoading(true);
        try {
            // Determine range based on view/date (simplified: fetch +/- 1 month for now)
            // Ideally we calculate start/end of the visible range
            const start = new Date(date.getFullYear(), date.getMonth() - 1, 1);
            const end = new Date(date.getFullYear(), date.getMonth() + 2, 0);

            const fetchedEvents = await getCalendarEvents(start, end);

            // React-big-calendar needs Date objects, but our API returns strings.
            // We need to cast them to any or a compatible type for react-big-calendar
            // while keeping our CalendarEvent structure.
            const parsedEvents = fetchedEvents.map(ev => ({
                ...ev,
                start: new Date(ev.start),
                end: new Date(ev.end),
            })) as unknown as CalendarEvent[];
            setEvents(parsedEvents);

        } catch (error) {
            console.error('Failed to fetch events', error);
        } finally {
            setLoading(false);
        }
    }, [date]);

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    const handleSelectSlot = ({ start, end }: { start: Date; end: Date }) => {
        if (userRole !== 'manager' && userRole !== 'admin') return;
        setSelectedSlot({ start, end });
        setSelectedEvent(null);
        setShowEventModal(true);
    };

    const handleSelectEvent = (event: CalendarEvent) => {
        setSelectedEvent(event);
        setSelectedSlot(null);
        setShowEventModal(true);
    };

    const handleNavigate = (newDate: Date) => {
        setDate(newDate);
    };

    const handleViewChange = (newView: any) => {
        setView(newView);
    };

    // Custom Event Styling
    const eventStyleGetter = (event: CalendarEvent) => {
        let backgroundColor = '#3174ad';
        if (event.type === 'reminder') backgroundColor = '#eab308'; // yellow
        if (event.type === 'meeting') backgroundColor = '#10b981'; // green
        if (event.type === 'task_deadline') backgroundColor = '#ef4444'; // red

        return {
            style: {
                backgroundColor,
                borderRadius: '4px',
                opacity: 0.8,
                color: 'white',
                border: '0px',
                display: 'block'
            }
        };
    };

    return (
        <div className="h-[calc(100vh-100px)] bg-white p-4 rounded-lg shadow">
            {loading && <div className="text-center text-sm text-gray-500 mb-2">Loading events...</div>}

            <Calendar
                localizer={localizer}
                events={events}
                startAccessor="start"
                endAccessor="end"
                style={{ height: '100%' }}
                selectable={userRole === 'manager' || userRole === 'admin'}
                onSelectSlot={handleSelectSlot}
                onSelectEvent={handleSelectEvent}
                date={date}
                view={view}
                onNavigate={handleNavigate}
                onView={handleViewChange}
                eventPropGetter={eventStyleGetter}
                views={['month', 'week', 'day', 'agenda']}
            />

            {showEventModal && (
                <EventModal
                    isOpen={showEventModal}
                    onClose={() => setShowEventModal(false)}
                    onRefresh={fetchEvents}
                    initialSlot={selectedSlot}
                    existingEvent={selectedEvent}
                    canEdit={userRole === 'manager' || userRole === 'admin'}

                    onViewTask={(taskId: number) => {
                        setShowEventModal(false);
                        setSelectedTaskForPopup(taskId);
                    }}

                />
            )}

            {selectedTaskForPopup && (
                <TaskDetailModal
                    taskId={selectedTaskForPopup}
                    users={users} // We might need to pass staff users here
                    userRole={userRole}
                    onClose={() => setSelectedTaskForPopup(null)}
                    onRefresh={() => { }} // No need to refresh calendar on task update unless dates changed?
                />
            )}
        </div>
    );
}
