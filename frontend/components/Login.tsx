"use client";
import { useState, useEffect } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useRouter } from 'next/navigation';
import { resolveStaff } from '../lib/api';

export default function Login() {
    const [mode, setMode] = useState<'standard' | 'staff'>('standard');

    // Standard Auth State
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    // Staff Auth State
    const [wineryId, setWineryId] = useState('');
    const [showWineryId, setShowWineryId] = useState(false);
    const [username, setUsername] = useState('');
    const [staffCode, setStaffCode] = useState('');

    const [error, setError] = useState('');
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        try {
            let loginEmail = email;
            let loginPass = password;

            if (mode === 'staff') {
                if (wineryId) {
                    // Manual construction (Fallback)
                    const cleanUsername = username.toLowerCase().replace(/[^a-z0-9]/g, '');
                    loginEmail = `${cleanUsername}.w${wineryId}@vinagent.internal`;
                } else {
                    // Auto-Resolve
                    try {
                        console.log('Resolving staff:', username);
                        const sorted = await resolveStaff(username);
                        loginEmail = sorted.email;
                        console.log('Resolved to:', loginEmail);
                    } catch (resolveErr: any) {
                        if (resolveErr.message === 'AMBIGUOUS') {
                            setShowWineryId(true);
                            throw new Error('Multiple staff found with this name. Please enter your Winery ID.');
                        }
                        throw resolveErr;
                    }
                }
                loginPass = staffCode;
            }

            console.log('Attempting Login:', loginEmail);
            const userCredential = await signInWithEmailAndPassword(auth, loginEmail, loginPass);
            const token = await userCredential.user.getIdToken();
            console.log('Logged in!', token);

            router.push('/');
        } catch (err: any) {
            console.error(err);
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found') {
                setError('Invalid credentials. Please check your details and try again.');
            } else {
                setError(err.message || 'Login failed');
            }
        }
    };

    // Kiosk Mode State
    const [kioskConfig, setKioskConfig] = useState<{ wineryId: number; wineryName: string } | null>(null);

    useEffect(() => {
        const stored = localStorage.getItem('kiosk_config');
        if (stored) {
            try {
                const config = JSON.parse(stored);
                setKioskConfig(config);
                setMode('staff');
                setWineryId(config.wineryId); // Auto-set ID from config
            } catch (e) {
                console.error('Invalid kiosk config', e);
            }
        }
    }, []);

    const exitKiosk = () => {
        if (confirm('Exit Kiosk Mode? This will allow standard login.')) {
            localStorage.removeItem('kiosk_config');
            setKioskConfig(null);
            setMode('standard');
            setWineryId('');
        }
    };

    return (
        <div className="flex min-h-full flex-1 flex-col justify-center px-6 py-12 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-sm">
                {kioskConfig ? (
                    <div className="text-center">
                        <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700 ring-1 ring-inset ring-purple-700/10 mb-4">Kiosk Mode</span>
                        <h2 className="text-2xl font-bold tracking-tight text-gray-900">
                            {kioskConfig.wineryName}
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">Staff Login</p>
                    </div>
                ) : (
                    <h2 className="mt-10 text-center text-2xl/9 font-bold tracking-tight text-gray-900">
                        Sign in to VinAgent
                    </h2>
                )}

                {/* Tabs - Hide in Kiosk Mode */}
                {!kioskConfig && (
                    <div className="mt-6 flex justify-center border-b border-gray-200">
                        <button
                            onClick={() => { setMode('standard'); setError(''); }}
                            className={`pb-2 px-4 text-sm font-medium ${mode === 'standard' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Standard Login
                        </button>
                        <button
                            onClick={() => { setMode('staff'); setError(''); }}
                            className={`pb-2 px-4 text-sm font-medium ${mode === 'staff' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Staff Login
                        </button>
                    </div>
                )}
            </div>

            <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
                <form onSubmit={handleLogin} className="space-y-6">

                    {mode === 'standard' ? (
                        <>
                            <div>
                                <label htmlFor="email" className="block text-sm/6 font-medium text-gray-900">Email address</label>
                                <div className="mt-2">
                                    <input
                                        id="email"
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                                    />
                                </div>
                            </div>
                            <div>
                                <label htmlFor="password" className="block text-sm/6 font-medium text-gray-900">Password</label>
                                <div className="mt-2">
                                    <input
                                        id="password"
                                        type="password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                                    />
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Staff Form: Hide WineryID/Resolve logic if in Kiosk Mode */}
                            {!kioskConfig && (
                                <>
                                    {showWineryId && (
                                        <div>
                                            <label htmlFor="wineryId" className="block text-sm/6 font-medium text-gray-900">Winery ID</label>
                                            <div className="mt-2">
                                                <input
                                                    id="wineryId"
                                                    type="number"
                                                    required
                                                    placeholder="e.g. 1"
                                                    value={wineryId}
                                                    onChange={(e) => setWineryId(e.target.value)}
                                                    className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                                                />
                                            </div>
                                            <p className="mt-1 text-xs text-amber-600">Required because your username is not unique.</p>
                                        </div>
                                    )}
                                </>
                            )}

                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <label htmlFor="username" className="block text-sm/6 font-medium text-gray-900">
                                        {kioskConfig ? 'Your Name' : 'Username'}
                                    </label>
                                    <div className="mt-2">
                                        <input
                                            id="username"
                                            type="text"
                                            required
                                            placeholder="e.g. sarah"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label htmlFor="staffCode" className="block text-sm/6 font-medium text-gray-900">Access Code</label>
                                <div className="mt-2">
                                    <input
                                        id="staffCode"
                                        type="password"
                                        required
                                        value={staffCode}
                                        onChange={(e) => setStaffCode(e.target.value)}
                                        className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                                    />
                                </div>
                            </div>

                            {!kioskConfig && !showWineryId && (
                                <div className="text-right">
                                    <button
                                        type="button"
                                        onClick={() => setShowWineryId(true)}
                                        className="text-xs text-indigo-600 hover:text-indigo-500"
                                    >
                                        Need to specify Winery ID?
                                    </button>
                                </div>
                            )}
                        </>
                    )}

                    {error && (
                        <div className="text-red-500 text-sm font-medium">
                            {error}
                        </div>
                    )}

                    <div>
                        <button
                            type="submit"
                            className="flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm/6 font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                        >
                            {mode === 'standard' ? 'Sign in' : 'Log Staff In'}
                        </button>
                    </div>
                </form>

                {/* Kiosk Exit */}
                {kioskConfig && (
                    <div className="mt-8 text-center border-t border-gray-100 pt-6">
                        <p className="text-xs text-gray-500 mb-2">Need to switch accounts?</p>
                        <button
                            onClick={exitKiosk}
                            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium hover:underline"
                        >
                            Exit Kiosk Mode (Manager Login)
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
