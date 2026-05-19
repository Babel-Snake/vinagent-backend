"use client";

import { useEffect, useState } from 'react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { auth } from '../lib/firebase';
import {
    clearDefaultWineryContext,
    clearPinSession,
    getDefaultWineryContext,
    getMyProfile,
    getPinConfig,
    pinLogin,
    saveDefaultWineryContext,
    savePinSession,
    type DefaultWineryContext
} from '../lib/api';

type LoginMode = 'staff' | 'manager';
type StaffMethod = 'pin' | 'access_code';

export default function Login() {
    const [mode, setMode] = useState<LoginMode>('manager');
    const [staffMethod, setStaffMethod] = useState<StaffMethod>('access_code');
    const [wineryContext, setWineryContext] = useState<DefaultWineryContext | null>(null);
    const [configLoading, setConfigLoading] = useState(false);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [staffCode, setStaffCode] = useState('');
    const [pinCode, setPinCode] = useState('');
    const [error, setError] = useState('');

    const router = useRouter();

    useEffect(() => {
        const storedContext = getDefaultWineryContext();
        if (storedContext) {
            setWineryContext(storedContext);
            setMode('staff');
            void loadStaffAccess(storedContext);
        }
    }, []);

    async function loadStaffAccess(context: DefaultWineryContext) {
        setConfigLoading(true);
        setError('');

        try {
            const config = await getPinConfig(context.wineryId);
            const nextContext = {
                wineryId: context.wineryId,
                wineryName: config.wineryName || context.wineryName
            };
            setWineryContext(nextContext);
            saveDefaultWineryContext(nextContext);
            setStaffMethod(config.pinLoginEnabled ? 'pin' : 'access_code');
        } catch (err: any) {
            setStaffMethod('access_code');
            setError(err.message || 'Failed to load staff access settings');
        } finally {
            setConfigLoading(false);
        }
    }

    async function storeProfileWinery() {
        const profile = await getMyProfile();
        if (profile.user?.wineryId) {
            const context = {
                wineryId: profile.user.wineryId,
                wineryName: profile.user.wineryName
            };
            saveDefaultWineryContext(context);
            setWineryContext(context);
        }
    }

    async function handleManagerLogin(event: React.FormEvent) {
        event.preventDefault();
        setError('');

        try {
            clearPinSession();
            const credential = await signInWithEmailAndPassword(auth, email, password);
            await credential.user.getIdToken();
            await storeProfileWinery();
            router.push('/home');
        } catch (err: any) {
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found') {
                setError('Invalid credentials. Please check your details and try again.');
            } else {
                setError(err.message || 'Login failed');
            }
        }
    }

    async function handleStaffAccess(event: React.FormEvent) {
        event.preventDefault();
        setError('');

        if (!wineryContext) {
            setMode('manager');
            setError('A manager needs to sign in on this device before staff access can be used.');
            return;
        }

        try {
            if (staffMethod === 'pin') {
                const session = await pinLogin({
                    wineryId: wineryContext.wineryId,
                    pin: pinCode.trim()
                });
                await signOut(auth).catch(() => undefined);
                savePinSession(session);
                saveDefaultWineryContext({
                    wineryId: wineryContext.wineryId,
                    wineryName: session.user.wineryName || wineryContext.wineryName
                });
                router.push('/home');
                return;
            }

            const cleanUsername = username.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (cleanUsername.length < 3) {
                throw new Error('Enter your staff username.');
            }

            clearPinSession();
            const loginEmail = `${cleanUsername}.w${wineryContext.wineryId}@vinagent.internal`;
            const credential = await signInWithEmailAndPassword(auth, loginEmail, staffCode);
            await credential.user.getIdToken();
            await storeProfileWinery();
            router.push('/home');
        } catch (err: any) {
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found') {
                setError('Invalid credentials. Please check your details and try again.');
            } else {
                setError(err.message || 'Login failed');
            }
        }
    }

    function handleChangeWinery() {
        if (!confirm('Change the winery configured for this device? A manager will need to sign in again.')) return;
        clearPinSession();
        clearDefaultWineryContext();
        setWineryContext(null);
        setPinCode('');
        setUsername('');
        setStaffCode('');
        setMode('manager');
        setError('');
    }

    const wineryName = wineryContext?.wineryName || 'Configured winery';
    const staffMethodLabel = staffMethod === 'pin' ? 'Quick PIN' : 'Staff access code';

    return (
        <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-10">
            <div className="w-full max-w-md">
                <div className="text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-[var(--brand)] text-sm font-bold text-white">
                        VA
                    </div>
                    <h2 className="text-2xl/9 font-bold text-[#1c231f]">
                        {mode === 'staff' && wineryContext ? wineryName : 'Sign in to VinAgent'}
                    </h2>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                        {mode === 'staff' && wineryContext ? staffMethodLabel : 'Manager and admin access'}
                    </p>
                </div>

                {wineryContext && (
                    <div className="mt-6 flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm">
                        <span className="min-w-0 truncate font-medium text-[#344039]">{wineryName}</span>
                        <button
                            type="button"
                            onClick={handleChangeWinery}
                            className="shrink-0 text-sm font-medium text-[var(--accent)] hover:text-teal-900"
                        >
                            Change winery
                        </button>
                    </div>
                )}

                <div className="surface-panel mt-6 p-6">
                    {mode === 'staff' && wineryContext ? (
                        <form onSubmit={handleStaffAccess} className="space-y-6">
                            {configLoading ? (
                                <div className="py-8 text-center text-sm text-[var(--muted)]">Loading staff access...</div>
                            ) : staffMethod === 'pin' ? (
                                <div>
                                    <label htmlFor="pinCode" className="block text-sm/6 font-medium text-[#344039]">Quick PIN</label>
                                    <div className="mt-2">
                                        <input
                                            id="pinCode"
                                            type="password"
                                            inputMode="text"
                                            autoFocus
                                            required
                                            pattern="[A-Za-z0-9]{4,12}"
                                            value={pinCode}
                                            onChange={(e) => setPinCode(e.target.value)}
                                            className="form-control text-center text-lg"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div>
                                        <label htmlFor="username" className="block text-sm/6 font-medium text-[#344039]">Username</label>
                                        <div className="mt-2">
                                            <input
                                                id="username"
                                                type="text"
                                                autoFocus
                                                required
                                                placeholder="e.g. sarah"
                                                value={username}
                                                onChange={(e) => setUsername(e.target.value)}
                                                className="form-control"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label htmlFor="staffCode" className="block text-sm/6 font-medium text-[#344039]">Access Code</label>
                                        <div className="mt-2">
                                            <input
                                                id="staffCode"
                                                type="password"
                                                required
                                                value={staffCode}
                                                onChange={(e) => setStaffCode(e.target.value)}
                                                className="form-control"
                                            />
                                        </div>
                                    </div>
                                </>
                            )}

                            {error && (
                                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={configLoading}
                                className="btn-primary w-full justify-center disabled:opacity-50"
                            >
                                {staffMethod === 'pin' ? 'Unlock' : 'Log in'}
                            </button>

                            <div className="border-t border-[var(--border)] pt-4 text-center">
                                <button
                                    type="button"
                                    onClick={() => { setMode('manager'); setError(''); }}
                                    className="text-sm font-medium text-[var(--accent)] hover:text-teal-900"
                                >
                                    Manager login
                                </button>
                            </div>
                        </form>
                    ) : (
                        <form onSubmit={handleManagerLogin} className="space-y-6">
                            <div>
                                <label htmlFor="email" className="block text-sm/6 font-medium text-[#344039]">Email address</label>
                                <div className="mt-2">
                                    <input
                                        id="email"
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="form-control"
                                    />
                                </div>
                            </div>
                            <div>
                                <label htmlFor="password" className="block text-sm/6 font-medium text-[#344039]">Password</label>
                                <div className="mt-2">
                                    <input
                                        id="password"
                                        type="password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="form-control"
                                    />
                                </div>
                            </div>

                            {error && (
                                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                                    {error}
                                </div>
                            )}

                            <button type="submit" className="btn-primary w-full justify-center">
                                Sign in
                            </button>

                            {wineryContext && (
                                <div className="border-t border-[var(--border)] pt-4 text-center">
                                    <button
                                        type="button"
                                        onClick={() => { setMode('staff'); setError(''); void loadStaffAccess(wineryContext); }}
                                        className="text-sm font-medium text-[var(--accent)] hover:text-teal-900"
                                    >
                                        Staff access
                                    </button>
                                </div>
                            )}
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
