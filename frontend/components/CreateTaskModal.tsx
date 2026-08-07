'use client';

import { useCallback, useEffect, useState } from 'react';
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
    Staff,
    OperationalArea,
    fetchOperationalAreas,
    Member,
    WineryContact
} from '../lib/api';
import type { CalendarEventSelection } from './CalendarEventPicker';
import { clientLogger } from '../lib/clientLogger';
import { operationalLabel } from '../lib/operationalPresentation';
import {
    buildContextualAnalysisText,
    buildSuggestionReview,
    defaultCategoryForOrigin,
    defaultResponseChannelForMethod,
    isValidEmailAddress,
    type ResponseChannel
} from './create-task/taskAnalysis';
import { CreateTaskInputStep } from './create-task/CreateTaskInputStep';
import { CreateTaskMetadataEditor } from './create-task/CreateTaskMetadataEditor';
import { CreateTaskPreviewBasics } from './create-task/CreateTaskPreviewBasics';
import { CreateTaskResponseEditor } from './create-task/CreateTaskResponseEditor';
import {
    defaultSubTypeForCategory,
    EXTERNAL_INBOUND_METHODS,
    TASK_CATEGORY_OPTIONS_BY_ORIGIN,
    type MemberSelection
} from './create-task/taskOptions';

interface CreateTaskModalProps {
    onClose: () => void;
    onCreated: () => void;
    userRole?: string | null;
    currentUserId?: number | null;
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown error';
}

export default function CreateTaskModal({ onClose, onCreated, userRole, currentUserId }: CreateTaskModalProps) {
    const [step, setStep] = useState<'INPUT' | 'PREVIEW'>('INPUT');
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(false);
    const [preview, setPreview] = useState<AutoclassifyResponse | null>(null);
    const [formError, setFormError] = useState('');

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
    const [areas, setAreas] = useState<OperationalArea[]>([]);
    const [areaScope, setAreaScope] = useState<'ORGANISATION' | 'AREAS'>('ORGANISATION');
    const [primaryAreaId, setPrimaryAreaId] = useState<number | ''>('');
    const [linkedAreaIds, setLinkedAreaIds] = useState<number[]>([]);

    const [memberQuery, setMemberQuery] = useState('');
    const [members, setMembers] = useState<Member[]>([]);
    const [selectedMember, setSelectedMember] = useState<MemberSelection | null>(null);
    const [searchingMember, setSearchingMember] = useState(false);

    const [initialNote, setInitialNote] = useState('');
    const [staffList, setStaffList] = useState<Staff[]>([]);
    const [orgContacts, setOrgContacts] = useState<WineryContact[]>([]);
    const isStaffUser = userRole === 'staff';
    const selectedAreaIds = areaScope === 'AREAS'
        ? [Number(primaryAreaId), ...linkedAreaIds].filter(id => Number.isInteger(id) && id > 0)
        : [];
    const managesSelectedAreas = selectedAreaIds.length > 0 && selectedAreaIds.every(areaId =>
        areas.find(area => area.id === areaId)?.myMembership?.membershipRole === 'MANAGER'
    );
    const restrictStaffOwnership = isStaffUser && !managesSelectedAreas;
    const assignableStaffList = restrictStaffOwnership
        ? staffList.filter((staff) => staff.id === currentUserId)
        : staffList;

    const isAllowedStaffOwner = useCallback((ownerUserId?: number | '' | null) => {
        if (!restrictStaffOwnership || !ownerUserId) return true;
        return Number(ownerUserId) === Number(currentUserId);
    }, [restrictStaffOwnership, currentUserId]);

    const sanitizeStepOwnerForStaff = useCallback((stepInput: TaskStepInput): TaskStepInput => {
        if (isAllowedStaffOwner(stepInput.ownerUserId)) return stepInput;
        return { ...stepInput, ownerUserId: null };
    }, [isAllowedStaffOwner]);

    useEffect(() => {
        let cancelled = false;

        getUsers()
            .then((users) => {
                if (!cancelled) setStaffList(users);
            })
            .catch(() => {
                if (!cancelled) setStaffList([]);
            });

        fetchOperationalAreas()
            .then((items) => {
                if (cancelled) return;
                const selectable = isStaffUser ? items.filter(area => area.myMembership) : items;
                setAreas(selectable);
                const primary = selectable.find(area => area.myMembership?.isPrimary) || selectable[0];
                if (isStaffUser && primary) {
                    setAreaScope('AREAS');
                    setPrimaryAreaId(primary.id);
                }
            })
            .catch(() => {
                if (!cancelled) setAreas([]);
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
    }, [userRole, isStaffUser]);

    useEffect(() => {
        if (!restrictStaffOwnership) return;

        if (!isAllowedStaffOwner(assigneeId)) {
            setAssigneeId('');
        }

        setWorkflowSteps((prev) => prev.map(sanitizeStepOwnerForStaff));
    }, [restrictStaffOwnership, currentUserId, assigneeId, isAllowedStaffOwner, sanitizeStepOwnerForStaff]);

    useEffect(() => {
        const allowedCategories = TASK_CATEGORY_OPTIONS_BY_ORIGIN[taskOrigin];
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
                    clientLogger.error(e);
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
            if (!EXTERNAL_INBOUND_METHODS.includes(inboundMethod)) {
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
        setFormError('');
        const validationError = validateIntake();
        if (validationError) {
            setFormError(validationError);
            return;
        }

        if (areaScope === 'AREAS' && primaryAreaId === '') {
            setFormError('Choose a primary operational area.');
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

            const nextTitle = result.suggestedTitle || `${operationalLabel(result.category)} - ${result.subType ? operationalLabel(result.subType) : 'Task'}`;
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
        } catch (err: unknown) {
            setFormError('Analysis failed: ' + errorMessage(err));
        } finally {
            setLoading(false);
        }
    }

    async function handleConfirm() {
        if (!preview) return;

        setFormError('');

        const validationError = validateIntake();
        if (validationError) {
            setFormError(validationError);
            return;
        }

        if (areaScope === 'AREAS' && primaryAreaId === '') {
            setFormError('Choose a primary operational area.');
            return;
        }

        if (!isAllowedStaffOwner(assigneeId)) {
            setFormError('Staff can only assign new tasks to themselves or leave them unassigned.');
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
            } catch (payloadError: unknown) {
                clientLogger.error('Task preview payload is invalid', payloadError);
                setFormError('Task preview details are invalid. Please re-run the analysis before creating the task.');
                return;
            }

            const finalChannel = (suggestedChannel || 'none') as ResponseChannel;
            const requesterEmailForSubmit = requesterEmail.trim() && isValidEmailAddress(requesterEmail)
                ? requesterEmail.trim()
                : '';
            const recipientEmailForSubmit = finalChannel === 'email' ? recipientEmail.trim() : '';
            const ccEmailForSubmit = finalChannel === 'email' ? ccEmail.trim() : '';

            if (finalChannel === 'email' && requesterEmail.trim() && !isValidEmailAddress(requesterEmail)) {
                setFormError('Requester email must be a valid email address. Switch the response channel to Phone or SMS if there is no usable email.');
                return;
            }

            if (finalChannel === 'email' && recipientEmailForSubmit && !isValidEmailAddress(recipientEmailForSubmit)) {
                setFormError('Direct To must be a valid email address for email responses.');
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
                calendarEventIds: selectedCalendarEvents.map(event => event.id),
                areaScope,
                primaryAreaId: areaScope === 'AREAS' && primaryAreaId !== '' ? primaryAreaId : null,
                linkedAreaIds: areaScope === 'AREAS' ? linkedAreaIds : []
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
                calendarEventIds: selectedCalendarEvents.map(event => event.id),
                areaScope,
                primaryAreaId: areaScope === 'AREAS' && primaryAreaId !== '' ? primaryAreaId : undefined,
                linkedAreaIds: areaScope === 'AREAS' ? linkedAreaIds : []
            });
            onCreated();
        } catch (err: unknown) {
            setFormError('Creation failed: ' + errorMessage(err));
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full p-6">
                <h2 className="text-xl font-bold mb-4">Create New Task</h2>

                {formError && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800" role="alert">{formError}</div>}

                {step === 'INPUT' ? (
                    <CreateTaskInputStep
                        taskOrigin={taskOrigin}
                        inboundMethod={inboundMethod}
                        preferredResponseChannel={preferredResponseChannel}
                        selectedMember={selectedMember}
                        memberQuery={memberQuery}
                        members={members}
                        searchingMember={searchingMember}
                        requesterName={requesterName}
                        requesterEmail={requesterEmail}
                        requesterPhone={requesterPhone}
                        text={text}
                        loading={loading}
                        onTaskOriginChange={setTaskOrigin}
                        onInboundMethodChange={setInboundMethod}
                        onResponseChannelChange={(channel) => {
                            setPreferredResponseChannel(channel);
                            setSuggestedChannel(channel);
                            setResponseChannelTouched(true);
                        }}
                        onMemberQueryChange={setMemberQuery}
                        onMemberSelect={(member) => {
                            setSelectedMember(member);
                            setMemberQuery('');
                            setMembers([]);
                            if (!requesterEmail && member.email) setRequesterEmail(member.email);
                            if (!requesterPhone && member.phone) setRequesterPhone(member.phone);
                            if (!requesterName) setRequesterName(`${member.firstName} ${member.lastName}`.trim());
                        }}
                        onMemberRemove={() => setSelectedMember(null)}
                        onRequesterNameChange={setRequesterName}
                        onRequesterEmailChange={setRequesterEmail}
                        onRequesterPhoneChange={setRequesterPhone}
                        onTextChange={setText}
                        onClose={onClose}
                        onAnalyze={handleAnalyze}
                    />
                ) : (
                    <>
                        <div className="bg-blue-50 p-4 rounded mb-4 overflow-y-auto max-h-[70vh]">
                            <CreateTaskPreviewBasics
                                taskOrigin={taskOrigin}
                                inboundMethod={inboundMethod}
                                selectedMember={selectedMember}
                                memberQuery={memberQuery}
                                members={members}
                                searchingMember={searchingMember}
                                requesterName={requesterName}
                                requesterEmail={requesterEmail}
                                requesterPhone={requesterPhone}
                                text={text}
                                title={title}
                                assigneeId={assigneeId}
                                assignableStaff={assignableStaffList}
                                restrictStaffOwnership={restrictStaffOwnership}
                                areas={areas}
                                areaScope={areaScope}
                                primaryAreaId={primaryAreaId}
                                linkedAreaIds={linkedAreaIds}
                                onTaskOriginChange={setTaskOrigin}
                                onInboundMethodChange={setInboundMethod}
                                onMemberQueryChange={setMemberQuery}
                                onMemberSelect={(member) => {
                                    setSelectedMember(member);
                                    setMemberQuery('');
                                    setMembers([]);
                                }}
                                onMemberRemove={() => setSelectedMember(null)}
                                onRequesterNameChange={setRequesterName}
                                onRequesterEmailChange={setRequesterEmail}
                                onRequesterPhoneChange={setRequesterPhone}
                                onTextChange={setText}
                                onTitleChange={setTitle}
                                onAssigneeChange={setAssigneeId}
                                onAreaScopeChange={(nextScope) => {
                                    setAreaScope(nextScope);
                                    if (nextScope === 'ORGANISATION') {
                                        setPrimaryAreaId('');
                                        setLinkedAreaIds([]);
                                    }
                                }}
                                onPrimaryAreaChange={setPrimaryAreaId}
                                onLinkedAreaIdsChange={setLinkedAreaIds}
                            />

                            <CreateTaskResponseEditor
                                channel={(suggestedChannel || 'none') as ResponseChannel}
                                recipientEmail={recipientEmail}
                                ccEmail={ccEmail}
                                replySubject={suggestedReplySubject}
                                suggestedAction={suggestedAction}
                                suggestedReply={suggestedReply}
                                title={title}
                                selectedMember={selectedMember}
                                requesterEmail={requesterEmail}
                                requesterPhone={requesterPhone}
                                staff={staffList}
                                organisationContacts={orgContacts}
                                onChannelChange={(nextChannel) => {
                                    setSuggestedChannel(nextChannel);
                                    setPreferredResponseChannel(nextChannel);
                                    setResponseChannelTouched(true);
                                }}
                                onRecipientEmailChange={setRecipientEmail}
                                onCcEmailChange={setCcEmail}
                                onReplySubjectChange={setSuggestedReplySubject}
                                onSuggestedActionChange={setSuggestedAction}
                                onSuggestedReplyChange={setSuggestedReply}
                            />

                            <CreateTaskMetadataEditor
                                taskOrigin={taskOrigin}
                                category={category}
                                subType={subType}
                                priority={priority}
                                sentiment={sentiment}
                                taskDueAt={taskDueAt}
                                selectedCalendarEvents={selectedCalendarEvents}
                                initialNote={initialNote}
                                workflowSteps={workflowSteps}
                                assigneeId={assigneeId}
                                assignableStaff={assignableStaffList}
                                labelOwnerAsMe={isStaffUser}
                                mentionableStaff={staffList}
                                onCategoryChange={setCategory}
                                onSubTypeChange={setSubType}
                                onPriorityChange={setPriority}
                                onSentimentChange={setSentiment}
                                onTaskDueAtChange={setTaskDueAt}
                                onSelectedCalendarEventsChange={setSelectedCalendarEvents}
                                onInitialNoteChange={setInitialNote}
                                onWorkflowStepsChange={setWorkflowSteps}
                            />
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
