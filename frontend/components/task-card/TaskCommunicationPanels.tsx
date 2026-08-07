import type { TaskMessage } from '../../lib/api';
import { displayActionValue } from './taskActivity';

export function TaskConversationTimeline({ messages }: { messages: TaskMessage[] }) {
    const orderedMessages = [...messages].sort((a, b) => (
        new Date(a.receivedAt || a.createdAt).getTime() - new Date(b.receivedAt || b.createdAt).getTime()
    ));
    return (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Communication Timeline</div>
            {orderedMessages.length === 0 ? (
                <div className="text-sm text-slate-600">No linked inbound or outbound messages are attached to this task yet.</div>
            ) : (
                <div className="space-y-3">
                    {orderedMessages.map(message => (
                        <div key={message.id} className="rounded-lg border border-slate-200 bg-white p-3">
                            <div className="flex flex-wrap items-center gap-2 text-xs mb-2">
                                <span className={`px-2 py-1 rounded font-bold uppercase tracking-wider ${message.direction === 'inbound'
                                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'}`}>
                                    {displayActionValue(message.direction)}
                                </span>
                                <span className="px-2 py-1 rounded bg-slate-100 text-slate-700 border border-slate-200 font-bold uppercase tracking-wider">
                                    {displayActionValue(message.source)}
                                </span>
                                <span className="text-slate-500">{new Date(message.receivedAt || message.createdAt).toLocaleString()}</span>
                            </div>
                            {message.subject && <div className="text-sm font-semibold text-slate-900 mb-1">{displayActionValue(message.subject)}</div>}
                            <div className="text-sm text-slate-700 whitespace-pre-wrap">{message.body ? displayActionValue(message.body) : 'No message body captured.'}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function TaskActivityAdvancedToggle({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) {
    return (
        <div className="mb-3 flex justify-end">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
                <span>Advanced</span>
                <input data-task-advanced-toggle="true" type="checkbox" className="sr-only" checked={enabled} onChange={(event) => onChange(event.target.checked)} />
                <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${enabled ? 'bg-slate-900' : 'bg-slate-300'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-4' : 'translate-x-1'}`} />
                </span>
            </label>
        </div>
    );
}
