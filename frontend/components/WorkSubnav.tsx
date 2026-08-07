'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getMyProfile } from '../lib/api';

const baseItems = [
    { href: '/tasks', label: 'Queue', description: 'Triage work' },
    { href: '/projects', label: 'Projects', description: 'Coordinate outcomes' },
    { href: '/requests', label: 'Requests', description: 'Decisions and help' },
    { href: '/notes', label: 'Notes', description: 'Handover context' },
    { href: '/operations', label: 'Search', description: 'Across work records' }
];

export default function WorkSubnav() {
    const pathname = usePathname();
    const [canReviewIntake, setCanReviewIntake] = useState(false);

    useEffect(() => {
        getMyProfile()
            .then(result => setCanReviewIntake(['manager', 'admin'].includes(result.user?.role || '')))
            .catch(() => setCanReviewIntake(false));
    }, []);

    const items = canReviewIntake
        ? [...baseItems, { href: '/integration-events', label: 'Intake', description: 'Imported events' }]
        : baseItems;

    return (
        <nav className="mb-5 overflow-x-auto" aria-label="Work navigation">
            <div className="inline-flex min-w-max gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1">
                {items.map(item => {
                    const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`rounded-md px-3 py-2 text-left transition-colors ${active ? 'bg-[var(--brand-soft)] text-[var(--brand-strong)]' : 'text-[#536158] hover:bg-[#f8faf6] hover:text-[#1c231f]'}`}
                            aria-current={active ? 'page' : undefined}
                        >
                            <span className="block text-sm font-semibold">{item.label}</span>
                            <span className="block text-[11px] font-medium">{item.description}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
