import { PIN_SESSION_KEY } from './apiCore';

const DEFAULT_WINERY_KEY = 'vinagent_default_winery';
const LEGACY_KIOSK_KEY = 'kiosk_config';

export interface DefaultWineryContext {
    wineryId: number;
    wineryName?: string;
}

export interface PinSession {
    token: string;
    expiresAt: string;
    idleTimeoutSeconds: number;
    user: {
        id: number;
        displayName?: string | null;
        email?: string | null;
        role: string;
        actualRole?: string;
        authMode: 'pin' | 'pin_basic';
        wineryId: number;
        wineryName?: string;
    };
}

export function getPinSession(): PinSession | null {
    if (typeof window === 'undefined') return null;

    const raw = window.localStorage.getItem(PIN_SESSION_KEY);
    if (!raw) return null;

    try {
        const session = JSON.parse(raw) as PinSession;
        if (!session.token || !session.expiresAt || new Date(session.expiresAt).getTime() <= Date.now()) {
            clearPinSession();
            return null;
        }
        return session;
    } catch {
        clearPinSession();
        return null;
    }
}

export function savePinSession(session: PinSession) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PIN_SESSION_KEY, JSON.stringify(session));
}

export function clearPinSession() {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(PIN_SESSION_KEY);
}

export function isPinSessionActive() {
    return Boolean(getPinSession());
}

export function getDefaultWineryContext(): DefaultWineryContext | null {
    if (typeof window === 'undefined') return null;

    const raw = window.localStorage.getItem(DEFAULT_WINERY_KEY) || window.localStorage.getItem(LEGACY_KIOSK_KEY);
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw) as { wineryId?: unknown; wineryName?: string; name?: string };
        const wineryId = Number(parsed.wineryId);
        if (!Number.isInteger(wineryId) || wineryId < 1) {
            clearDefaultWineryContext();
            return null;
        }

        const context = {
            wineryId,
            wineryName: parsed.wineryName || parsed.name || undefined
        };
        window.localStorage.setItem(DEFAULT_WINERY_KEY, JSON.stringify(context));
        return context;
    } catch {
        clearDefaultWineryContext();
        return null;
    }
}

export function saveDefaultWineryContext(context: DefaultWineryContext) {
    if (typeof window === 'undefined') return;

    const wineryId = Number(context.wineryId);
    if (!Number.isInteger(wineryId) || wineryId < 1) return;

    window.localStorage.setItem(DEFAULT_WINERY_KEY, JSON.stringify({
        wineryId,
        wineryName: context.wineryName || undefined
    }));
}

export function clearDefaultWineryContext() {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(DEFAULT_WINERY_KEY);
    window.localStorage.removeItem(LEGACY_KIOSK_KEY);
}
