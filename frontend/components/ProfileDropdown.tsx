'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { sendPasswordResetEmail, signOut, updateProfile } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { auth } from '../lib/firebase';
import { clearPinSession, updateMyProfile, type AuthDisplayUser, type UserProfile } from '../lib/api';
import { errorMessage } from '../lib/errors';

interface ProfileDropdownProps {
    user: AuthDisplayUser | null;
    fullProfile: UserProfile | null;
    onProfileUpdated?: (profile: UserProfile) => void;
}

export default function ProfileDropdown({ user, fullProfile, onProfileUpdated }: ProfileDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [displayName, setDisplayName] = useState(fullProfile?.displayName || user?.displayName || '');
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [resetSending, setResetSending] = useState(false);
    const [resetMessage, setResetMessage] = useState('');
    const [resetError, setResetError] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        setDisplayName(fullProfile?.displayName || user?.displayName || '');
    }, [fullProfile?.displayName, user?.displayName]);

    async function handleLogout() {
        clearPinSession();
        await signOut(auth).catch(() => undefined);
        router.push('/login');
    }

    async function handleSaveProfile(e: React.FormEvent) {
        e.preventDefault();
        setSaveError('');
        setSaving(true);

        try {
            const trimmedDisplayName = displayName.trim();
            const updated = await updateMyProfile({ displayName: trimmedDisplayName });

            if (auth.currentUser) {
                await updateProfile(auth.currentUser, { displayName: trimmedDisplayName });
            }

            onProfileUpdated?.(updated.user);
            setDisplayName(trimmedDisplayName);
            setSettingsOpen(false);
        } catch (err: unknown) {
            setSaveError(errorMessage(err, 'Failed to update profile'));
        } finally {
            setSaving(false);
        }
    }

    async function handleSendPasswordReset() {
        const email = accountEmail.trim();
        setResetMessage('');
        setResetError('');

        if (!email) {
            setResetError('No email address is available for this account.');
            return;
        }

        if (isInternalStaffAccount) {
            setResetError('Internal staff access codes are reset from Winery > Staff & Access.');
            return;
        }

        setResetSending(true);
        try {
            await sendPasswordResetEmail(auth, email);
            setResetMessage(`Password reset email sent to ${email}.`);
        } catch (err: unknown) {
            setResetError(errorMessage(err, 'Failed to send password reset email.'));
        } finally {
            setResetSending(false);
        }
    }

    const initial = (fullProfile?.displayName || user?.displayName || user?.email || '?').charAt(0).toUpperCase();
    const profileName = fullProfile?.displayName || user?.displayName || user?.email || 'User';
    const accountEmail = user?.email || fullProfile?.email || '';
    const isInternalStaffAccount = accountEmail.endsWith('@vinagent.internal');

    return (
        <>
            <div className="relative" ref={dropdownRef}>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-[#eef1e8] focus:outline-none"
                    aria-label="Open profile menu"
                >
                    <div className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--brand-soft)] font-bold text-[var(--brand)]">
                        {initial}
                    </div>
                    <span className="hidden max-w-[160px] truncate font-medium text-[#344039] md:block">
                        {profileName}
                    </span>
                    <svg className="h-4 w-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>

                {isOpen && (
                    <div className="absolute right-0 z-50 mt-2 w-64 rounded-md border border-[var(--border)] bg-white shadow-lg">
                        <div className="border-b border-[var(--border)] px-4 py-3">
                            <p className="truncate text-sm font-semibold text-[#1c231f]">{profileName}</p>
                            <p className="truncate text-xs text-[var(--muted)]">{accountEmail}</p>
                            {fullProfile && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    <span className="inline-flex items-center rounded-md bg-[#eef1e8] px-2 py-1 text-xs font-medium text-[#536158]">
                                        {fullProfile.role}
                                    </span>
                                    {fullProfile.authMode?.startsWith('pin') && (
                                        <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                                            PIN session
                                        </span>
                                    )}
                                    {fullProfile.wineryName && (
                                        <span className="inline-flex max-w-full items-center truncate rounded-md bg-[#eef1e8] px-2 py-1 text-xs font-medium text-[#536158]">
                                            {fullProfile.wineryName}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="py-1">
                            <button
                                onClick={() => {
                                    setIsOpen(false);
                                    setResetMessage('');
                                    setResetError('');
                                    setSaveError('');
                                    setSettingsOpen(true);
                                }}
                                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-[#344039] hover:bg-[#f8faf6]"
                            >
                                <svg className="h-4 w-4 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5ZM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.1L14.2 3h-4.4l-.4 2.8a7.5 7.5 0 0 0-2 1.1l-2.4-1-2 3.4 2 1.5A7.5 7.5 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.1l.4 2.8h4.4l.4-2.8a7.5 7.5 0 0 0 2-1.1l2.4 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z" />
                                </svg>
                                Profile settings
                            </button>

                            <div className="my-1 border-t border-[var(--border)]"></div>

                            <button
                                onClick={handleLogout}
                                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12H3m12-7 5 7-5 7M9 5v-.5A1.5 1.5 0 0 1 10.5 3h8A1.5 1.5 0 0 1 20 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 9 19.5V19" />
                                </svg>
                                Log out
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {settingsOpen && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1c231f]/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
                    <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-lg bg-[var(--surface)] shadow-2xl">
                        <div className="flex items-start justify-between border-b border-[var(--border)] px-5 py-4">
                            <div>
                                <h2 className="text-lg font-semibold text-[#1c231f]">Profile settings</h2>
                                <p className="mt-1 text-sm text-[var(--muted)]">Update your account identity shown inside VinAgent.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSettingsOpen(false)}
                                className="icon-button text-[var(--muted)] hover:bg-[#eef1e8]"
                                aria-label="Close profile settings"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleSaveProfile} className="space-y-5 px-5 py-5">
                            <div>
                                <label htmlFor="profileDisplayName" className="block text-sm font-medium text-[#344039]">
                                    Display name
                                </label>
                                <input
                                    id="profileDisplayName"
                                    type="text"
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                    className="form-control mt-2"
                                    minLength={2}
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <ReadOnlyField label="Email" value={accountEmail || 'Not available'} />
                                <ReadOnlyField label="Role" value={fullProfile?.role || 'Not available'} />
                                <ReadOnlyField label="Winery" value={fullProfile?.wineryName || 'Not available'} />
                                <ReadOnlyField label="User ID" value={fullProfile?.id ? String(fullProfile.id) : 'Not available'} />
                            </div>

                            <div className="rounded-md border border-[var(--border)] bg-[#f8faf6] p-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                        <h3 className="text-sm font-semibold text-[#1c231f]">Password</h3>
                                        <p className="mt-1 text-sm text-[var(--muted)]">
                                            {isInternalStaffAccount
                                                ? 'Internal staff access codes are managed by a manager or admin in Winery > Staff & Access.'
                                                : 'Send a password reset email to this account.'}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleSendPasswordReset}
                                        disabled={resetSending || isInternalStaffAccount || !accountEmail}
                                        className="btn-secondary whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {resetSending ? 'Sending...' : 'Send reset email'}
                                    </button>
                                </div>

                                {resetMessage && (
                                    <div className="mt-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
                                        {resetMessage}
                                    </div>
                                )}

                                {resetError && (
                                    <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                                        {resetError}
                                    </div>
                                )}
                            </div>

                            {saveError && (
                                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                                    {saveError}
                                </div>
                            )}

                            <div className="flex justify-end gap-3 border-t border-[var(--border)] pt-4">
                                <button
                                    type="button"
                                    onClick={() => setSettingsOpen(false)}
                                    className="btn-secondary"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving || displayName.trim().length < 2}
                                    className="btn-primary disabled:opacity-50"
                                >
                                    {saving ? 'Saving...' : 'Save profile'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-md border border-[var(--border)] bg-[#f8faf6] px-3 py-2">
            <div className="text-xs font-semibold uppercase text-[var(--muted)]">{label}</div>
            <div className="mt-1 truncate text-sm font-medium text-[#344039]">{value}</div>
        </div>
    );
}
