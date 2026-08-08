'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import ProfileDropdown from './ProfileDropdown';
import NotificationCenter from './NotificationCenter';
import type { AuthDisplayUser, UserProfile } from '../lib/api';

interface NavbarProps {
    user: AuthDisplayUser | null;
    fullProfile: UserProfile | null;
    onProfileUpdated?: (profile: UserProfile) => void;
}

type NavigationItem = {
    href: string;
    label: string;
    icon: string;
    description?: string;
    visible?: boolean;
};

export default function Navbar({ user, fullProfile, onProfileUpdated }: NavbarProps) {
    const pathname = usePathname();
    const [workMenuOpen, setWorkMenuOpen] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const mobileMenuHeadingRef = useRef<HTMLHeadingElement>(null);

    const isManagerOrAdmin = Boolean(fullProfile && ['manager', 'admin'].includes(fullProfile.role));
    const canAccessWineryConfig = Boolean(isManagerOrAdmin || fullProfile?.canAccessWineryConfig);
    const isActive = (path: string) => pathname === path || pathname?.startsWith(`${path}/`);

    const primaryNavItems: NavigationItem[] = [
        { href: '/home', label: 'Home', icon: 'home' },
        { href: '/noticeboard', label: 'Noticeboard', icon: 'noticeboard' },
        { href: '/calendar', label: 'Calendar', icon: 'calendar' },
        { href: '/customers', label: 'Customers', icon: 'customers', visible: isManagerOrAdmin },
        { href: '/analytics', label: 'Insights', icon: 'analytics', visible: isManagerOrAdmin },
        { href: '/usage', label: 'Usage', icon: 'usage', visible: isManagerOrAdmin }
    ].filter(item => item.visible !== false);

    const workItems: NavigationItem[] = [
        { href: '/tasks', label: 'Queue', description: 'Triage and progress team work', icon: 'tasks' },
        { href: '/projects', label: 'Projects', description: 'Coordinate multi-step outcomes', icon: 'projects' },
        { href: '/requests', label: 'Requests', description: 'Track customer and operational requests', icon: 'requests' },
        { href: '/notes', label: 'Notes', description: 'Capture and find working notes', icon: 'notes' },
        { href: '/operations', label: 'Search', description: 'Search across work records', icon: 'search' },
        { href: '/integration-events', label: 'Intake', description: 'Review imported conversations', icon: 'intake', visible: isManagerOrAdmin }
    ].filter(item => item.visible !== false);

    const isWorkActive = workItems.some(item => isActive(item.href));

    useEffect(() => {
        if (!mobileMenuOpen) return;

        mobileMenuHeadingRef.current?.focus();
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setMobileMenuOpen(false);
        };
        document.addEventListener('keydown', closeOnEscape);
        return () => document.removeEventListener('keydown', closeOnEscape);
    }, [mobileMenuOpen]);

    const navLinkClass = (active: boolean) =>
        `inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors ${active
            ? 'bg-[var(--brand-soft)] text-[var(--brand-strong)]'
            : 'text-[#536158] hover:bg-[#eef1e8] hover:text-[#1c231f]'
        }`;

    const closeMenus = () => {
        setWorkMenuOpen(false);
        setMobileMenuOpen(false);
    };

    return (
        <nav className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur" aria-label="Primary navigation">
            <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
                <div className="flex min-h-16 items-center justify-between gap-4 py-3">
                    <div className="flex min-w-0 items-center gap-4">
                        <Link href="/home" className="flex shrink-0 items-center gap-3" aria-label="VinAgent home">
                            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--brand)] text-sm font-bold text-white">VA</span>
                            <span className="leading-tight">
                                <span className="block text-lg font-bold text-[#1c231f]">VinAgent</span>
                                <span className="hidden text-xs font-medium text-[var(--muted)] sm:block">Winery operations</span>
                            </span>
                        </Link>

                        <div className="hidden items-center gap-1 xl:flex">
                            <NavigationLink item={primaryNavItems[0]} active={isActive('/home')} className={navLinkClass(isActive('/home'))} onNavigate={closeMenus} />
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setWorkMenuOpen(open => !open)}
                                    className={navLinkClass(isWorkActive)}
                                    aria-expanded={workMenuOpen}
                                    aria-haspopup="menu"
                                >
                                    <NavIcon name="tasks" />
                                    Work
                                    <svg className={`h-4 w-4 transition-transform ${workMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" /></svg>
                                </button>
                                {workMenuOpen && (
                                    <div className="absolute left-0 z-50 mt-2 w-80 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 shadow-xl" role="menu" aria-label="Work">
                                        {workItems.map(item => <WorkMenuLink key={item.href} item={item} active={isActive(item.href)} onNavigate={closeMenus} />)}
                                    </div>
                                )}
                            </div>
                            {primaryNavItems.slice(1).map(item => <NavigationLink key={item.href} item={item} active={isActive(item.href)} className={navLinkClass(isActive(item.href))} onNavigate={closeMenus} />)}
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                        {fullProfile && (
                            <div className="hidden max-w-[220px] truncate rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium text-[#344039] md:block">{fullProfile.wineryName}</div>
                        )}
                        <div className="hidden sm:block"><NotificationCenter /></div>
                        {canAccessWineryConfig && (
                            <Link href="/winery" className="hidden h-9 items-center gap-2 rounded-md px-2 text-sm font-semibold text-[#536158] hover:bg-[#eef1e8] hover:text-[#1c231f] md:inline-flex" aria-label="Winery configuration">
                                <NavIcon name="winery" />
                                <span className="hidden 2xl:inline">Settings</span>
                            </Link>
                        )}
                        <ProfileDropdown user={user} fullProfile={fullProfile} onProfileUpdated={onProfileUpdated} />
                    </div>
                </div>

                <div className="flex items-center justify-between border-t border-[var(--border)] py-2 xl:hidden">
                    <span className="text-sm font-semibold text-[#344039]">{isWorkActive ? 'Work' : primaryNavItems.find(item => isActive(item.href))?.label || 'VinAgent'}</span>
                    <div className="flex items-center gap-2">
                        <div className="sm:hidden"><NotificationCenter /></div>
                        <button type="button" onClick={() => setMobileMenuOpen(true)} className="btn-secondary px-3 py-1.5 text-sm" aria-expanded={mobileMenuOpen} aria-haspopup="dialog">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                            Menu
                        </button>
                    </div>
                </div>
            </div>

            {mobileMenuOpen && (
                <div className="fixed inset-0 z-50 xl:hidden" role="dialog" aria-modal="true" aria-labelledby="mobile-navigation-title">
                    <button type="button" className="absolute inset-0 h-full w-full cursor-default bg-[#1c231f]/45" onClick={() => setMobileMenuOpen(false)} aria-label="Close navigation" />
                    <div className="absolute inset-x-3 top-3 max-h-[calc(100vh-1.5rem)] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl sm:left-auto sm:right-4 sm:w-[25rem]">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <h2 ref={mobileMenuHeadingRef} id="mobile-navigation-title" tabIndex={-1} className="text-lg font-semibold text-[#1c231f]">Navigation</h2>
                            <button type="button" className="icon-button" onClick={() => setMobileMenuOpen(false)} aria-label="Close navigation">
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 6 12 12M18 6 6 18" /></svg>
                            </button>
                        </div>
                        <div className="space-y-1"><MobileNavLink item={primaryNavItems[0]} active={isActive('/home')} onNavigate={closeMenus} /></div>
                        <div className="my-4 border-t border-[var(--border)]" />
                        <section aria-labelledby="mobile-work-heading">
                            <h3 id="mobile-work-heading" className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Work</h3>
                            <div className="space-y-1">{workItems.map(item => <MobileNavLink key={item.href} item={item} active={isActive(item.href)} onNavigate={closeMenus} />)}</div>
                        </section>
                        <div className="my-4 border-t border-[var(--border)]" />
                        <div className="space-y-1">
                            {primaryNavItems.slice(1).map(item => <MobileNavLink key={item.href} item={item} active={isActive(item.href)} onNavigate={closeMenus} />)}
                            {canAccessWineryConfig && <MobileNavLink item={{ href: '/winery', label: 'Winery configuration', icon: 'winery' }} active={isActive('/winery')} onNavigate={closeMenus} />}
                        </div>
                    </div>
                </div>
            )}
        </nav>
    );
}

function NavigationLink({ item, active, className, onNavigate }: { item: NavigationItem; active: boolean; className: string; onNavigate: () => void }) {
    return <Link href={item.href} className={className} aria-current={active ? 'page' : undefined} onClick={onNavigate}><NavIcon name={item.icon} />{item.label}</Link>;
}

function WorkMenuLink({ item, active, onNavigate }: { item: NavigationItem; active: boolean; onNavigate: () => void }) {
    return (
        <Link href={item.href} role="menuitem" className={`flex gap-3 rounded-md px-3 py-2.5 transition-colors ${active ? 'bg-[var(--brand-soft)] text-[var(--brand-strong)]' : 'text-[#344039] hover:bg-[#f8faf6]'}`} aria-current={active ? 'page' : undefined} onClick={onNavigate}>
            <span className="mt-0.5"><NavIcon name={item.icon} /></span>
            <span><span className="block text-sm font-semibold">{item.label}</span>{item.description && <span className="mt-0.5 block text-xs font-medium text-[var(--muted)]">{item.description}</span>}</span>
        </Link>
    );
}

function MobileNavLink({ item, active, onNavigate }: { item: NavigationItem; active: boolean; onNavigate: () => void }) {
    return (
        <Link href={item.href} className={`flex items-start gap-3 rounded-md px-3 py-2.5 ${active ? 'bg-[var(--brand-soft)] text-[var(--brand-strong)]' : 'text-[#344039] hover:bg-[#f8faf6]'}`} aria-current={active ? 'page' : undefined} onClick={onNavigate}>
            <span className="mt-0.5"><NavIcon name={item.icon} /></span>
            <span><span className="block text-sm font-semibold">{item.label}</span>{item.description && <span className="mt-0.5 block text-xs font-medium text-[var(--muted)]">{item.description}</span>}</span>
        </Link>
    );
}

function NavIcon({ name }: { name: string }) {
    const className = 'h-4 w-4';
    if (name === 'home') return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-8.5Z" /></svg>;
    if (name === 'calendar') return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3M5 11h14M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" /></svg>;
    if (name === 'staff' || name === 'customers') return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 14a4 4 0 1 0-8 0m8 0a6 6 0 0 1 4 5v1H4v-1a6 6 0 0 1 4-5m8 0H8m8-8a4 4 0 1 1-8 0 4 4 0 0 0 8 0Z" /></svg>;
    if (name === 'winery') return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 20h16M6 20V9l6-4 6 4v11M9 20v-6h6v6" /></svg>;
    if (name === 'analytics' || name === 'usage') return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19V9m7 10V5m7 14v-7" /></svg>;
    if (name === 'noticeboard') return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h16M18 10l2 2-2 2" /></svg>;
    if (name === 'search') return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" /></svg>;
    if (name === 'projects') return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h6l2 2h8v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Zm0 4h16" /></svg>;
    if (name === 'intake') return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5h16v5H4V5Zm3 9h10m-7 4h4M8 10l4 3 4-3" /></svg>;
    return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></svg>;
}
