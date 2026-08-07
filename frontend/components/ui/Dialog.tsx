'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

type DialogProps = {
    open: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    children: ReactNode;
    closeOnBackdrop?: boolean;
    closeOnEscape?: boolean;
    className?: string;
    showHeader?: boolean;
};

const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Dialog({
    open,
    onClose,
    title,
    description,
    children,
    closeOnBackdrop = true,
    closeOnEscape = true,
    className = 'max-w-lg',
    showHeader = true
}: DialogProps) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);
    const titleId = useId();
    const descriptionId = useId();

    useEffect(() => {
        if (!open) return;

        previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const focusInitialControl = () => {
            const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector);
            (focusable?.[0] || dialogRef.current)?.focus();
        };
        const focusTimer = window.setTimeout(focusInitialControl, 0);

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && closeOnEscape) {
                event.preventDefault();
                onClose();
                return;
            }
            if (event.key !== 'Tab') return;

            const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) || []);
            if (focusable.length === 0) {
                event.preventDefault();
                dialogRef.current?.focus();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', onKeyDown);
        return () => {
            window.clearTimeout(focusTimer);
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = previousOverflow;
            previousFocusRef.current?.focus();
        };
    }, [closeOnEscape, onClose, open]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button
                type="button"
                className="absolute inset-0 h-full w-full cursor-default bg-[#1c231f]/60"
                onClick={closeOnBackdrop ? onClose : undefined}
                aria-label={closeOnBackdrop ? `Close ${title}` : undefined}
                tabIndex={-1}
            />
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={showHeader ? undefined : title} aria-labelledby={showHeader ? titleId : undefined} aria-describedby={description && showHeader ? descriptionId : undefined} tabIndex={-1} className={`relative z-10 max-h-[calc(100vh-2rem)] w-full overflow-y-auto rounded-lg bg-[var(--surface)] shadow-2xl ${className}`}>
                {showHeader && (
                    <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
                        <div>
                            <h2 id={titleId} className="text-lg font-semibold text-[#1c231f]">{title}</h2>
                            {description && <p id={descriptionId} className="mt-1 text-sm text-[var(--muted)]">{description}</p>}
                        </div>
                        <button type="button" onClick={onClose} className="icon-button shrink-0" aria-label={`Close ${title}`}>
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 6 12 12M18 6 6 18" /></svg>
                        </button>
                    </div>
                )}
                {children}
            </div>
        </div>
    );
}
