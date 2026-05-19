'use client';

import { useState, useEffect, useRef } from 'react';
import CreateStaffModal from '../../../components/CreateStaffModal';
import {
    deleteStaff,
    getWineryFull,
    listStaff,
    resetStaffAccessCode,
    updateStaff,
    updateWinerySettings,
    type Staff,
    type Winery
} from '../../../lib/api';

interface StaffManagementProps {
    embedded?: boolean;
    winery?: Winery | null;
    onSettingsUpdated?: () => void;
}

const DEFAULT_AUTH_CONFIG = {
    pinLoginEnabled: false,
    allowManagerBasicPin: false,
    pinIdleTimeoutSeconds: 300,
    pinSessionHours: 8,
    pinMaxAttempts: 5,
    pinLockoutMinutes: 5
};

export function StaffManagement({ embedded = false, winery: wineryFromProps = null, onSettingsUpdated }: StaffManagementProps) {
    const [showStaffModal, setShowStaffModal] = useState(false);
    const [users, setUsers] = useState<Staff[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [authConfig, setAuthConfig] = useState(DEFAULT_AUTH_CONFIG);
    const [settingsSaving, setSettingsSaving] = useState(false);
    const [settingsError, setSettingsError] = useState('');
    const [settingsSuccess, setSettingsSuccess] = useState('');

    // Menu state
    const [openMenuId, setOpenMenuId] = useState<number | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Edit state
    const [editingUser, setEditingUser] = useState<Staff | null>(null);
    const [editName, setEditName] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [editRole, setEditRole] = useState('staff');
    const [editIsActive, setEditIsActive] = useState(true);
    const [editResponsibilities, setEditResponsibilities] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Delete state
    const [deletingUser, setDeletingUser] = useState<Staff | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Access code reset state
    const [resettingUser, setResettingUser] = useState<Staff | null>(null);
    const [resetAccessCode, setResetAccessCode] = useState('');
    const [resetPin, setResetPin] = useState('');
    const [clearPin, setClearPin] = useState(false);
    const [resetAccessCodeError, setResetAccessCodeError] = useState('');
    const [resetAccessCodeSuccess, setResetAccessCodeSuccess] = useState<{ password?: string; pin?: string; clearedPin?: boolean } | null>(null);
    const [isResettingAccessCode, setIsResettingAccessCode] = useState(false);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpenMenuId(null);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        async function loadStaff() {
            try {
                const [data, wineryData] = await Promise.all([
                    listStaff(),
                    wineryFromProps ? Promise.resolve(wineryFromProps) : getWineryFull()
                ]);
                setUsers(data);
                setAuthConfig({
                    ...DEFAULT_AUTH_CONFIG,
                    ...(wineryData?.settings?.authConfig || {})
                });
            } catch (err: any) {
                setError(err.message || 'Failed to load staff');
            } finally {
                setLoading(false);
            }
        }
        loadStaff();
    }, [wineryFromProps]);

    const toggleMenu = (userId: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setOpenMenuId(openMenuId === userId ? null : userId);
    };

    const handleEditClick = (user: Staff) => {
        setEditingUser(user);
        setEditName(user.displayName || '');
        setEditEmail(user.email || '');
        setEditRole(user.role || 'staff');
        setEditIsActive(user.isActive ?? true);
        setEditResponsibilities(user.responsibilities || '');
        setOpenMenuId(null);
    };

    const handleDeleteClick = (user: Staff) => {
        setDeletingUser(user);
        setOpenMenuId(null);
    };

    const handleResetAccessCodeClick = (user: Staff) => {
        setResettingUser(user);
        setResetAccessCode('');
        setResetPin('');
        setClearPin(false);
        setResetAccessCodeError('');
        setResetAccessCodeSuccess(null);
        setOpenMenuId(null);
    };

    const updateAuthConfigField = (field: keyof typeof DEFAULT_AUTH_CONFIG, value: boolean | number) => {
        setSettingsSuccess('');
        setSettingsError('');
        setAuthConfig(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleSaveAuthConfig = async () => {
        setSettingsSaving(true);
        setSettingsError('');
        setSettingsSuccess('');

        try {
            const cleanConfig = {
                pinLoginEnabled: Boolean(authConfig.pinLoginEnabled),
                allowManagerBasicPin: Boolean(authConfig.allowManagerBasicPin),
                pinIdleTimeoutSeconds: Math.max(60, Math.min(3600, Number(authConfig.pinIdleTimeoutSeconds) || 300)),
                pinSessionHours: Math.max(1, Math.min(24, Number(authConfig.pinSessionHours) || 8)),
                pinMaxAttempts: Math.max(3, Math.min(10, Number(authConfig.pinMaxAttempts) || 5)),
                pinLockoutMinutes: Math.max(1, Math.min(60, Number(authConfig.pinLockoutMinutes) || 5))
            };
            const updated = await updateWinerySettings({ authConfig: cleanConfig });
            setAuthConfig({
                ...DEFAULT_AUTH_CONFIG,
                ...(updated?.data?.authConfig || cleanConfig)
            });
            setSettingsSuccess('PIN login settings saved.');
            onSettingsUpdated?.();
        } catch (err: any) {
            setSettingsError(err.message || 'Failed to save PIN login settings');
        } finally {
            setSettingsSaving(false);
        }
    };

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingUser) return;

        setIsSaving(true);
        try {
            const updated = await updateStaff(editingUser.id, {
                displayName: editName,
                email: editEmail,
                role: editRole,
                isActive: editIsActive,
                responsibilities: editResponsibilities
            });
            setUsers(users.map(u => u.id === updated.id ? { ...u, ...updated } : u));
            setEditingUser(null);
        } catch (err: any) {
            alert(err.message || 'Failed to update staff');
        } finally {
            setIsSaving(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!deletingUser) return;

        setIsDeleting(true);
        try {
            await deleteStaff(deletingUser.id);
            setUsers(users.filter(u => u.id !== deletingUser.id));
            setDeletingUser(null);
        } catch (err: any) {
            alert(err.message || 'Failed to delete staff');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleResetAccessCode = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!resettingUser) return;

        const code = resetAccessCode.trim();
        const pin = resetPin.trim();
        setResetAccessCodeError('');
        setResetAccessCodeSuccess(null);

        if (!code && !pin && !clearPin) {
            setResetAccessCodeError('Enter an access code, enter a quick PIN, or choose to clear the current PIN.');
            return;
        }

        if (code && code.length < 8) {
            setResetAccessCodeError('Access code must be at least 8 characters.');
            return;
        }
        if (code && !/\d/.test(code)) {
            setResetAccessCodeError('Access code must include at least one number.');
            return;
        }
        if (pin && !/^[A-Za-z0-9]{4,12}$/.test(pin)) {
            setResetAccessCodeError('Quick PIN must be 4 to 12 letters or numbers.');
            return;
        }

        setIsResettingAccessCode(true);
        try {
            const updated = await resetStaffAccessCode(resettingUser.id, {
                password: code || undefined,
                pin: clearPin ? undefined : pin || undefined,
                clearPin
            });
            setUsers(users.map(u => u.id === updated.id ? { ...u, ...updated } : u));
            setResetAccessCodeSuccess({
                password: code || undefined,
                pin: clearPin ? undefined : pin || undefined,
                clearedPin: clearPin
            });
        } catch (err: any) {
            setResetAccessCodeError(err.message || 'Failed to reset access code');
        } finally {
            setIsResettingAccessCode(false);
        }
    };

    return (
        <div className={embedded ? 'space-y-5' : 'page-shell'} onClick={() => setOpenMenuId(null)}>
            <div className={embedded ? 'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between' : 'page-header'}>
                <div>
                    {embedded ? (
                        <h2 className="text-lg font-semibold text-[#1c231f]">Staff & Access</h2>
                    ) : (
                        <h1 className="text-2xl font-bold text-[#1c231f]">Staff management</h1>
                    )}
                    <p className={embedded ? 'mt-1 text-sm text-[var(--muted)]' : 'page-kicker'}>
                        Manage login access, roles, responsibilities, and operational coverage.
                    </p>
                </div>
                <button
                    onClick={() => setShowStaffModal(true)}
                    className="btn-primary"
                >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m7-7H5" />
                    </svg>
                    Add Staff
                </button>
            </div>

            <section className="rounded-md border border-[var(--border)] bg-[#f8faf6] p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <h3 className="text-sm font-semibold uppercase text-[#344039]">PIN Login</h3>
                        <p className="mt-1 text-sm text-[var(--muted)]">
                            Optional quick access for staff devices. Full manager and admin access still requires manager login.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleSaveAuthConfig}
                        disabled={settingsSaving}
                        className="btn-primary justify-center disabled:opacity-50"
                    >
                        {settingsSaving ? 'Saving...' : 'Save PIN Settings'}
                    </button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <label className="flex items-center justify-between gap-4 rounded-md border border-[var(--border)] bg-white px-3 py-3">
                        <span>
                            <span className="block text-sm font-medium text-[#344039]">Enable quick PIN</span>
                            <span className="block text-xs text-[var(--muted)]">Allows PIN login for assigned staff PINs.</span>
                        </span>
                        <input
                            type="checkbox"
                            checked={authConfig.pinLoginEnabled}
                            onChange={e => updateAuthConfigField('pinLoginEnabled', e.target.checked)}
                            className="h-4 w-4"
                        />
                    </label>

                    <label className="flex items-center justify-between gap-4 rounded-md border border-[var(--border)] bg-white px-3 py-3">
                        <span>
                            <span className="block text-sm font-medium text-[#344039]">Manager basic PIN</span>
                            <span className="block text-xs text-[var(--muted)]">Managers using PIN see the staff view.</span>
                        </span>
                        <input
                            type="checkbox"
                            checked={authConfig.allowManagerBasicPin}
                            onChange={e => updateAuthConfigField('allowManagerBasicPin', e.target.checked)}
                            className="h-4 w-4"
                        />
                    </label>

                    <label className="rounded-md border border-[var(--border)] bg-white px-3 py-3">
                        <span className="block text-sm font-medium text-[#344039]">Idle lock</span>
                        <div className="mt-2 flex items-center gap-2">
                            <input
                                type="number"
                                min={1}
                                max={60}
                                value={Math.round(authConfig.pinIdleTimeoutSeconds / 60)}
                                onChange={e => updateAuthConfigField('pinIdleTimeoutSeconds', Math.max(1, Number(e.target.value) || 1) * 60)}
                                className="form-control w-24"
                            />
                            <span className="text-sm text-[var(--muted)]">minutes</span>
                        </div>
                    </label>

                    <label className="rounded-md border border-[var(--border)] bg-white px-3 py-3">
                        <span className="block text-sm font-medium text-[#344039]">Session length</span>
                        <div className="mt-2 flex items-center gap-2">
                            <input
                                type="number"
                                min={1}
                                max={24}
                                value={authConfig.pinSessionHours}
                                onChange={e => updateAuthConfigField('pinSessionHours', Number(e.target.value) || 8)}
                                className="form-control w-24"
                            />
                            <span className="text-sm text-[var(--muted)]">hours</span>
                        </div>
                    </label>

                    <label className="rounded-md border border-[var(--border)] bg-white px-3 py-3">
                        <span className="block text-sm font-medium text-[#344039]">Failed attempts</span>
                        <input
                            type="number"
                            min={3}
                            max={10}
                            value={authConfig.pinMaxAttempts}
                            onChange={e => updateAuthConfigField('pinMaxAttempts', Number(e.target.value) || 5)}
                            className="form-control mt-2 w-24"
                        />
                    </label>

                    <label className="rounded-md border border-[var(--border)] bg-white px-3 py-3">
                        <span className="block text-sm font-medium text-[#344039]">Lockout</span>
                        <div className="mt-2 flex items-center gap-2">
                            <input
                                type="number"
                                min={1}
                                max={60}
                                value={authConfig.pinLockoutMinutes}
                                onChange={e => updateAuthConfigField('pinLockoutMinutes', Number(e.target.value) || 5)}
                                className="form-control w-24"
                            />
                            <span className="text-sm text-[var(--muted)]">minutes</span>
                        </div>
                    </label>
                </div>

                {settingsError && (
                    <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                        {settingsError}
                    </div>
                )}
                {settingsSuccess && (
                    <div className="mt-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
                        {settingsSuccess}
                    </div>
                )}
            </section>

            {error && (
                <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6 rounded-md">
                    <div className="flex">
                        <div className="flex-shrink-0">
                            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div className="ml-3">
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                    </div>
                </div>
            )}

            <div className="surface-panel overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-[#f8faf6]">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase text-[var(--muted)]">
                                    Member
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase text-[var(--muted)]">
                                    Role
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase text-[var(--muted)]">
                                    Status
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase text-[var(--muted)]">
                                    PIN
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase text-[var(--muted)]">
                                    Contact
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase text-[var(--muted)]">
                                    Responsibilities
                                </th>
                                <th scope="col" className="relative px-6 py-3">
                                    <span className="sr-only">Actions</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-sm text-[var(--muted)]">
                                        Loading staff...
                                    </td>
                                </tr>
                            ) : users.map((user) => (
                                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div className="flex-shrink-0 h-10 w-10">
                                                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-teal-50 text-lg font-bold text-teal-700">
                                                    {(user.displayName || '?').charAt(0).toUpperCase()}
                                                </div>
                                            </div>
                                            <div className="ml-4">
                                                <div className="text-sm font-medium text-gray-900">{user.displayName || 'Unknown Member'}</div>
                                                <div className="text-sm text-gray-500">ID: {user.id}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${(user.role || 'staff') === 'manager'
                                            ? 'bg-purple-100 text-purple-800'
                                            : 'bg-green-100 text-green-800'
                                            }`}>
                                            {((user.role || 'staff').charAt(0).toUpperCase() + (user.role || 'staff').slice(1))}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {user.isActive ?? true ? (
                                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                                                Active
                                            </span>
                                        ) : (
                                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-50 text-gray-500 border border-gray-200">
                                                Inactive
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {user.pinEnabled ? (
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                                user.pinLockedUntil && new Date(user.pinLockedUntil).getTime() > Date.now()
                                                    ? 'bg-amber-50 text-amber-700 border border-amber-100'
                                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                            }`}>
                                                {user.pinLockedUntil && new Date(user.pinLockedUntil).getTime() > Date.now() ? 'Locked' : 'Enabled'}
                                            </span>
                                        ) : (
                                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-50 text-gray-500 border border-gray-200">
                                                Not set
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <a href={`mailto:${user.email}`} className="text-blue-600 hover:text-blue-800 hover:underline">
                                            {user.email}
                                        </a>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate" title={user.responsibilities || ''}>
                                        {user.responsibilities || <span className="italic text-gray-300">Not set</span>}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium relative">
                                        <button
                                            onClick={(e) => toggleMenu(user.id, e)}
                                            className="icon-button text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                            aria-label="Open staff actions"
                                        >
                                            <span className="sr-only">Menu</span>
                                            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                                                <path d="M6 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm6 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm6 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" />
                                            </svg>
                                        </button>

                                        {openMenuId === user.id && (
                                            <div
                                                ref={menuRef}
                                                className="absolute right-8 top-10 mt-2 w-36 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10"
                                            >
                                                <div className="py-1" role="menu" aria-orientation="vertical">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleEditClick(user); }}
                                                        className="w-full text-left block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                                                        role="menuitem"
                                                    >
                                                        Edit Staff
                                                    </button>
                                                    {user.role !== 'admin' && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleResetAccessCodeClick(user); }}
                                                            className="w-full text-left block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                                                            role="menuitem"
                                                        >
                                                        Reset Credentials
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteClick(user); }}
                                                        className="w-full text-left block px-4 py-2 text-sm text-red-700 hover:bg-red-50"
                                                        role="menuitem"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {!loading && users.length === 0 && (
                    <div className="text-center py-12">
                        <p className="text-gray-500 text-sm">No staff members found.</p>
                    </div>
                )}
            </div>

            {showStaffModal && (
                <CreateStaffModal
                    onClose={() => {
                        setShowStaffModal(false);
                        // Refresh list to show newly added user
                        listStaff().then(setUsers).catch(console.error);
                    }}
                />
            )}

            {/* Edit Modal */}
            {editingUser && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg max-w-md w-full p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">Edit Staff Member</h2>
                            <button onClick={() => setEditingUser(null)} className="text-gray-400 hover:text-gray-600">X</button>
                        </div>
                        <form onSubmit={handleSaveEdit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Display Name</label>
                                <input
                                    type="text"
                                    required
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Email Address</label>
                                <input
                                    type="email"
                                    required
                                    value={editEmail}
                                    onChange={e => setEditEmail(e.target.value)}
                                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Role</label>
                                    <select
                                        value={editRole}
                                        onChange={e => setEditRole(e.target.value)}
                                        disabled={editingUser.role === 'admin'} // Cannot edit admin role here
                                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm disabled:bg-gray-100"
                                    >
                                        <option value="staff">Staff</option>
                                        <option value="manager">Manager</option>
                                        <option value="admin" disabled>Admin</option>
                                    </select>
                                </div>
                                <div className="flex items-center pt-6">
                                    <label className="flex items-center space-x-3 cursor-pointer">
                                        <div className="relative">
                                            <input
                                                type="checkbox"
                                                className="sr-only"
                                                checked={editIsActive}
                                                onChange={e => setEditIsActive(e.target.checked)}
                                            />
                                            <div className={`block w-10 h-6 rounded-full transition-colors ${editIsActive ? 'bg-indigo-600' : 'bg-gray-300'}`}></div>
                                            <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${editIsActive ? 'transform translate-x-4' : ''}`}></div>
                                        </div>
                                        <span className="text-sm font-medium text-gray-700">
                                            {editIsActive ? 'Active Account' : 'Account Disabled'}
                                        </span>
                                    </label>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Responsibilities / Coverage</label>
                                <textarea
                                    rows={3}
                                    value={editResponsibilities}
                                    onChange={e => setEditResponsibilities(e.target.value)}
                                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
                                    placeholder="E.g. Handling wine club cancellations, managing shipping logistics..."
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setEditingUser(null)}
                                    className="px-4 py-2 text-gray-700 hover:bg-gray-50 border rounded-md text-sm font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-md text-sm font-medium disabled:opacity-50"
                                >
                                    {isSaving ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Reset Access Code Modal */}
            {resettingUser && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg max-w-md w-full p-6">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h2 className="text-xl font-bold">Update credentials</h2>
                                <p className="mt-1 text-sm text-gray-500">
                                    Set a staff access code or quick PIN for {resettingUser.displayName || 'this staff member'}.
                                </p>
                            </div>
                            <button
                                onClick={() => setResettingUser(null)}
                                className="text-gray-400 hover:text-gray-600"
                                aria-label="Close reset access code"
                            >
                                X
                            </button>
                        </div>

                        {resetAccessCodeSuccess ? (
                            <div className="space-y-5">
                                <div className="rounded-md border border-green-200 bg-green-50 p-4">
                                    <h3 className="text-sm font-semibold text-green-800">Credentials updated</h3>
                                    <p className="mt-1 text-sm text-green-700">
                                        Share any new credentials directly with {resettingUser.displayName || 'the staff member'}.
                                    </p>
                                    {resetAccessCodeSuccess.password && (
                                        <div className="mt-3 rounded-md bg-white px-3 py-2 text-sm text-gray-800">
                                            <strong>Access Code:</strong> {resetAccessCodeSuccess.password}
                                        </div>
                                    )}
                                    {resetAccessCodeSuccess.pin && (
                                        <div className="mt-3 rounded-md bg-white px-3 py-2 text-sm text-gray-800">
                                            <strong>Quick PIN:</strong> {resetAccessCodeSuccess.pin}
                                        </div>
                                    )}
                                    {resetAccessCodeSuccess.clearedPin && (
                                        <div className="mt-3 rounded-md bg-white px-3 py-2 text-sm text-gray-800">
                                            Quick PIN cleared.
                                        </div>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setResettingUser(null)}
                                    className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                                >
                                    Done
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={handleResetAccessCode} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">New access code</label>
                                    <input
                                        type="text"
                                        minLength={8}
                                        value={resetAccessCode}
                                        onChange={e => setResetAccessCode(e.target.value)}
                                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
                                        placeholder="At least 8 characters with one number"
                                    />
                                    <p className="mt-1 text-xs text-gray-500">
                                        Staff use this when quick PIN is disabled for the winery. Use at least 8 characters and include one number.
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Quick PIN</label>
                                    <input
                                        type="text"
                                        value={resetPin}
                                        onChange={e => {
                                            setResetPin(e.target.value);
                                            if (e.target.value.trim()) setClearPin(false);
                                        }}
                                        pattern="[A-Za-z0-9]{4,12}"
                                        disabled={clearPin}
                                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm disabled:bg-gray-100"
                                        placeholder="4 to 12 letters or numbers"
                                    />
                                    <p className="mt-1 text-xs text-gray-500">
                                        PINs must be unique within the winery.
                                    </p>
                                </div>

                                {resettingUser.pinEnabled && (
                                    <label className="flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                                        <input
                                            type="checkbox"
                                            checked={clearPin}
                                            onChange={e => {
                                                setClearPin(e.target.checked);
                                                if (e.target.checked) setResetPin('');
                                            }}
                                            className="h-4 w-4"
                                        />
                                        <span className="text-sm text-gray-700">Clear current quick PIN</span>
                                    </label>
                                )}

                                {resetAccessCodeError && (
                                    <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                                        {resetAccessCodeError}
                                    </div>
                                )}

                                <div className="flex justify-end gap-3 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setResettingUser(null)}
                                        className="px-4 py-2 text-gray-700 hover:bg-gray-50 border rounded-md text-sm font-medium"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isResettingAccessCode}
                                        className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-md text-sm font-medium disabled:opacity-50"
                                    >
                                        {isResettingAccessCode ? 'Saving...' : 'Save Credentials'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deletingUser && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg max-w-sm w-full p-6 text-center">
                        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">Delete {deletingUser.displayName || 'Staff'}?</h3>
                        <p className="text-sm text-gray-500 mb-6">
                            Are you sure you want to permanently delete this staff member? By doing so, they will instantly lose access to the system. This action cannot be undone.
                        </p>
                        <div className="flex justify-center gap-3">
                            <button
                                type="button"
                                onClick={() => setDeletingUser(null)}
                                className="px-4 py-2 w-full text-gray-700 hover:bg-gray-50 border rounded-md text-sm font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmDelete}
                                disabled={isDeleting}
                                className="px-4 py-2 w-full bg-red-600 text-white hover:bg-red-700 rounded-md text-sm font-medium disabled:opacity-50"
                            >
                                {isDeleting ? 'Deleting...' : 'Delete Staff'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function StaffPage() {
    return <StaffManagement />;
}
