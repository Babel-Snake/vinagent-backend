import type { ReactNode } from 'react';
import type { Notice } from '../../lib/api';
import AttachmentPanel from '../AttachmentPanel';
import NoticeLinkPicker from '../NoticeLinkPicker';
import { operationalLabel } from '../../lib/operationalPresentation';
import { TaskSection } from './TaskCardSupport';

interface TaskFilesPanelProps {
    taskId: number;
    attachmentLockReason?: string | null;
    canDeleteAllAttachments: boolean;
    currentUserId?: number | null;
    linkedNotices: Notice[];
    canManageNoticeLinks: boolean;
    noticeLinking: boolean;
    onHistoryChanged: () => void;
    onUnlinkNotice: (noticeId: number) => void;
    onLinkNotice: (noticeId: number) => void | Promise<void>;
}

export function TaskFilesPanel({
    taskId, attachmentLockReason, canDeleteAllAttachments, currentUserId,
    linkedNotices, canManageNoticeLinks, noticeLinking,
    onHistoryChanged, onUnlinkNotice, onLinkNotice
}: TaskFilesPanelProps) {
    return (
        <div className="space-y-4">
            <TaskSection title="Attachments" summary="Files and images attached to this task">
                <AttachmentPanel
                    entityType="TASK"
                    entityId={taskId}
                    title="Task Attachments"
                    canUpload={!attachmentLockReason}
                    canDeleteAll={canDeleteAllAttachments}
                    currentUserId={currentUserId}
                    disabledReason={attachmentLockReason || undefined}
                    onChanged={onHistoryChanged}
                />
            </TaskSection>

            <TaskSection
                title="Linked Notices"
                summary={linkedNotices.length > 0 ? `${linkedNotices.length} notice${linkedNotices.length === 1 ? '' : 's'} linked` : 'No notices linked'}
                count={linkedNotices.length}
            >
                {linkedNotices.length === 0 ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">No NoticeBoard context is linked to this task yet.</div>
                ) : (
                    <div className="space-y-2">
                        {linkedNotices.map(notice => (
                            <div key={notice.id} className="rounded-lg border border-slate-200 bg-white p-3">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-sm font-semibold text-slate-900">Notice #{notice.id}</span>
                                            {notice.isPinned && <NoticeBadge className="bg-rose-50 text-rose-700 ring-rose-200">Pinned</NoticeBadge>}
                                            <NoticeBadge className={priorityClasses(notice.priority)}>{notice.priority}</NoticeBadge>
                                            <NoticeBadge className="bg-teal-50 text-teal-800 ring-teal-200">{operationalLabel(notice.category)}</NoticeBadge>
                                        </div>
                                        <div className="mt-1 break-words text-sm text-slate-800">{notice.title}</div>
                                        <div className="mt-1 text-xs text-slate-500">Created {notice.createdAt ? new Date(notice.createdAt).toLocaleDateString() : 'unknown'}</div>
                                    </div>
                                    {canManageNoticeLinks && (
                                        <button type="button" onClick={() => onUnlinkNotice(notice.id)} disabled={noticeLinking} className="btn-secondary shrink-0 text-red-700">Unlink</button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {canManageNoticeLinks && (
                    <div className="mt-3 max-w-xl">
                        <NoticeLinkPicker
                            linkedNoticeIds={linkedNotices.map(notice => notice.id)}
                            onSelect={onLinkNotice}
                            disabled={noticeLinking}
                        />
                    </div>
                )}
            </TaskSection>
        </div>
    );
}

function NoticeBadge({ className, children }: { className: string; children: ReactNode }) {
    return <span className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase ring-1 ${className}`}>{children}</span>;
}

function priorityClasses(priority: Notice['priority']) {
    if (priority === 'urgent') return 'bg-red-50 text-red-700 ring-red-200';
    if (priority === 'important') return 'bg-amber-50 text-amber-800 ring-amber-200';
    return 'bg-slate-50 text-slate-700 ring-slate-200';
}
