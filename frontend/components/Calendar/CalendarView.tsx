
'use client';


import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, dateFnsLocalizer, Views, EventProps } from 'react-big-calendar';
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
    const router = useRouter();
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
        if (event.type === 'event') backgroundColor = '#2563eb'; // blue
        if (event.type === 'task_deadline') backgroundColor = '#ef4444'; // red
        if (event.type === 'notice') backgroundColor = '#0f766e'; // teal

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

    // Custom event component: shows compact link markers for task- and notice-linked events
    const calendarComponents = useMemo(() => ({
        event: ({ event }: EventProps<CalendarEvent>) => {
            const calendarEvent = event as CalendarEvent;
            const linkedTaskCount = calendarEvent.LinkedTasks?.length || (calendarEvent.LinkedTask || calendarEvent.taskId ? 1 : 0);
            const linkedNoticeCount = calendarEvent.LinkedNotices?.length || (calendarEvent.LinkedNotice || calendarEvent.noticeId ? 1 : 0);
            return (
                <span className="rbc-custom-event" style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%' }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {event.title}
                    </span>
                    {linkedTaskCount > 0 && (
                        <span
                            role="button"
                            title={linkedTaskCount === 1 ? 'Open linked task' : `${linkedTaskCount} linked tasks`}
                            onClick={(e) => {
                                e.stopPropagation();
                                const taskId = calendarEvent.LinkedTasks?.[0]?.id || calendarEvent.LinkedTask?.id || calendarEvent.taskId;
                                if (linkedTaskCount === 1 && taskId) {
                                    setSelectedTaskForPopup(taskId);
                                } else {
                                    handleSelectEvent(calendarEvent);
                                }
                            }}
                            style={{
                                cursor: 'pointer',
                                fontSize: '0.85em',
                                flexShrink: 0,
                                opacity: 0.9,
                                lineHeight: 1,
                                padding: '0 2px',
                            }}
                        >
                            T{linkedTaskCount > 1 ? linkedTaskCount : ''}
                        </span>
                    )}
                    {linkedNoticeCount > 0 && (
                        <span
                            role="button"
                            title={linkedNoticeCount === 1 ? 'Open linked notice' : `${linkedNoticeCount} linked notices`}
                            onClick={(e) => {
                                e.stopPropagation();
                                const noticeId = calendarEvent.LinkedNotices?.[0]?.id || calendarEvent.LinkedNotice?.id || calendarEvent.noticeId;
                                if (linkedNoticeCount === 1 && noticeId) {
                                    router.push(`/noticeboard?noticeId=${noticeId}`);
                                } else {
                                    handleSelectEvent(calendarEvent);
                                }
                            }}
                            style={{
                                cursor: 'pointer',
                                fontSize: '0.85em',
                                flexShrink: 0,
                                opacity: 0.9,
                                lineHeight: 1,
                                padding: '0 2px',
                                fontWeight: 700,
                            }}
                        >
                            N{linkedNoticeCount > 1 ? linkedNoticeCount : ''}
                        </span>
                    )}
                </span>
            );
        },
    }), [router]);

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
                components={calendarComponents}
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
                    onViewNotice={(noticeId: number) => {
                        setShowEventModal(false);
                        router.push(`/noticeboard?noticeId=${noticeId}`);
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
