import type { ManualTaskIntake, Task } from '../../lib/api';
import { humanize, TaskSection } from './TaskCardSupport';

export function TaskCustomerSummary({
  task,
  requesterName,
  manualIntake,
}: {
  task: Task;
  requesterName: string;
  manualIntake: ManualTaskIntake | null;
}) {
  return (
    <TaskSection
      title="Customer"
      summary={task.Member ? `Member #${task.Member.id}` : requesterName}
    >
      <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
        <CustomerValue label="Name" value={requesterName} />
        <CustomerValue
          label="Email"
          value={task.Member?.email || manualIntake?.requesterEmail || 'No email captured'}
          breakWords
        />
        <CustomerValue
          label="Phone"
          value={task.Member?.phone || manualIntake?.requesterPhone || 'No phone captured'}
        />
      </div>
      <div className="mt-3 text-xs text-slate-600">
        {task.Member
          ? 'This task is linked to a customer record.'
          : manualIntake
            ? `Identity status: ${formatIdentityStatus(manualIntake.identityResolutionStatus)}`
            : 'No customer record is linked to this task.'}
      </div>
    </TaskSection>
  );
}

export function TaskRequestSummary({ task }: { task: Task }) {
  const sourcePayload: unknown = task.payload;
  const rawPayloadText = typeof sourcePayload === 'string' ? sourcePayload.trim() : '';
  let raw = sourcePayload;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      /* Render the raw payload below. */
    }
  }
  const payloadRecord =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  const requestSummary =
    typeof payloadRecord?.summary === 'string'
      ? payloadRecord.summary.trim()
      : typeof payloadRecord?.originalText === 'string'
        ? payloadRecord.originalText.trim()
        : rawPayloadText
          ? rawPayloadText
          : String(task.notes || 'Original request and task context');
  return (
    <TaskSection title="Request" summary={requestSummary}>
      {payloadRecord && (payloadRecord.summary || payloadRecord.originalText) ? (
        <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
          {Boolean(payloadRecord.summary) && (
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-100">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">Summary</div>
              <div className="font-medium text-gray-900">{String(payloadRecord.summary)}</div>
            </div>
          )}
          {Boolean(payloadRecord.originalText) && (
            <div className="p-4">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                Original Request
              </div>
              <div className="text-gray-700 whitespace-pre-wrap font-sans">
                {String(payloadRecord.originalText)}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-gray-50 rounded p-3 text-sm font-mono text-gray-700 whitespace-pre-wrap max-h-32 overflow-y-auto">
          {JSON.stringify(raw, null, 2)}
        </div>
      )}
    </TaskSection>
  );
}

function CustomerValue({
  label,
  value,
  breakWords = false,
}: {
  label: string;
  value: string;
  breakWords?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className={`${breakWords ? 'break-words ' : ''}text-slate-900`}>{value}</div>
    </div>
  );
}

function formatIdentityStatus(status?: string | null) {
  return humanize(status, 'Unresolved');
}
