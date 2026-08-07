import { auth } from './firebase';

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000') + '/api';
export const PIN_SESSION_KEY = 'vinagent_pin_session';

export async function getAuthToken(): Promise<string> {
    if (auth.currentUser) return `Bearer ${await auth.currentUser.getIdToken()}`;
    if (typeof window === 'undefined') return '';

    try {
        const raw = window.localStorage.getItem(PIN_SESSION_KEY);
        if (!raw) return '';
        const session = JSON.parse(raw) as { token?: string; expiresAt?: string };
        if (!session.token || !session.expiresAt || new Date(session.expiresAt).getTime() <= Date.now()) return '';
        return `Bearer ${session.token}`;
    } catch {
        return '';
    }
}
