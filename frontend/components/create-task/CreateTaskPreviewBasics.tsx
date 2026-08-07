import type {
    InboundMethod,
    Member,
    OperationalArea,
    Staff,
    TaskOrigin
} from '../../lib/api';
import { labelFromMethod } from './taskAnalysis';
import { EXTERNAL_INBOUND_METHODS, type MemberSelection } from './taskOptions';

interface CreateTaskPreviewBasicsProps {
    taskOrigin: TaskOrigin;
    inboundMethod: InboundMethod;
    selectedMember: MemberSelection | null;
    memberQuery: string;
    members: Member[];
    searchingMember: boolean;
    requesterName: string;
    requesterEmail: string;
    requesterPhone: string;
    text: string;
    title: string;
    assigneeId: number | '';
    assignableStaff: Staff[];
    restrictStaffOwnership: boolean;
    areas: OperationalArea[];
    areaScope: 'ORGANISATION' | 'AREAS';
    primaryAreaId: number | '';
    linkedAreaIds: number[];
    onTaskOriginChange: (value: TaskOrigin) => void;
    onInboundMethodChange: (value: InboundMethod) => void;
    onMemberQueryChange: (value: string) => void;
    onMemberSelect: (member: Member) => void;
    onMemberRemove: () => void;
    onRequesterNameChange: (value: string) => void;
    onRequesterEmailChange: (value: string) => void;
    onRequesterPhoneChange: (value: string) => void;
    onTextChange: (value: string) => void;
    onTitleChange: (value: string) => void;
    onAssigneeChange: (value: number | '') => void;
    onAreaScopeChange: (value: 'ORGANISATION' | 'AREAS') => void;
    onPrimaryAreaChange: (value: number | '') => void;
    onLinkedAreaIdsChange: (value: number[]) => void;
}

export function CreateTaskPreviewBasics({
    taskOrigin, inboundMethod, selectedMember, memberQuery, members, searchingMember,
    requesterName, requesterEmail, requesterPhone, text, title, assigneeId,
    assignableStaff, restrictStaffOwnership, areas, areaScope, primaryAreaId,
    linkedAreaIds, onTaskOriginChange, onInboundMethodChange, onMemberQueryChange,
    onMemberSelect, onMemberRemove, onRequesterNameChange, onRequesterEmailChange,
    onRequesterPhoneChange, onTextChange, onTitleChange, onAssigneeChange,
    onAreaScopeChange, onPrimaryAreaChange, onLinkedAreaIdsChange
}: CreateTaskPreviewBasicsProps) {
    const toggleLinkedArea = (areaId: number, checked: boolean) => {
        onLinkedAreaIdsChange(checked
            ? [...linkedAreaIds, areaId]
            : linkedAreaIds.filter(id => id !== areaId));
    };

    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Task Origin</label>
                    <select
                        className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                        value={taskOrigin}
                        onChange={(event) => onTaskOriginChange(event.target.value as TaskOrigin)}
                    >
                        <option value="EXTERNAL">External Enquiry</option>
                        <option value="INTERNAL">Internal Task</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Method</label>
                    <select
                        className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                        value={inboundMethod}
                        onChange={(event) => onInboundMethodChange(event.target.value as InboundMethod)}
                        disabled={taskOrigin === 'INTERNAL'}
                    >
                        {(taskOrigin === 'INTERNAL' ? ['internal'] : EXTERNAL_INBOUND_METHODS).map((method) => (
                            <option key={method} value={method}>{labelFromMethod(method as InboundMethod)}</option>
                        ))}
                    </select>
                </div>
            </div>

            {taskOrigin === 'EXTERNAL' && (
                <div className="mb-4 p-3 bg-white border border-gray-200 rounded">
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Linked Member</label>
                    {selectedMember ? (
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-sm font-semibold text-gray-900">{selectedMember.firstName} {selectedMember.lastName}</div>
                                <div className="text-xs text-gray-500">{selectedMember.phone || selectedMember.email || 'No contact info'}</div>
                            </div>
                            <button type="button" onClick={onMemberRemove} className="text-xs text-red-600 hover:text-red-800 font-medium">
                                Remove
                            </button>
                        </div>
                    ) : (
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Search by name, email, or phone..."
                                className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
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

            {taskOrigin === 'EXTERNAL' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                    <PreviewInput label="Requester Name" value={requesterName} onChange={onRequesterNameChange} />
                    <PreviewInput label="Requester Email" type="email" value={requesterEmail} onChange={onRequesterEmailChange} />
                    <PreviewInput label="Requester Phone" value={requesterPhone} onChange={onRequesterPhoneChange} />
                </div>
            )}

            <div className="mb-4">
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Task Details / Original Request</label>
                <textarea
                    className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                    rows={4}
                    value={text}
                    onChange={(event) => onTextChange(event.target.value)}
                />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                <PreviewInput label="Title" value={title} onChange={onTitleChange} />
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Assign To</label>
                    <select
                        className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                        value={assigneeId}
                        onChange={(event) => onAssigneeChange(event.target.value ? Number(event.target.value) : '')}
                    >
                        <option value="">Unassigned</option>
                        {assignableStaff.map((staff) => (
                            <option key={staff.id} value={staff.id}>
                                {restrictStaffOwnership ? 'Me' : staff.displayName} {staff.role && `(${staff.role})`}
                            </option>
                        ))}
                    </select>
                    {restrictStaffOwnership && (
                        <p className="mt-1 text-xs text-gray-500">
                            Leave unassigned to send the first workflow step to a manager.
                        </p>
                    )}
                </div>
            </div>

            <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Operational Scope</label>
                        <select
                            className="w-full text-sm p-2 border-gray-300 rounded"
                            value={areaScope}
                            onChange={(event) => onAreaScopeChange(event.target.value as 'ORGANISATION' | 'AREAS')}
                        >
                            <option value="ORGANISATION">Organisation-wide</option>
                            <option value="AREAS" disabled={areas.length === 0}>Selected areas</option>
                        </select>
                    </div>
                    {areaScope === 'AREAS' && (
                        <div>
                            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Primary Area</label>
                            <select
                                className="w-full text-sm p-2 border-gray-300 rounded"
                                value={primaryAreaId}
                                onChange={(event) => onPrimaryAreaChange(event.target.value ? Number(event.target.value) : '')}
                            >
                                <option value="">Choose an area</option>
                                {areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
                            </select>
                        </div>
                    )}
                </div>
                {areaScope === 'AREAS' && areas.length > 1 && (
                    <div className="mt-3">
                        <div className="text-xs font-bold text-gray-700 uppercase mb-1">Linked Areas</div>
                        <div className="flex flex-wrap gap-3">
                            {areas.filter(area => area.id !== Number(primaryAreaId)).map(area => (
                                <label key={area.id} className="flex items-center gap-1.5 text-sm text-gray-700">
                                    <input
                                        type="checkbox"
                                        checked={linkedAreaIds.includes(area.id)}
                                        onChange={(event) => toggleLinkedArea(area.id, event.target.checked)}
                                    />
                                    {area.name}
                                </label>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}

function PreviewInput({ label, type = 'text', value, onChange }: {
    label: string;
    type?: string;
    value: string;
    onChange: (value: string) => void;
}) {
    return (
        <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">{label}</label>
            <input
                type={type}
                className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                value={value}
                onChange={(event) => onChange(event.target.value)}
            />
        </div>
    );
}
