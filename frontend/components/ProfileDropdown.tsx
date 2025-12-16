'use client';

import { useState, useRef, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useRouter } from 'next/navigation';
import { getMyProfile } from '../lib/api';

interface ProfileDropdownProps {
    user: any;
    fullProfile: any;
}

export default function ProfileDropdown({ user, fullProfile }: ProfileDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    async function handleLogout() {
        await signOut(auth);
        router.push('/login');
    }

    async function activateKiosk() {
        // Kiosk logic mirrored from previous page.tsx
        if (!fullProfile) {
            alert("Profile not loaded.");
            return;
        }

        if (confirm(`Are you sure you want to activate Kiosk Mode for "${fullProfile.wineryName}"?\n\nThis device will be locked to this winery for staff login.`)) {
            localStorage.setItem('kiosk_config', JSON.stringify({
                wineryId: fullProfile.wineryId,
                wineryName: fullProfile.wineryName
            }));
            alert('Device Activated! Redirecting to Kiosk Login...');
            await handleLogout();
        }
    }

    const isManagerOrAdmin = fullProfile && ['manager', 'admin'].includes(fullProfile.role);

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 text-sm focus:outline-none"
            >
                <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold border border-indigo-200">
                    {user.displayName ? user.displayName[0].toUpperCase() : user.email[0].toUpperCase()}
                </div>
                <span className="hidden md:block font-medium text-gray-700">
                    {user.displayName || user.email}
                </span>
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-50">
                    <div className="px-4 py-3 border-b border-gray-100">
                        <p className="text-sm text-gray-900 font-medium truncate">{user.displayName || 'User'}</p>
                        <p className="text-xs text-gray-500 truncate">{user.email}</p>
                        {fullProfile && (
                            <span className="mt-1 inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10">
                                {fullProfile.role}
                            </span>
                        )}
                    </div>

                    <div className="py-1">
                        {isManagerOrAdmin && (
                            <button
                                onClick={() => { setIsOpen(false); activateKiosk(); }}
                                className="block w-full text-left px-4 py-2 text-sm text-purple-700 hover:bg-purple-50"
                            >
                                🖥️ Activate Kiosk Mode
                            </button>
                        )}

                        <button
                            onClick={() => { setIsOpen(false); /* Navigate to settings if existed */ }}
                            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 opacity-50 cursor-not-allowed"
                            disabled
                        >
                            ⚙️ Settings (Coming Soon)
                        </button>

                        <div className="border-t border-gray-100 my-1"></div>

                        <button
                            onClick={handleLogout}
                            className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                            Log out
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
