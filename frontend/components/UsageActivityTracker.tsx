'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { recordUsageActivity } from '../lib/usageApi';

const HEARTBEAT_MS = 60_000;
const IDLE_AFTER_MS = 5 * 60_000;
const ROUTE_GROUPS = new Set([
    'analytics', 'calendar', 'customers', 'files', 'integration-events', 'noticeboard',
    'operations', 'projects', 'staff', 'tasks', 'usage', 'winery'
]);

function routeGroupFor(pathname: string) {
    const candidate = pathname.split('/').filter(Boolean)[0] || 'other';
    if (candidate === 'customers') return 'members';
    if (candidate === 'files') return 'attachments';
    if (candidate === 'noticeboard') return 'notifications';
    return ROUTE_GROUPS.has(candidate) ? candidate : 'other';
}

export default function UsageActivityTracker() {
    const pathname = usePathname();
    const pathnameRef = useRef(pathname);

    useEffect(() => {
        pathnameRef.current = pathname;
    }, [pathname]);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.crypto?.randomUUID !== 'function') return;

        const sessionId = window.crypto.randomUUID();
        let sequence = 0;
        let lastInteractionAt = Date.now();
        let lastTickAt = Date.now();

        const markInteraction = () => {
            lastInteractionAt = Date.now();
        };

        const resetTick = () => {
            lastTickAt = Date.now();
        };

        const heartbeat = () => {
            const now = Date.now();
            const eligible = document.visibilityState === 'visible'
                && document.hasFocus()
                && now - lastInteractionAt <= IDLE_AFTER_MS;
            const engagedSeconds = Math.min(60, Math.max(0, Math.floor((now - lastTickAt) / 1000)));
            lastTickAt = now;
            if (!eligible || engagedSeconds === 0) return;

            const currentSequence = sequence;
            sequence += 1;
            void recordUsageActivity({
                sessionId,
                sequence: currentSequence,
                engagedSeconds,
                routeGroup: routeGroupFor(pathnameRef.current)
            }).catch(() => {
                // Usage measurement must never interrupt the staff workflow.
            });
        };

        const events: Array<keyof WindowEventMap> = ['click', 'keydown', 'mousemove', 'touchstart', 'scroll'];
        events.forEach(eventName => window.addEventListener(eventName, markInteraction, { passive: true }));
        document.addEventListener('visibilitychange', resetTick);
        window.addEventListener('focus', resetTick);
        window.addEventListener('blur', resetTick);
        const interval = window.setInterval(heartbeat, HEARTBEAT_MS);

        return () => {
            window.clearInterval(interval);
            events.forEach(eventName => window.removeEventListener(eventName, markInteraction));
            document.removeEventListener('visibilitychange', resetTick);
            window.removeEventListener('focus', resetTick);
            window.removeEventListener('blur', resetTick);
        };
    }, []);

    return null;
}
