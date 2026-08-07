'use client';

import { useEffect, useState } from 'react';
import Dialog from './Dialog';

type ConfirmDialogProps = {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void | Promise<void>;
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
};

/** A consistent, focus-managed confirmation step for irreversible actions. */
export default function ConfirmDialog({
    open,
    onClose,
    onConfirm,
    title,
    description,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    destructive = false
}: ConfirmDialogProps) {
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setSubmitting(false);
            setError(null);
        }
    }, [open]);

    function requestClose() {
        if (!submitting) onClose();
    }

    async function confirm() {
        setSubmitting(true);
        setError(null);
        try {
            await onConfirm();
            onClose();
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'That action could not be completed.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Dialog
            open={open}
            onClose={requestClose}
            title={title}
            description={description}
            closeOnBackdrop={!submitting}
            closeOnEscape={!submitting}
            className="max-w-md"
        >
            <div className="space-y-4 p-5">
                {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button type="button" onClick={requestClose} disabled={submitting} className="btn-secondary">
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={() => void confirm()}
                        disabled={submitting}
                        className={destructive ? 'btn-secondary border-red-300 bg-red-700 text-white hover:bg-red-800' : 'btn-primary'}
                    >
                        {submitting ? 'Working…' : confirmLabel}
                    </button>
                </div>
            </div>
        </Dialog>
    );
}
