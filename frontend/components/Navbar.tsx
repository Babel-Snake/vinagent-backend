'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ProfileDropdown from './ProfileDropdown';
import NotificationCenter from './NotificationCenter';

interface NavbarProps {
    user: any;
    fullProfile: any;
    onProfileUpdated?: (profile: any) => void;
}

export default function Navbar({ user, fullProfile, onProfileUpdated }: NavbarProps) {
    const pathname = usePathname();

    const isManagerOrAdmin = fullProfile && ['manager', 'admin'].includes(fullProfile.role);

    const isActive = (path: string) => {
        return pathname === path || pathname?.startsWith(path + '/');
    };

    const navItems = [
        { href: '/home', label: 'Home', icon: 'home', visible: true },
        { href: '/tasks', label: 'Tasks', icon: 'tasks', visible: true },
        { href: '/noticeboard', label: 'NoticeBoard', icon: 'noticeboard', visible: true },
        { href: '/integration-events', label: 'Intake', icon: 'intake', visible: isManagerOrAdmin },
        { href: '/calendar', label: 'Calendar', icon: 'calendar', visible: true },
        { href: '/customers', label: 'Customers', icon: 'customers', visible: isManagerOrAdmin },
        { href: '/winery', label: 'Winery', icon: 'winery', visible: isManagerOrAdmin },
        { href: '/analytics', label: 'Analytics', icon: 'analytics', visible: isManagerOrAdmin }
    ].filter(item => item.visible);

    const navLinkClass = (active: boolean) =>
        `inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors ${active
            ? 'bg-[var(--brand-soft)] text-[var(--brand-strong)]'
            : 'text-[#536158] hover:bg-[#eef1e8] hover:text-[#1c231f]'
        }`;

    return (
        <nav className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur">
            <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
                <div className="flex min-h-16 items-center justify-between gap-4 py-3">
                    <div className="flex min-w-0 items-center gap-4">
                        <Link href="/home" className="flex shrink-0 items-center gap-3" aria-label="VinAgent home">
                            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--brand)] text-sm font-bold text-white">
                                VA
                            </span>
                            <span className="leading-tight">
                                <span className="block text-lg font-bold text-[#1c231f]">VinAgent</span>
                                <span className="hidden text-xs font-medium text-[var(--muted)] sm:block">Winery operations</span>
                            </span>
                        </Link>

                        <div className="hidden items-center gap-1 lg:flex">
                            {navItems.map(item => (
                                <Link key={item.href} href={item.href} className={navLinkClass(isActive(item.href))}>
                                    <NavIcon name={item.icon} />
                                    {item.label}
                                </Link>
                            ))}
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                        {fullProfile && (
                            <div className="hidden max-w-[220px] truncate rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium text-[#344039] md:block">
                                {fullProfile.wineryName}
                            </div>
                        )}
                        <div className="hidden sm:block">
                            <NotificationCenter />
                        </div>
                        <ProfileDropdown user={user} fullProfile={fullProfile} onProfileUpdated={onProfileUpdated} />
                    </div>
                </div>

                <div className="flex items-center gap-1 overflow-x-auto border-t border-[var(--border)] py-2 lg:hidden">
                    {navItems.map(item => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`${navLinkClass(isActive(item.href))} shrink-0`}
                        >
                            <NavIcon name={item.icon} />
                            {item.label}
                        </Link>
                    ))}
                    <div className="ml-auto sm:hidden">
                        <NotificationCenter />
                    </div>
                </div>
            </div>
        </nav>
    );
}

function NavIcon({ name }: { name: string }) {
    const className = 'h-4 w-4';
    if (name === 'home') {
        return (
            <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-8.5Z" />
            </svg>
        );
    }
    if (name === 'calendar') {
        return (
            <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3M5 11h14M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
            </svg>
        );
    }
    if (name === 'staff' || name === 'customers') {
        return (
            <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 14a4 4 0 1 0-8 0m8 0a6 6 0 0 1 4 5v1H4v-1a6 6 0 0 1 4-5m8 0H8m8-8a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />
            </svg>
        );
    }
    if (name === 'winery') {
        return (
            <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 20h16M6 20V9l6-4 6 4v11M9 20v-6h6v6" />
            </svg>
        );
    }
    if (name === 'analytics') {
        return (
            <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19V9m7 10V5m7 14v-7" />
            </svg>
        );
    }
    if (name === 'noticeboard') {
        return (
            <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h16M18 10l2 2-2 2" />
            </svg>
        );
    }
    if (name === 'intake') {
        return (
            <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5h16v5H4V5Zm3 9h10m-7 4h4M8 10l4 3 4-3" />
            </svg>
        );
    }
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
        </svg>
    );
}
