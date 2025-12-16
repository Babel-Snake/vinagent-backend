'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ProfileDropdown from './ProfileDropdown';

interface NavbarProps {
    user: any;
    fullProfile: any;
}

export default function Navbar({ user, fullProfile }: NavbarProps) {
    const pathname = usePathname();

    const isManagerOrAdmin = fullProfile && ['manager', 'admin'].includes(fullProfile.role);

    const isActive = (path: string) => {
        return pathname === path || pathname?.startsWith(path + '/');
    };

    const navLinkClass = (active: boolean) =>
        `inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${active
            ? 'border-indigo-500 text-gray-900'
            : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
        }`;

    return (
        <nav className="bg-white border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16">
                    <div className="flex">
                        <div className="flex-shrink-0 flex items-center">
                            <span className="text-xl font-bold text-indigo-600">VinAgent</span>
                        </div>
                        <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                            <Link href="/tasks" className={navLinkClass(isActive('/tasks'))}>
                                Tasks
                            </Link>

                            {isManagerOrAdmin && (
                                <>
                                    <Link href="/staff" className={navLinkClass(isActive('/staff'))}>
                                        Staff
                                    </Link>
                                    <Link href="/analytics" className={navLinkClass(isActive('/analytics'))}>
                                        Analytics
                                    </Link>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="hidden sm:ml-6 sm:flex sm:items-center">
                        {fullProfile && (
                            <div className="mr-4 text-sm text-gray-500 hidden md:block">
                                {fullProfile.wineryName}
                            </div>
                        )}
                        <ProfileDropdown user={user} fullProfile={fullProfile} />
                    </div>
                </div>
            </div>
        </nav>
    );
}
