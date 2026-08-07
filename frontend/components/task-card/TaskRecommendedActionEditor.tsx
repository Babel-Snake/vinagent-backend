'use client';

export interface RecommendedActionDraft {
  replyBody: string;
  subject: string;
  channel: string;
  action: string;
  recipientEmail: string;
  ccEmail: string;
}

interface TaskRecommendedActionEditorProps {
  draft: RecommendedActionDraft;
  expanded: boolean;
  updating: boolean;
  assigneeLabel: string;
  responseTargetPhone: string;
  emailFallback: string;
  subjectFallback: string;
  onDraftChange: (updates: Partial<RecommendedActionDraft>) => void;
  onExpandedChange: (expanded: boolean) => void;
  onRegenerate: () => void;
  onAction: () => void;
}

export function TaskRecommendedActionEditor({
  draft,
  expanded,
  updating,
  assigneeLabel,
  responseTargetPhone,
  emailFallback,
  subjectFallback,
  onDraftChange,
  onExpandedChange,
  onRegenerate,
  onAction,
}: TaskRecommendedActionEditorProps) {
  const isEmail = draft.channel === 'email';
  const recipientValue = isEmail
    ? draft.recipientEmail
    : draft.channel === 'sms' || draft.channel === 'voice'
      ? responseTargetPhone
      : 'No customer reply';

  function changeChannel(nextChannel: string) {
    if (nextChannel === 'email') {
      onDraftChange({
        channel: nextChannel,
        recipientEmail: emailFallback,
        subject: subjectFallback,
      });
      return;
    }
    onDraftChange({
      channel: nextChannel,
      recipientEmail: '',
      ccEmail: '',
      subject: '',
    });
  }

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-blue-200 shadow-sm">
      <button
        type="button"
        onClick={() => onExpandedChange(!expanded)}
        className="flex w-full items-center justify-between bg-blue-50 p-3 text-left hover:bg-blue-100"
        aria-expanded={expanded}
      >
        <span className="text-sm font-bold text-blue-700">Recommended Current Action</span>
        <span className="text-xs text-blue-400">{expanded ? 'COLLAPSE' : 'EXPAND'}</span>
      </button>
      {expanded && (
        <div className="space-y-3 border-t border-blue-100 bg-white p-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onRegenerate}
              disabled={updating}
              className={`text-xs text-blue-600 hover:underline ${updating ? 'cursor-not-allowed animate-pulse opacity-50' : ''}`}
            >
              {updating ? 'Regenerating...' : 'Regenerate'}
            </button>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-amber-700">
              Internal Routing Recommendation
            </label>
            <textarea
              className="w-full rounded border border-amber-200 bg-white p-2 text-sm text-amber-950"
              rows={3}
              value={draft.action}
              onChange={(event) => onDraftChange({ action: event.target.value })}
              placeholder="No internal action suggested"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-gray-600">From</label>
              <input
                type="text"
                className="w-full rounded border border-gray-300 bg-gray-50 p-2 text-sm text-gray-600"
                value={assigneeLabel}
                readOnly
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-gray-600">To</label>
              <input
                type="text"
                className={`w-full rounded border border-gray-300 p-2 text-sm ${isEmail ? '' : 'bg-gray-50 text-gray-600'}`}
                value={recipientValue}
                onChange={(event) => {
                  if (isEmail) onDraftChange({ recipientEmail: event.target.value });
                }}
                placeholder={isEmail ? 'No email identified' : 'No phone identified'}
                readOnly={!isEmail}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-gray-600">CC</label>
              <input
                type="text"
                className={`w-full rounded border p-2 text-sm ${isEmail ? 'border-gray-300' : 'border-gray-200 bg-gray-50 text-gray-500'}`}
                value={isEmail ? draft.ccEmail : 'Not required'}
                onChange={(event) => {
                  if (isEmail) onDraftChange({ ccEmail: event.target.value });
                }}
                placeholder={isEmail ? 'No CC suggested' : ''}
                readOnly={!isEmail}
              />
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-bold uppercase text-gray-600">
                {draft.channel === 'voice'
                  ? 'Call Notes'
                  : draft.channel === 'none'
                    ? 'Internal Note'
                    : 'Message Preview'}
              </label>
              <textarea
                className="w-full rounded border border-gray-300 p-3 text-sm"
                rows={4}
                value={draft.replyBody}
                onChange={(event) => onDraftChange({ replyBody: event.target.value })}
              />
            </div>
            <div className="w-full space-y-3 lg:w-1/3">
              <label className="mb-1 block text-xs font-bold uppercase text-gray-600">
                Channel
              </label>
              <select
                className="w-full rounded border-gray-300 text-sm"
                value={draft.channel}
                onChange={(event) => changeChannel(event.target.value)}
              >
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="voice">Voice</option>
                <option value="none">None (Internal)</option>
              </select>
              {isEmail && (
                <>
                  <label className="mb-1 block text-xs font-bold uppercase text-gray-600">
                    Subject
                  </label>
                  <input
                    type="text"
                    className="w-full rounded border-gray-300 text-sm"
                    value={draft.subject}
                    onChange={(event) => onDraftChange({ subject: event.target.value })}
                  />
                </>
              )}
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={onAction}
              disabled={updating}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {draft.channel === 'voice'
                ? 'Mark Call Complete'
                : draft.channel === 'none'
                  ? 'Mark Actioned'
                  : 'Action & Send'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
