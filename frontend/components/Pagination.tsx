'use client';

import type { Pagination as PaginationMeta } from '../lib/api';

type PaginationProps = {
    pagination: PaginationMeta;
    itemLabel: string;
    onPageChange: (page: number) => void;
    onPageSizeChange?: (pageSize: number) => void;
    pageSizeOptions?: number[];
    disabled?: boolean;
};

export default function Pagination({
    pagination,
    itemLabel,
    onPageChange,
    onPageSizeChange,
    pageSizeOptions = [20, 50, 100],
    disabled = false
}: PaginationProps) {
    const pageSize = pagination.pageSize || pagination.limit || pageSizeOptions[0];
    const total = pagination.total || 0;
    const totalPages = Math.max(pagination.totalPages || 1, 1);
    const page = Math.min(Math.max(pagination.page || 1, 1), totalPages);
    const firstItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const lastItem = total === 0 ? 0 : Math.min(page * pageSize, total);
    const plural = total === 1 ? itemLabel : `${itemLabel}s`;

    return (
        <nav className="mt-4 flex flex-col gap-3 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-center sm:justify-between" aria-label={`${itemLabel} pagination`}>
            <p className="text-sm text-[var(--muted)]" aria-live="polite">
                {total === 0 ? `No ${plural} match this view.` : `Showing ${firstItem}–${lastItem} of ${total} ${plural}`}
            </p>
            <div className="flex flex-wrap items-center gap-2">
                {onPageSizeChange && (
                    <label className="flex items-center gap-2 text-sm font-medium text-[#536158]">
                        <span className="sr-only">{itemLabel} per page</span>
                        <select
                            className="form-control w-auto py-1.5 text-sm"
                            value={pageSize}
                            onChange={(event) => onPageSizeChange(Number(event.target.value))}
                            disabled={disabled}
                            aria-label={`${itemLabel} per page`}
                        >
                            {pageSizeOptions.map(option => <option key={option} value={option}>{option} per page</option>)}
                        </select>
                    </label>
                )}
                <span className="text-sm text-[var(--muted)]">Page {page} of {totalPages}</span>
                <button
                    type="button"
                    className="btn-secondary px-3 py-1.5 text-sm"
                    onClick={() => onPageChange(page - 1)}
                    disabled={disabled || page <= 1}
                >
                    Previous
                </button>
                <button
                    type="button"
                    className="btn-secondary px-3 py-1.5 text-sm"
                    onClick={() => onPageChange(page + 1)}
                    disabled={disabled || page >= totalPages}
                >
                    Next
                </button>
            </div>
        </nav>
    );
}
