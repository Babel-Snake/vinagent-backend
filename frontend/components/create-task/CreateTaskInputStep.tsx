import type { InboundMethod, Member, TaskOrigin } from '../../lib/api';
import { labelFromMethod, type ResponseChannel } from './taskAnalysis';
import { EXTERNAL_INBOUND_METHODS, type MemberSelection } from './taskOptions';

interface CreateTaskInputStepProps {
    taskOrigin: TaskOrigin;
    inboundMethod: InboundMethod;
    preferredResponseChannel: ResponseChannel;
    selectedMember: MemberSelection | null;
    memberQuery: string;
    members: Member[];
    searchingMember: boolean;
    requesterName: string;
    requesterEmail: string;
    requesterPhone: string;
    text: string;
    loading: boolean;
    onTaskOriginChange: (origin: TaskOrigin) => void;
    onInboundMethodChange: (method: InboundMethod) => void;
    onResponseChannelChange: (channel: ResponseChannel) => void;
    onMemberQueryChange: (query: string) => void;
    onMemberSelect: (member: Member) => void;
    onMemberRemove: () => void;
    onRequesterNameChange: (value: string) => void;
    onRequesterEmailChange: (value: string) => void;
    onRequesterPhoneChange: (value: string) => void;
    onTextChange: (value: string) => void;
    onClose: () => void;
    onAnalyze: () => void;
}

export function CreateTaskInputStep({
    taskOrigin, inboundMethod, preferredResponseChannel, selectedMember, memberQuery,
    members, searchingMember, requesterName, requesterEmail, requesterPhone, text,
    loading, onTaskOriginChange, onInboundMethodChange, onResponseChannelChange,
    onMemberQueryChange, onMemberSelect, onMemberRemove, onRequesterNameChange,
    onRequesterEmailChange, onRequesterPhoneChange, onTextChange, onClose, onAnalyze
}: CreateTaskInputStepProps) {
    return (
        <>
            <div className="mb-4">
                <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Task Origin</label>
                <div className="grid grid-cols-2 gap-3">
                    {(['EXTERNAL', 'INTERNAL'] as TaskOrigin[]).map((origin) => (
                        <button
                            key={origin}
                            type="button"
                            onClick={() => onTaskOriginChange(origin)}
                            className={`rounded-lg border px-4 py-3 text-left ${taskOrigin === origin ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-gray-200 hover:border-gray-300'}`}
                        >
                            <div className="font-semibold">{origin === 'EXTERNAL' ? 'External Enquiry' : 'Internal Task'}</div>
                            <div className="text-sm text-gray-600">
                                {origin === 'EXTERNAL'
                                    ? 'Customer, member, visitor, or inbound request'
                                    : 'Internal reminder, ops follow-up, or team action'}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Method</label>
                    {taskOrigin === 'EXTERNAL' ? (
                        <select
                            className="w-full text-sm p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            value={inboundMethod}
                            onChange={(event) => onInboundMethodChange(event.target.value as InboundMethod)}
                        >
                            {EXTERNAL_INBOUND_METHODS.map((method) => (
                                <option key={method} value={method}>{labelFromMethod(method)}</option>
                            ))}
                        </select>
                    ) : (
                        <input type="text" className="w-full text-sm p-2 border border-gray-300 rounded bg-gray-50" value="Internal" disabled />
                    )}
                </div>
                {taskOrigin === 'EXTERNAL' && (
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Preferred Response</label>
                        <select
                            className="w-full text-sm p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            value={preferredResponseChannel}
                            onChange={(event) => onResponseChannelChange(event.target.value as ResponseChannel)}
                        >
                            <option value="email">Email</option>
                            <option value="sms">Text / SMS</option>
                            <option value="voice">Phone Call</option>
                            <option value="none">No Customer Reply</option>
                        </select>
                    </div>
                )}
                {taskOrigin === 'EXTERNAL' && (
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Find Existing Customer / Member</label>
                        {selectedMember ? (
                            <div className="flex items-center justify-between rounded border border-gray-200 p-2">
                                <div>
                                    <div className="text-sm font-semibold text-gray-900">{selectedMember.firstName} {selectedMember.lastName}</div>
                                    <div className="text-xs text-gray-500">{selectedMember.phone || selectedMember.email || 'No contact info'}</div>
                                </div>
                                <button type="button" onClick={onMemberRemove} className="text-xs text-red-600 hover:text-red-800 font-medium">Remove</button>
                            </div>
                        ) : (
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Search by name, email, or phone..."
                                    className="w-full text-sm p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    value={memberQuery}
                                    onChange={(event) => onMemberQueryChange(event.target.value)}
                                />
                                {searchingMember && <div className="absolute right-2 top-2 text-xs text-gray-400">Searching...</div>}
                                {members.length > 0 && (
                                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 shadow-lg rounded-md max-h-48 overflow-y-auto">
                                        {members.map((member) => (
                                            <button
                                                key={member.id}
                                                type="button"
                                                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 focus:bg-blue-50 border-b border-gray-100 last:border-0"
                                                onClick={() => onMemberSelect(member)}
                                            >
                                                <div className="font-medium text-gray-900">{member.firstName} {member.lastName}</div>
                                                <div className="text-xs text-gray-500">{member.phone || member.email}</div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {taskOrigin === 'EXTERNAL' && (
                <div className="mb-4 rounded-lg border border-gray-200 p-4 bg-gray-50">
                    <div className="text-sm font-semibold text-gray-900 mb-3">Requester Details</div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <LabeledInput label="Name" value={requesterName} placeholder="Optional if member linked" onChange={onRequesterNameChange} />
                        <LabeledInput label="Email" type="email" value={requesterEmail} placeholder="customer@example.com" onChange={onRequesterEmailChange} />
                        <LabeledInput label="Phone" value={requesterPhone} placeholder="+61..." onChange={onRequesterPhoneChange} />
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                        Prefer linking an existing customer first. If there is no match, use these details. Booking, order, and account tasks can now auto-create and link a member record from this intake data.
                    </p>
                </div>
            )}

            <p className="text-sm text-gray-600 mb-2">
                Describe the issue or request. VinAgent will use the structured intake fields and this description to categorize it.
            </p>
            <textarea
                className="w-full h-36 p-3 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
                placeholder={taskOrigin === 'EXTERNAL'
                    ? 'E.g. A member called asking when their next order is due.'
                    : 'E.g. Need to check cellar door printer stock before the weekend rush.'}
                value={text}
                onChange={(event) => onTextChange(event.target.value)}
            />

            <div className="flex justify-end gap-2">
                <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
                <button
                    onClick={onAnalyze}
                    disabled={loading || !text.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                    {loading ? 'Analyzing...' : 'Analyze & Preview'}
                </button>
            </div>
        </>
    );
}

function LabeledInput({ label, type = 'text', value, placeholder, onChange }: {
    label: string;
    type?: string;
    value: string;
    placeholder: string;
    onChange: (value: string) => void;
}) {
    return (
        <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">{label}</label>
            <input
                type={type}
                className="w-full text-sm p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
            />
        </div>
    );
}
