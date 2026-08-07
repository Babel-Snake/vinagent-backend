import { involvementLabel, type InvolvementSignal } from '../lib/involvement';

export default function InvolvementBadge({ signal, compact = false }: { signal?: InvolvementSignal | null; compact?: boolean }) {
    if (!signal) return null;
    const direct = signal.kind === 'DIRECT';
    return (
        <span
            className={`involvement-badge ${direct ? 'involvement-badge-direct' : 'involvement-badge-area'} ${compact ? 'involvement-badge-compact' : ''}`}
            title={direct ? 'This item applies directly to you.' : 'This item applies to one of your departments or roles.'}
        >
            <span className="involvement-badge-dot" aria-hidden="true" />
            {involvementLabel(signal)}
        </span>
    );
}
