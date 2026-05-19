'use client';

import { useEffect, useState } from 'react';
import {
    autoclassifyTask,
    createTask,
    searchMembers,
    AutoclassifyResponse,
    TaskStepInput,
    TaskOrigin,
    InboundMethod,
    getUsers,
    getWineryFull,
    Staff
} from '../lib/api';
import CalendarEventPicker, { CalendarEventSelection } from './CalendarEventPicker';

interface CreateTaskModalProps {
    onClose: () => void;
    onCreated: () => void;
    userRole?: string | null;
    currentUserId?: number | null;
}

const CATEGORY_SUBTYPES: Record<string, string[]> = {
    BOOKING: ['BOOKING_NEW', 'BOOKING_CHANGE', 'BOOKING_CANCELLATION', 'BOOKING_INQUIRY', 'OTHER'],
    ORDER: ['ORDER_NEW', 'ORDER_MODIFICATION', 'ORDER_SHIPPING_DELAY', 'ORDER_STATUS', 'ORDER_REPLACEMENT_REQUEST', 'ORDER_POSTPONE', 'OTHER'],
    ACCOUNT: ['ACCOUNT_ADDRESS_CHANGE', 'ACCOUNT_PAYMENT_ISSUE', 'ACCOUNT_LOGIN_ISSUE', 'OTHER'],
    OPERATIONS: ['OPERATIONS_SUPPLY_REQUEST', 'OPERATIONS_MAINTENANCE_REQUEST', 'OPERATIONS_ESCALATION', 'OTHER'],
    GENERAL: ['GENERAL_ENQUIRY', 'GENERAL_FEEDBACK', 'OTHER'],
    INTERNAL: ['INTERNAL_REMINDER', 'INTERNAL_FOLLOWUP', 'OTHER'],
    SYSTEM: ['SYSTEM_ALERT', 'OTHER']
};

const CATEGORY_OPTIONS_BY_ORIGIN: Record<TaskOrigin, string[]> = {
    INTERNAL: ['INTERNAL', 'OPERATIONS', 'GENERAL', 'SYSTEM'],
    EXTERNAL: ['BOOKING', 'ORDER', 'ACCOUNT', 'GENERAL', 'OPERATIONS']
};

const STEP_TYPES = ['INTERNAL', 'CUSTOMER_MESSAGE', 'CUSTOMER_WAIT', 'APPROVAL', 'EXTERNAL', 'EXECUTION', 'FOLLOW_UP', 'OTHER'];
const WAITING_ON = ['NONE', 'STAFF', 'CUSTOMER', 'MANAGER', 'EXTERNAL'];
const EXTERNAL_METHODS: InboundMethod[] = ['email', 'phone', 'sms', 'in_person', 'other'];
type ResponseChannel = 'email' | 'sms' | 'voice' | 'none';

function toDateTimeLocalValue(value?: string | null) {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    const local = new Date(parsed.getTime() - (parsed.getTimezoneOffset() * 60000));
    return local.toISOString().slice(0, 16);
}

function labelFromMethod(method: InboundMethod) {
    switch (method) {
        case 'email':
            return 'Email';
        case 'phone':
            return 'Call';
        case 'sms':
            return 'Text / SMS';
        case 'in_person':
            return 'In Person';
        case 'other':
            return 'Other';
        default:
            return 'Internal';
    }
}

function labelFromResponseChannel(channel: ResponseChannel) {
    switch (channel) {
        case 'email':
            return 'Email';
        case 'sms':
            return 'Text / SMS';
        case 'voice':
            return 'Phone Call';
        default:
            return 'No Customer Reply';
    }
}

function defaultResponseChannelForMethod(method: InboundMethod): ResponseChannel {
    if (method === 'email') return 'email';
    if (method === 'sms') return 'sms';
    if (method === 'phone') return 'voice';
    return 'none';
}

function isValidEmailAddress(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function defaultCategoryForOrigin(origin: TaskOrigin) {
    return origin === 'INTERNAL' ? 'INTERNAL' : 'GENERAL';
}

function defaultSubTypeForCategory(category: string) {
    return (CATEGORY_SUBTYPES[category] || [])[0] || '';
}

function buildContextualAnalysisText({
    taskOrigin,
    inboundMethod,
    requesterName,
    requesterEmail,
    requesterPhone,
    preferredResponseChannel,
    text
}: {
    taskOrigin: TaskOrigin;
    inboundMethod: InboundMethod;
    requesterName: string;
    requesterEmail: string;
    requesterPhone: string;
    preferredResponseChannel: ResponseChannel;
    text: string;
}) {
    const lines = [
        `Task Origin: ${taskOrigin}`,
        `Inbound Method: ${labelFromMethod(inboundMethod)}`,
        `Preferred Response Channel: ${labelFromResponseChannel(preferredResponseChannel)}`
    ];

    if (requesterName.trim()) lines.push(`Requester Name: ${requesterName.trim()}`);
    if (requesterEmail.trim() && isValidEmailAddress(requesterEmail)) lines.push(`Requester Email: ${requesterEmail.trim()}`);
    if (requesterPhone.trim()) lines.push(`Requester Phone: ${requesterPhone.trim()}`);

    lines.push('Request Details:');
    lines.push(text.trim());

    return lines.join('\n');
}

function normalizeSuggestionValue(value: unknown): unknown {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(normalizeSuggestionValue);
    if (value && typeof value === 'object') {
        return Object.keys(value as Record<string, unknown>)
            .sort()
            .reduce<Record<string, unknown>>((acc, key) => {
                acc[key] = normalizeSuggestionValue((value as Record<string, unknown>)[key]);
                return acc;
            }, {});
    }
    return value === undefined ? null : value;
}

function valuesMatch(left: unknown, right: unknown) {
    return JSON.stringify(normalizeSuggestionValue(left)) === JSON.stringify(normalizeSuggestionValue(right));
}

function buildSuggestionReview(original: Record<string, unknown>, final: Record<string, unknown>) {
    const changedFields = Object.keys(final)
        .filter((field) => !valuesMatch(original[field], final[field]))
        .reduce<Record<string, { suggested: unknown; final: unknown }>>((acc, field) => {
            acc[field] = {
                suggested: original[field] ?? null,
                final: final[field] ?? null
            };
            return acc;
        }, {});

    return {
        version: 1,
        source: 'manual_task_creation_preview',
        capturedAt: new Date().toISOString(),
        originalSuggestion: original,
        finalSelection: final,
        changedFields
    };
}

export default function CreateTaskModal({ onClose, onCreated, userRole, currentUserId }: CreateTaskModalProps) {
    const [step, setStep] = useState<'INPUT' | 'PREVIEW'>('INPUT');
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(false);
    const [preview, setPreview] = useState<AutoclassifyResponse | null>(null);

    const [taskOrigin, setTaskOrigin] = useState<TaskOrigin>('EXTERNAL');
    const [inboundMethod, setInboundMethod] = useState<InboundMethod>('email');
    const [requesterName, setRequesterName] = useState('');
    const [requesterEmail, setRequesterEmail] = useState('');
    const [requesterPhone, setRequesterPhone] = useState('');
    const [preferredResponseChannel, setPreferredResponseChannel] = useState<ResponseChannel>(defaultResponseChannelForMethod('email'));
    const [responseChannelTouched, setResponseChannelTouched] = useState(false);

    const [title, setTitle] = useState('');
    const [assigneeId, setAssigneeId] = useState<number | ''>('');
    const [category, setCategory] = useState(defaultCategoryForOrigin('EXTERNAL'));
    const [subType, setSubType] = useState(defaultSubTypeForCategory(defaultCategoryForOrigin('EXTERNAL')));
    const [priority, setPriority] = useState('normal');
    const [sentiment, setSentiment] = useState('NEUTRAL');
    const [suggestedReply, setSuggestedReply] = useState('');
    const [suggestedChannel, setSuggestedChannel] = useState('');
    const [suggestedReplySubject, setSuggestedReplySubject] = useState('');
    const [suggestedAction, setSuggestedAction] = useState('');
    const [recipientEmail, setRecipientEmail] = useState('');
    const [ccEmail, setCcEmail] = useState('');
    const [taskDueAt, setTaskDueAt] = useState('');
    const [payloadJson, setPayloadJson] = useState('{}');
    const [originalSuggestion, setOriginalSuggestion] = useState<Record<string, unknown> | null>(null);
    const [workflowSteps, setWorkflowSteps] = useState<TaskStepInput[]>([]);
    const [selectedCalendarEvents, setSelectedCalendarEvents] = useState<CalendarEventSelection[]>([]);

    const [memberQuery, setMemberQuery] = useState('');
    const [members, setMembers] = useState<any[]>([]);
    const [selectedMember, setSelectedMember] = useState<any>(null);
    const [searchingMember, setSearchingMember] = useState(false);

    const [initialNote, setInitialNote] = useState('');
    const [staffList, setStaffList] = useState<Staff[]>([]);
    const [orgContacts, setOrgContacts] = useState<any[]>([]);
    const [mentionActive, setMentionActive] = useState(false);
    const [mentionQuery, setMentionQuery] = useState('');
    const isStaffUser = userRole === 'staff';
    const assignableStaffList = isStaffUser
        ? staffList.filter((staff) => staff.id === currentUserId)
        : staffList;

    function isAllowedStaffOwner(ownerUserId?: number | '' | null) {
        if (!isStaffUser || !ownerUserId) return true;
        return Number(ownerUserId) === Number(currentUserId);
    }

    function sanitizeStepOwnerForStaff(stepInput: TaskStepInput): TaskStepInput {
        if (isAllowedStaffOwner(stepInput.ownerUserId)) return stepInput;
        return { ...stepInput, ownerUserId: null };
    }

    useEffect(() => {
        let cancelled = false;

        getUsers()
            .then((users) => {
                if (!cancelled) setStaffList(users);
            })
            .catch(() => {
                if (!cancelled) setStaffList([]);
            });

        if (userRole === 'manager' || userRole === 'admin') {
            getWineryFull()
                .then((winery) => {
                    if (!cancelled && winery.contacts) {
                        setOrgContacts(winery.contacts);
                    }
                })
                .catch(() => {
                    if (!cancelled) setOrgContacts([]);
                });
        }

        return () => {
            cancelled = true;
        };
    }, [userRole]);

    useEffect(() => {
        if (!isStaffUser) return;

        if (!isAllowedStaffOwner(assigneeId)) {
            setAssigneeId('');
        }

        setWorkflowSteps((prev) => prev.map(sanitizeStepOwnerForStaff));
    }, [isStaffUser, currentUserId, assigneeId]);

    useEffect(() => {
        const allowedCategories = CATEGORY_OPTIONS_BY_ORIGIN[taskOrigin];
        if (!allowedCategories.includes(category)) {
            const nextCategory = defaultCategoryForOrigin(taskOrigin);
            setCategory(nextCategory);
            setSubType(defaultSubTypeForCategory(nextCategory));
        }

        if (taskOrigin === 'INTERNAL') {
            setInboundMethod('internal');
            setPreferredResponseChannel('none');
            setSuggestedChannel('none');
            setResponseChannelTouched(false);
            setSelectedMember(null);
            setMemberQuery('');
            setMembers([]);
        } else if (inboundMethod === 'internal') {
            setInboundMethod('email');
        }
    }, [taskOrigin, category, inboundMethod]);

    useEffect(() => {
        if (taskOrigin !== 'EXTERNAL' || responseChannelTouched) return;

        const nextChannel = defaultResponseChannelForMethod(inboundMethod);
        setPreferredResponseChannel(nextChannel);
        if (step === 'INPUT') {
            setSuggestedChannel(nextChannel);
        }
    }, [taskOrigin, inboundMethod, responseChannelTouched, step]);

    useEffect(() => {
        if (memberQuery.length > 2 && taskOrigin === 'EXTERNAL') {
            const delay = setTimeout(async () => {
                setSearchingMember(true);
                try {
                    const results = await searchMembers(memberQuery);
                    setMembers(results);
                } catch (e) {
                    console.error(e);
                } finally {
                    setSearchingMember(false);
                }
            }, 300);
            return () => clearTimeout(delay);
        }

        setMembers([]);
    }, [memberQuery, taskOrigin]);

    function validateIntake() {
        if (!text.trim()) return 'Request details are required.';
        if (taskOrigin === 'EXTERNAL') {
            if (!EXTERNAL_METHODS.includes(inboundMethod)) {
                return 'Select how the enquiry came in.';
            }
            const activeResponseChannel = (step === 'PREVIEW' ? suggestedChannel : preferredResponseChannel) || 'none';
            if (activeResponseChannel === 'email' && requesterEmail.trim() && !isValidEmailAddress(requesterEmail)) {
                return 'Requester email must be a valid email address. For phone or SMS follow-up, switch Preferred Response and leave email blank if you do not have one.';
            }
            const hasContact = Boolean(
                selectedMember
                || requesterName.trim()
                || (requesterEmail.trim() && isValidEmailAddress(requesterEmail))
                || requesterPhone.trim()
            );
            if (!hasContact) {
                return 'External tasks need a linked member or at least one requester contact detail.';
            }
        }
        return null;
    }

    async function handleAnalyze() {
        const validationError = validateIntake();
        if (validationError) {
            alert(validationError);
            return;
        }

        setLoading(true);
        try {
            const requesterEmailForAnalysis = requesterEmail.trim() && isValidEmailAddress(requesterEmail)
                ? requesterEmail.trim()
                : '';
            const analysisText = buildContextualAnalysisText({
                taskOrigin,
                inboundMethod,
                requesterName,
                requesterEmail: requesterEmailForAnalysis,
                requesterPhone,
                preferredResponseChannel,
                text
            });
            const result = await autoclassifyTask(analysisText, selectedMember?.id, {
                taskOrigin,
                inboundMethod,
                requesterName: requesterName.trim() || undefined,
                requesterEmail: requesterEmailForAnalysis || undefined,
                requesterPhone: requesterPhone.trim() || undefined,
                suggestedChannel: preferredResponseChannel
            });
            setPreview(result);

            const nextTitle = result.suggestedTitle || `${result.category} - ${result.subType?.replace(/_/g, ' ') || 'Task'}`;
            const suggestedAssigneeId = result.suggestedAssigneeId || '';
            const nextChannel = preferredResponseChannel || defaultResponseChannelForMethod(inboundMethod);
            const nextRecipientEmail = nextChannel === 'email'
                ? result.suggestedRecipientEmail || selectedMember?.email || result.suggestedMember?.email || requesterEmailForAnalysis || ''
                : '';
            const nextCcEmail = nextChannel === 'email' ? result.suggestedCc || '' : '';
            const nextSteps = (result.suggestedSteps || []).map(sanitizeStepOwnerForStaff);
            const nextSubject = result.suggestedReplySubject || (nextChannel === 'email' ? `Re: ${nextTitle}` : '');

            setTitle(nextTitle);
            setAssigneeId(isAllowedStaffOwner(suggestedAssigneeId) ? suggestedAssigneeId : '');
            setCategory(result.category);
            setSubType(result.subType);
            setPriority(result.priority);
            setSentiment(result.sentiment);
            setSuggestedReply(result.suggestedReplyBody || '');
            setSuggestedChannel(nextChannel);
            setSuggestedReplySubject(nextSubject);
            setSuggestedAction(result.suggestedAction || '');
            setRecipientEmail(nextRecipientEmail);
            setCcEmail(nextCcEmail);
            setTaskDueAt('');
            setPayloadJson(JSON.stringify(result.payload || {}, null, 2));
            setWorkflowSteps(nextSteps);
            setOriginalSuggestion({
                taskOrigin,
                inboundMethod,
                requesterName: requesterName.trim() || null,
                requesterEmail: requesterEmailForAnalysis || null,
                requesterPhone: requesterPhone.trim() || null,
                memberId: selectedMember?.id || result.suggestedMember?.id || null,
                title: nextTitle,
                category: result.category,
                subType: result.subType,
                priority: result.priority,
                sentiment: result.sentiment,
                assigneeId: isAllowedStaffOwner(suggestedAssigneeId) ? suggestedAssigneeId || null : null,
                dueAt: null,
                suggestedChannel: nextChannel,
                suggestedReplySubject: nextSubject || null,
                suggestedReplyBody: result.suggestedReplyBody || null,
                suggestedAction: result.suggestedAction || null,
                suggestedRecipientEmail: nextRecipientEmail || null,
                suggestedCc: nextCcEmail || null,
                payload: result.payload || {},
                steps: nextSteps
            });

            if (!selectedMember && result.suggestedMember) {
                setSelectedMember(result.suggestedMember);
            }

            setStep('PREVIEW');
        } catch (err: any) {
            alert('Analysis failed: ' + err.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleConfirm() {
        if (!preview) return;

        const validationError = validateIntake();
        if (validationError) {
            alert(validationError);
            return;
        }

        if (!isAllowedStaffOwner(assigneeId)) {
            alert('Staff can only assign new tasks to themselves or leave them unassigned.');
            return;
        }

        setLoading(true);
        try {
            const safeWorkflowSteps = workflowSteps.map(sanitizeStepOwnerForStaff);
            let editedPayload: Record<string, unknown> = {};

            try {
                const parsedPayload = payloadJson.trim() ? JSON.parse(payloadJson) : {};
                if (!parsedPayload || typeof parsedPayload !== 'object' || Array.isArray(parsedPayload)) {
                    throw new Error('Structured details must be a JSON object.');
                }
                editedPayload = parsedPayload;
            } catch (payloadError: any) {
                console.error('Task preview payload is invalid', payloadError);
                alert('Task preview details are invalid. Please re-run the analysis before creating the task.');
                return;
            }

            const finalChannel = (suggestedChannel || 'none') as ResponseChannel;
            const requesterEmailForSubmit = requesterEmail.trim() && isValidEmailAddress(requesterEmail)
                ? requesterEmail.trim()
                : '';
            const recipientEmailForSubmit = finalChannel === 'email' ? recipientEmail.trim() : '';
            const ccEmailForSubmit = finalChannel === 'email' ? ccEmail.trim() : '';

            if (finalChannel === 'email' && requesterEmail.trim() && !isValidEmailAddress(requesterEmail)) {
                alert('Requester email must be a valid email address. Switch the response channel to Phone or SMS if there is no usable email.');
                return;
            }

            if (finalChannel === 'email' && recipientEmailForSubmit && !isValidEmailAddress(recipientEmailForSubmit)) {
                alert('Direct To must be a valid email address for email responses.');
                return;
            }

            const finalSelection = {
                taskOrigin,
                inboundMethod,
                requesterName: requesterName.trim() || null,
                requesterEmail: requesterEmailForSubmit || null,
                requesterPhone: requesterPhone.trim() || null,
                memberId: selectedMember?.id || null,
                title: title.trim() || null,
                category,
                subType,
                priority,
                sentiment,
                assigneeId: assigneeId === '' ? null : assigneeId,
                dueAt: taskDueAt ? new Date(taskDueAt).toISOString() : null,
                suggestedChannel: finalChannel,
                suggestedReplySubject: finalChannel === 'email' ? suggestedReplySubject.trim() || null : null,
                suggestedReplyBody: suggestedReply || null,
                suggestedAction: suggestedAction.trim() || null,
                suggestedRecipientEmail: recipientEmailForSubmit || null,
                suggestedCc: ccEmailForSubmit || null,
                payload: editedPayload,
                steps: safeWorkflowSteps,
                calendarEventIds: selectedCalendarEvents.map(event => event.id)
            };
            const suggestionReview = originalSuggestion
                ? buildSuggestionReview(originalSuggestion, finalSelection)
                : undefined;
            const finalPayload = {
                ...editedPayload,
                summary: title.trim() || String(editedPayload.summary || preview.payload?.summary || ''),
                originalText: text.trim(),
                ...(suggestionReview ? { aiSuggestionReview: suggestionReview } : {})
            };

            await createTask({
                category,
                subType,
                priority,
                sentiment,
                taskOrigin,
                inboundMethod,
                requesterName: requesterName.trim() || undefined,
                requesterEmail: requesterEmailForSubmit || undefined,
                requesterPhone: requesterPhone.trim() || undefined,
                payload: finalPayload,
                notes: text,
                initialNote: initialNote.trim() || undefined,
                assigneeId: assigneeId === '' ? undefined : assigneeId,
                memberId: selectedMember?.id,
                customerType: taskOrigin === 'EXTERNAL'
                    ? (selectedMember ? 'MEMBER' : 'VISITOR')
                    : 'UNKNOWN',
                suggestedReplyBody: suggestedReply,
                suggestedChannel: finalChannel,
                suggestedReplySubject: finalChannel === 'email' ? suggestedReplySubject.trim() || undefined : undefined,
                suggestedAction: suggestedAction.trim() || undefined,
                suggestedRecipientEmail: recipientEmailForSubmit || undefined,
                suggestedCc: ccEmailForSubmit || undefined,
                dueAt: taskDueAt ? new Date(taskDueAt).toISOString() : undefined,
                steps: safeWorkflowSteps,
                calendarEventIds: selectedCalendarEvents.map(event => event.id)
            });
            onCreated();
        } catch (err: any) {
            alert('Creation failed: ' + err.message);
        } finally {
            setLoading(false);
        }
    }

    const categoryOptions = CATEGORY_OPTIONS_BY_ORIGIN[taskOrigin];
    const responsePhone = selectedMember?.phone || requesterPhone;
    const responseEmailMissing = suggestedChannel === 'email' && !recipientEmail.trim();
    const responsePhoneMissing = (suggestedChannel === 'sms' || suggestedChannel === 'voice') && !String(responsePhone || '').trim();

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full p-6">
                <h2 className="text-xl font-bold mb-4">Create New Task</h2>

                {step === 'INPUT' ? (
                    <>
                        <div className="mb-4">
                            <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Task Origin</label>
                            <div className="grid grid-cols-2 gap-3">
                                {(['EXTERNAL', 'INTERNAL'] as TaskOrigin[]).map((origin) => (
                                    <button
                                        key={origin}
                                        type="button"
                                        onClick={() => setTaskOrigin(origin)}
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
                                        onChange={(e) => setInboundMethod(e.target.value as InboundMethod)}
                                    >
                                        {EXTERNAL_METHODS.map((method) => (
                                            <option key={method} value={method}>{labelFromMethod(method)}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <input
                                        type="text"
                                        className="w-full text-sm p-2 border border-gray-300 rounded bg-gray-50"
                                        value="Internal"
                                        disabled
                                    />
                                )}
                            </div>
                            {taskOrigin === 'EXTERNAL' && (
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Preferred Response</label>
                                    <select
                                        className="w-full text-sm p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        value={preferredResponseChannel}
                                        onChange={(e) => {
                                            const nextChannel = e.target.value as ResponseChannel;
                                            setPreferredResponseChannel(nextChannel);
                                            setSuggestedChannel(nextChannel);
                                            setResponseChannelTouched(true);
                                        }}
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
                                            <button
                                                type="button"
                                                onClick={() => setSelectedMember(null)}
                                                className="text-xs text-red-600 hover:text-red-800 font-medium"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="relative">
                                            <input
                                                type="text"
                                                placeholder="Search by name, email, or phone..."
                                                className="w-full text-sm p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                value={memberQuery}
                                                onChange={(e) => setMemberQuery(e.target.value)}
                                            />
                                            {searchingMember && <div className="absolute right-2 top-2 text-xs text-gray-400">Searching...</div>}
                                            {members.length > 0 && (
                                                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 shadow-lg rounded-md max-h-48 overflow-y-auto">
                                                    {members.map((member) => (
                                                        <button
                                                            key={member.id}
                                                            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 focus:bg-blue-50 border-b border-gray-100 last:border-0"
                                                            onClick={() => {
                                                                setSelectedMember(member);
                                                                setMemberQuery('');
                                                                setMembers([]);
                                                                if (!requesterEmail && member.email) setRequesterEmail(member.email);
                                                                if (!requesterPhone && member.phone) setRequesterPhone(member.phone);
                                                                if (!requesterName) setRequesterName(`${member.firstName} ${member.lastName}`.trim());
                                                            }}
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
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Name</label>
                                        <input
                                            type="text"
                                            className="w-full text-sm p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            value={requesterName}
                                            onChange={(e) => setRequesterName(e.target.value)}
                                            placeholder="Optional if member linked"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Email</label>
                                        <input
                                            type="email"
                                            className="w-full text-sm p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            value={requesterEmail}
                                            onChange={(e) => setRequesterEmail(e.target.value)}
                                            placeholder="customer@example.com"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Phone</label>
                                        <input
                                            type="text"
                                            className="w-full text-sm p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            value={requesterPhone}
                                            onChange={(e) => setRequesterPhone(e.target.value)}
                                            placeholder="+61..."
                                        />
                                    </div>
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
                            onChange={(e) => setText(e.target.value)}
                        />

                        <div className="flex justify-end gap-2">
                            <button
                                onClick={onClose}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAnalyze}
                                disabled={loading || !text.trim()}
                                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                            >
                                {loading ? 'Analyzing...' : 'Analyze & Preview'}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="bg-blue-50 p-4 rounded mb-4 overflow-y-auto max-h-[70vh]">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Task Origin</label>
                                    <select
                                        className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                        value={taskOrigin}
                                        onChange={(e) => setTaskOrigin(e.target.value as TaskOrigin)}
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
                                        onChange={(e) => setInboundMethod(e.target.value as InboundMethod)}
                                        disabled={taskOrigin === 'INTERNAL'}
                                    >
                                        {(taskOrigin === 'INTERNAL' ? ['internal'] : EXTERNAL_METHODS).map((method) => (
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
                                            <button
                                                onClick={() => setSelectedMember(null)}
                                                className="text-xs text-red-600 hover:text-red-800 font-medium"
                                            >
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
                                                onChange={(e) => setMemberQuery(e.target.value)}
                                            />
                                            {searchingMember && <div className="absolute right-2 top-2 text-xs text-gray-400">Searching...</div>}
                                            {members.length > 0 && (
                                                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 shadow-lg rounded-md max-h-48 overflow-y-auto">
                                                    {members.map((member) => (
                                                        <button
                                                            key={member.id}
                                                            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 focus:bg-blue-50 border-b border-gray-100 last:border-0"
                                                            onClick={() => {
                                                                setSelectedMember(member);
                                                                setMemberQuery('');
                                                                setMembers([]);
                                                            }}
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
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Requester Name</label>
                                        <input
                                            type="text"
                                            className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                            value={requesterName}
                                            onChange={(e) => setRequesterName(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Requester Email</label>
                                        <input
                                            type="email"
                                            className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                            value={requesterEmail}
                                            onChange={(e) => setRequesterEmail(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Requester Phone</label>
                                        <input
                                            type="text"
                                            className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                            value={requesterPhone}
                                            onChange={(e) => setRequesterPhone(e.target.value)}
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="mb-4">
                                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Task Details / Original Request</label>
                                <textarea
                                    className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                    rows={4}
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Title</label>
                                    <input
                                        type="text"
                                        className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Assign To</label>
                                    <select
                                        className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                        value={assigneeId}
                                        onChange={(e) => setAssigneeId(e.target.value ? Number(e.target.value) : '')}
                                    >
                                        <option value="">Unassigned</option>
                                        {assignableStaffList.map((staff) => (
                                            <option key={staff.id} value={staff.id}>
                                                {isStaffUser ? 'Me' : staff.displayName} {staff.role && `(${staff.role})`}
                                            </option>
                                        ))}
                                    </select>
                                    {isStaffUser && (
                                        <p className="mt-1 text-xs text-gray-500">
                                            Leave unassigned to send the first workflow step to a manager.
                                        </p>
                                    )}
                                </div>
                            </div>

                            {suggestedChannel === 'email' ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Direct To (Email)</label>
                                        <input
                                            type="text"
                                            list="org-emails"
                                            className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                            placeholder="customer@example.com"
                                            value={recipientEmail}
                                            onChange={(e) => setRecipientEmail(e.target.value)}
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
                                            onChange={(e) => setCcEmail(e.target.value)}
                                        />
                                    </div>
                                </div>
                            ) : suggestedChannel === 'sms' || suggestedChannel === 'voice' ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                                            {suggestedChannel === 'sms' ? 'Reply To (SMS)' : 'Reply To (Phone)'}
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
                                                {suggestedChannel === 'sms' ? 'SMS response selected' : 'Phone call selected'}, but no phone number is captured yet.
                                            </p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Email Fields</label>
                                        <div className="w-full text-sm p-2 border border-gray-200 rounded bg-gray-50 text-gray-500">
                                            Not required for {suggestedChannel === 'sms' ? 'SMS' : 'phone'} response.
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="mb-3 rounded border border-gray-200 bg-white p-3 text-sm text-gray-600">
                                    No customer response is planned for this task.
                                </div>
                            )}

                            <datalist id="org-emails">
                                {staffList.map((staff) => staff.email && (
                                    <option key={`staff-${staff.id}`} value={staff.email}>{staff.displayName} (Staff)</option>
                                ))}
                                {orgContacts.map((contact) => contact.email && (
                                    <option key={`org-${contact.id}`} value={contact.email}>{contact.name} ({contact.role})</option>
                                ))}
                            </datalist>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Reply Channel</label>
                                    <select
                                        className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                        value={suggestedChannel || 'none'}
                                        onChange={(e) => {
                                            const nextChannel = e.target.value as ResponseChannel;
                                            setSuggestedChannel(nextChannel);
                                            setPreferredResponseChannel(nextChannel);
                                            setResponseChannelTouched(true);
                                            if (nextChannel !== 'email') {
                                                setRecipientEmail('');
                                                setCcEmail('');
                                                setSuggestedReplySubject('');
                                            } else if (!suggestedReplySubject && title.trim()) {
                                                setRecipientEmail(selectedMember?.email || (isValidEmailAddress(requesterEmail) ? requesterEmail.trim() : ''));
                                                setSuggestedReplySubject(`Re: ${title.trim()}`);
                                            } else if (nextChannel === 'email') {
                                                setRecipientEmail(selectedMember?.email || (isValidEmailAddress(requesterEmail) ? requesterEmail.trim() : ''));
                                            }
                                        }}
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
                                        className={`w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 ${suggestedChannel === 'email' ? '' : 'bg-gray-50 text-gray-500'}`}
                                        value={suggestedReplySubject}
                                        onChange={(e) => setSuggestedReplySubject(e.target.value)}
                                        disabled={suggestedChannel !== 'email'}
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
                                        onChange={(e) => setSuggestedAction(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                                        {suggestedChannel === 'voice' ? 'Call Notes' : suggestedChannel === 'none' ? 'Internal Note' : 'Reply Draft'}
                                    </label>
                                    <textarea
                                        className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                        rows={4}
                                        value={suggestedReply}
                                        onChange={(e) => setSuggestedReply(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Category</label>
                                    <select
                                        className="w-full text-sm border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                        value={category}
                                        onChange={(e) => {
                                            const newCategory = e.target.value;
                                            setCategory(newCategory);
                                            setSubType(defaultSubTypeForCategory(newCategory));
                                        }}
                                    >
                                        {categoryOptions.map((option) => (
                                            <option key={option} value={option}>{option}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Type</label>
                                    <select
                                        className="w-full text-sm border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                        value={subType}
                                        onChange={(e) => setSubType(e.target.value)}
                                    >
                                        {(() => {
                                            const options = [...(CATEGORY_SUBTYPES[category] || [])];
                                            if (subType && !options.includes(subType)) {
                                                options.unshift(subType);
                                            }
                                            return options.length > 0 ? options.map((option) => (
                                                <option key={option} value={option}>{option}</option>
                                            )) : (
                                                <option value={subType}>{subType || 'None'}</option>
                                            );
                                        })()}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Priority</label>
                                    <select
                                        className="w-full text-sm border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                        value={priority}
                                        onChange={(e) => setPriority(e.target.value)}
                                    >
                                        <option value="low">Low</option>
                                        <option value="normal">Normal</option>
                                        <option value="high">High</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Sentiment</label>
                                    <select
                                        className="w-full text-sm border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                        value={sentiment}
                                        onChange={(e) => setSentiment(e.target.value)}
                                    >
                                        <option value="NEUTRAL">Neutral</option>
                                        <option value="POSITIVE">Positive</option>
                                        <option value="NEGATIVE">Negative</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Task Deadline</label>
                                    <input
                                        type="datetime-local"
                                        className="w-full text-sm border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                        value={taskDueAt}
                                        onChange={(e) => setTaskDueAt(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="mt-4">
                                <CalendarEventPicker
                                    label="Linked Events"
                                    selected={selectedCalendarEvents}
                                    onChange={setSelectedCalendarEvents}
                                    placeholder="Search for an event to link this task..."
                                />
                            </div>

                            <div className="mt-4">
                                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Initial Note (optional)</label>
                                <div className="relative">
                                    {mentionActive && (() => {
                                        const filtered = staffList.filter((user) =>
                                            user.displayName && user.displayName.toLowerCase().includes(mentionQuery.toLowerCase())
                                        );
                                        return filtered.length > 0 ? (
                                            <div className="absolute bottom-full mb-1 left-0 w-64 max-h-48 overflow-y-auto bg-white border border-gray-200 shadow-lg rounded-md z-50 divide-y divide-gray-100">
                                                <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 sticky top-0">Mention Staff</div>
                                                {filtered.map((user) => (
                                                    <button
                                                        key={user.id}
                                                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50"
                                                        onClick={() => {
                                                            const beforeAt = initialNote.lastIndexOf('@');
                                                            const newNote = initialNote.substring(0, beforeAt) + '@' + user.displayName + ' ';
                                                            setInitialNote(newNote);
                                                            setMentionActive(false);
                                                            setMentionQuery('');
                                                        }}
                                                    >
                                                        <div className="font-medium text-gray-900">{user.displayName}</div>
                                                        <div className="text-xs text-gray-500">{user.role || 'Staff'}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        ) : null;
                                    })()}
                                    <textarea
                                        className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                        rows={2}
                                        placeholder="Add a note... (type @ to mention staff)"
                                        value={initialNote}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setInitialNote(val);
                                            const lastAt = val.lastIndexOf('@');
                                            if (lastAt >= 0) {
                                                const afterAt = val.substring(lastAt + 1);
                                                if (!afterAt.includes(' ') && afterAt.length <= 30) {
                                                    setMentionActive(true);
                                                    setMentionQuery(afterAt);
                                                } else {
                                                    setMentionActive(false);
                                                }
                                            } else {
                                                setMentionActive(false);
                                            }
                                        }}
                                    />
                                </div>
                            </div>

                            <div className="mt-4 p-3 bg-white border border-gray-200 rounded">
                                <div className="flex items-center justify-between mb-3">
                                    <label className="block text-xs font-bold text-gray-700 uppercase">Workflow Plan</label>
                                    <button
                                        type="button"
                                        onClick={() => setWorkflowSteps((prev) => [
                                            ...prev,
                                            {
                                                title: 'New workflow step',
                                                stepType: 'INTERNAL',
                                                waitingOn: 'STAFF',
                                                ownerUserId: assigneeId === '' ? null : assigneeId,
                                                sortOrder: prev.length
                                            }
                                        ])}
                                        className="text-xs font-medium text-blue-600 hover:text-blue-800"
                                    >
                                        + Add Step
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    {workflowSteps.length === 0 && (
                                        <div className="text-sm text-gray-500">No structured steps yet. Add at least one if this task needs staged work.</div>
                                    )}

                                    {workflowSteps.map((workflowStep, index) => (
                                        <div key={`${workflowStep.title}-${index}`} className="border border-gray-200 rounded-lg p-3 space-y-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="text-xs font-bold text-gray-500 uppercase">Step {index + 1}</div>
                                                <button
                                                    type="button"
                                                    onClick={() => setWorkflowSteps((prev) => prev.filter((_, currentIndex) => currentIndex !== index).map((entry, currentIndex) => ({
                                                        ...entry,
                                                        sortOrder: currentIndex
                                                    })))}
                                                    className="text-xs text-red-600 hover:text-red-800"
                                                >
                                                    Remove
                                                </button>
                                            </div>

                                            <input
                                                type="text"
                                                className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                                value={workflowStep.title}
                                                onChange={(e) => setWorkflowSteps((prev) => prev.map((entry, currentIndex) => currentIndex === index ? {
                                                    ...entry,
                                                    title: e.target.value,
                                                    sortOrder: index
                                                } : entry))}
                                                placeholder="Step title"
                                            />

                                            <textarea
                                                className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                                rows={2}
                                                value={workflowStep.description || ''}
                                                onChange={(e) => setWorkflowSteps((prev) => prev.map((entry, currentIndex) => currentIndex === index ? {
                                                    ...entry,
                                                    description: e.target.value,
                                                    sortOrder: index
                                                } : entry))}
                                                placeholder="What should happen in this step?"
                                            />

                                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                                                <div>
                                                    <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Type</label>
                                                    <select
                                                        className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                                        value={workflowStep.stepType || 'INTERNAL'}
                                                        onChange={(e) => setWorkflowSteps((prev) => prev.map((entry, currentIndex) => currentIndex === index ? {
                                                            ...entry,
                                                            stepType: e.target.value
                                                        } : entry))}
                                                    >
                                                        {STEP_TYPES.map((option) => (
                                                            <option key={option} value={option}>{option}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Waiting On</label>
                                                    <select
                                                        className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                                        value={workflowStep.waitingOn || 'STAFF'}
                                                        onChange={(e) => setWorkflowSteps((prev) => prev.map((entry, currentIndex) => currentIndex === index ? {
                                                            ...entry,
                                                            waitingOn: e.target.value
                                                        } : entry))}
                                                    >
                                                        {WAITING_ON.map((option) => (
                                                            <option key={option} value={option}>{option}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Owner</label>
                                                    <select
                                                        className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                                        value={workflowStep.ownerUserId ?? ''}
                                                        onChange={(e) => setWorkflowSteps((prev) => prev.map((entry, currentIndex) => currentIndex === index ? {
                                                            ...entry,
                                                            ownerUserId: e.target.value ? Number(e.target.value) : null
                                                        } : entry))}
                                                    >
                                                        <option value="">Unassigned</option>
                                                        {assignableStaffList.map((staff) => (
                                                            <option key={staff.id} value={staff.id}>
                                                                {isStaffUser ? 'Me' : staff.displayName}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Due</label>
                                                    <input
                                                        type="datetime-local"
                                                        className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                                        value={toDateTimeLocalValue(workflowStep.dueAt)}
                                                        onChange={(e) => setWorkflowSteps((prev) => prev.map((entry, currentIndex) => currentIndex === index ? {
                                                            ...entry,
                                                            dueAt: e.target.value ? new Date(e.target.value).toISOString() : null
                                                        } : entry))}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setStep('INPUT')}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                            >
                                Back
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={loading}
                                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                            >
                                {loading ? 'Creating...' : 'Confirm & Create'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
