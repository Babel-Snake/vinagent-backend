import type { Staff, WineryContact } from '../../lib/api';
import { isValidEmailAddress, type ResponseChannel } from './taskAnalysis';
import type { MemberSelection } from './taskOptions';

interface CreateTaskResponseEditorProps {
    channel: ResponseChannel;
    recipientEmail: string;
    ccEmail: string;
    replySubject: string;
    suggestedAction: string;
    suggestedReply: string;
    title: string;
    selectedMember: MemberSelection | null;
    requesterEmail: string;
    requesterPhone: string;
    staff: Staff[];
    organisationContacts: WineryContact[];
    onChannelChange: (value: ResponseChannel) => void;
    onRecipientEmailChange: (value: string) => void;
    onCcEmailChange: (value: string) => void;
    onReplySubjectChange: (value: string) => void;
    onSuggestedActionChange: (value: string) => void;
    onSuggestedReplyChange: (value: string) => void;
}

export function CreateTaskResponseEditor({
    channel, recipientEmail, ccEmail, replySubject, suggestedAction, suggestedReply,
    title, selectedMember, requesterEmail, requesterPhone, staff, organisationContacts,
    onChannelChange, onRecipientEmailChange, onCcEmailChange, onReplySubjectChange,
    onSuggestedActionChange, onSuggestedReplyChange
}: CreateTaskResponseEditorProps) {
    const responsePhone = selectedMember?.phone || requesterPhone;
    const responseEmailMissing = channel === 'email' && !recipientEmail.trim();
    const responsePhoneMissing = (channel === 'sms' || channel === 'voice') && !String(responsePhone || '').trim();

    const handleChannelChange = (nextChannel: ResponseChannel) => {
        onChannelChange(nextChannel);
        if (nextChannel !== 'email') {
            onRecipientEmailChange('');
            onCcEmailChange('');
            onReplySubjectChange('');
            return;
        }

        const defaultRecipient = selectedMember?.email
            || (isValidEmailAddress(requesterEmail) ? requesterEmail.trim() : '');
        onRecipientEmailChange(defaultRecipient);
        if (!replySubject && title.trim()) {
            onReplySubjectChange(`Re: ${title.trim()}`);
        }
    };

    return (
        <>
            {channel === 'email' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Direct To (Email)</label>
                        <input
                            type="text"
                            list="org-emails"
                            className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                            placeholder="customer@example.com"
                            value={recipientEmail}
                            onChange={(event) => onRecipientEmailChange(event.target.value)}
                        />
                        {responseEmailMissing && (
                            <p className="mt-1 text-xs text-amber-700">Email response selected, but no email is captured yet.</p>
                        )}
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">CC (Email)</label>
                        <input
                            type="text"
                            list="org-emails"
                            className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                            placeholder="manager@example.com, team@example.com"
                            value={ccEmail}
                            onChange={(event) => onCcEmailChange(event.target.value)}
                        />
                    </div>
                </div>
            ) : channel === 'sms' || channel === 'voice' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                            {channel === 'sms' ? 'Reply To (SMS)' : 'Reply To (Phone)'}
                        </label>
                        <input
                            type="text"
                            className="w-full text-sm p-2 border-gray-300 rounded bg-gray-50 text-gray-700"
                            value={responsePhone || ''}
                            placeholder="No phone captured"
                            readOnly
                        />
                        {responsePhoneMissing && (
                            <p className="mt-1 text-xs text-amber-700">
                                {channel === 'sms' ? 'SMS response selected' : 'Phone call selected'}, but no phone number is captured yet.
                            </p>
                        )}
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Email Fields</label>
                        <div className="w-full text-sm p-2 border border-gray-200 rounded bg-gray-50 text-gray-500">
                            Not required for {channel === 'sms' ? 'SMS' : 'phone'} response.
                        </div>
                    </div>
                </div>
            ) : (
                <div className="mb-3 rounded border border-gray-200 bg-white p-3 text-sm text-gray-600">
                    No customer response is planned for this task.
                </div>
            )}

            <datalist id="org-emails">
                {staff.map((staffMember) => staffMember.email && (
                    <option key={`staff-${staffMember.id}`} value={staffMember.email}>{staffMember.displayName} (Staff)</option>
                ))}
                {organisationContacts.map((contact) => contact.email && (
                    <option key={`org-${contact.id}`} value={contact.email}>{contact.name} ({contact.role})</option>
                ))}
            </datalist>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Reply Channel</label>
                    <select
                        className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                        value={channel || 'none'}
                        onChange={(event) => handleChannelChange(event.target.value as ResponseChannel)}
                    >
                        <option value="email">Email</option>
                        <option value="sms">SMS</option>
                        <option value="voice">Voice</option>
                        <option value="none">None / Internal</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Reply Subject</label>
                    <input
                        type="text"
                        className={`w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 ${channel === 'email' ? '' : 'bg-gray-50 text-gray-500'}`}
                        value={replySubject}
                        onChange={(event) => onReplySubjectChange(event.target.value)}
                        disabled={channel !== 'email'}
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Internal Action</label>
                    <textarea
                        className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                        rows={4}
                        value={suggestedAction}
                        onChange={(event) => onSuggestedActionChange(event.target.value)}
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                        {channel === 'voice' ? 'Call Notes' : channel === 'none' ? 'Internal Note' : 'Reply Draft'}
                    </label>
                    <textarea
                        className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                        rows={4}
                        value={suggestedReply}
                        onChange={(event) => onSuggestedReplyChange(event.target.value)}
                    />
                </div>
            </div>
        </>
    );
}
