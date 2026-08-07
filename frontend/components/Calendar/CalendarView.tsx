
'use client';


import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, dateFnsLocalizer, Views, EventProps, type View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { getCalendarEvent, getCalendarEvents, CalendarEvent, type Staff, type UserProfile } from '../../lib/api';
import { clientLogger } from '../../lib/clientLogger';
import EventModal from './EventModal';
import TaskDetailModal from '../TaskDetailModal';
import { eventInvolvement } from '../../lib/involvement';

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
    users: Staff[];
    initialEventId?: number | null;
    currentUser: UserProfile;
}

export default function CalendarView({ userRole, users, initialEventId = null, currentUser }: CalendarViewProps) {
    const router = useRouter();
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [date, setDate] = useState(new Date());
    const [view, setView] = useState<View>(Views.MONTH);
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
            // Normalize those fields for react-big-calendar while retaining the API shape.
            const parsedEvents = fetchedEvents.map(ev => ({
                ...ev,
                start: new Date(ev.start),
                end: new Date(ev.end),
            })) as unknown as CalendarEvent[];
            setEvents(parsedEvents);

        } catch (error) {
            clientLogger.error('Failed to fetch events', error);
        } finally {
            setLoading(false);
        }
    }, [date]);

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    useEffect(() => {
        if (!initialEventId) return;
        let cancelled = false;
        getCalendarEvent(initialEventId)
            .then(event => {
                if (cancelled) return;
                setDate(new Date(event.start));
                setSelectedEvent(event);
                setSelectedSlot(null);
                setShowEventModal(true);
            })
            .catch(error => clientLogger.error('Failed to open linked calendar event', error));
        return () => { cancelled = true; };
    }, [initialEventId]);

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

    const handleViewChange = (newView: View) => {
        setView(newView);
    };

    // Custom Event Styling
    const eventStyleGetter = (event: CalendarEvent) => {
        let backgroundColor = '#52625a';
        if (event.type === 'reminder') backgroundColor = '#eab308'; // yellow
        if (event.type === 'meeting') backgroundColor = '#10b981'; // green
        if (event.type === 'event') backgroundColor = '#7a1f2b'; // winery event
        if (event.type === 'task_deadline') backgroundColor = '#ef4444'; // red
        if (event.type === 'notice') backgroundColor = '#0f766e'; // teal
        const involvement = eventInvolvement(event, currentUser);
        const involvementColor = involvement?.kind === 'DIRECT' ? '#0f766e' : involvement?.kind === 'AREA' ? '#7a1f2b' : 'transparent';

        return {
            style: {
                backgroundColor,
                borderRadius: '4px',
                opacity: 0.8,
                color: 'white',
                border: involvement ? `3px solid ${involvementColor}` : '0px',
                boxShadow: involvement ? '0 0 0 1px rgba(255,255,255,0.85) inset' : 'none',
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
            const involvement = eventInvolvement(calendarEvent, currentUser);
            return (
                <span className="rbc-custom-event" style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%' }}>
                    {involvement && <span aria-label={involvement.kind === 'DIRECT' ? 'Directly involves you' : 'Involves your department or role'} title={involvement.kind === 'DIRECT' ? 'Directly yours' : 'Your department'} style={{ flexShrink: 0, fontSize: '0.65em' }}>●</span>}
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {event.title}
                    </span>
                    {linkedTaskCount > 0 && (
                        <button
                            type="button"
                            aria-label={linkedTaskCount === 1 ? 'Open linked task' : `${linkedTaskCount} linked tasks`}
                            className="border-0 bg-transparent p-0 text-inherit underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
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
                        </button>
                    )}
                    {linkedNoticeCount > 0 && (
                        <button
                            type="button"
                            aria-label={linkedNoticeCount === 1 ? 'Open linked notice' : `${linkedNoticeCount} linked notices`}
                            className="border-0 bg-transparent p-0 text-inherit underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
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
                        </button>
                    )}
                </span>
            );
        },
    }), [currentUser, router]);

    return (
        <div className="h-[min(70vh,48rem)] min-h-[34rem] rounded-lg bg-white p-3 shadow sm:p-4">
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
                    currentUser={currentUser}

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
                    currentUserId={currentUser.id}
                    currentUserAreaIds={currentUser.areaIds || currentUser.areaMemberships?.map(membership => membership.areaId) || []}
                    onClose={() => setSelectedTaskForPopup(null)}
                    onRefresh={() => { }} // No need to refresh calendar on task update unless dates changed?
                />
            )}
        </div>
    );
}
