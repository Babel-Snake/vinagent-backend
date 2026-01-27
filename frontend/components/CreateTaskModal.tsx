'use client';

import { useState, useEffect } from 'react';
import { autoclassifyTask, createTask, searchMembers, AutoclassifyResponse } from '../lib/api';

interface CreateTaskModalProps {
    onClose: () => void;
    onCreated: () => void;
}

export default function CreateTaskModal({ onClose, onCreated }: CreateTaskModalProps) {
    const [step, setStep] = useState<'INPUT' | 'PREVIEW'>('INPUT');
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(false);
    const [preview, setPreview] = useState<AutoclassifyResponse | null>(null);

    // Editable State
    const [title, setTitle] = useState('');
    const [category, setCategory] = useState('');
    const [subType, setSubType] = useState('');
    const [priority, setPriority] = useState('');
    const [sentiment, setSentiment] = useState('');
    const [suggestedReply, setSuggestedReply] = useState('');
    const [suggestedChannel, setSuggestedChannel] = useState('');

    // Member Search State
    const [memberQuery, setMemberQuery] = useState('');
    const [members, setMembers] = useState<any[]>([]);
    const [selectedMember, setSelectedMember] = useState<any>(null);
    const [searchingMember, setSearchingMember] = useState(false);

    async function handleAnalyze() {
        if (!text.trim()) return;
        setLoading(true);
        try {
            const result = await autoclassifyTask(text, selectedMember?.id);
            setPreview(result);

            // Initialize editable state
            setTitle(result.suggestedTitle);
            setCategory(result.category);
            setSubType(result.subType);
            setPriority(result.priority);
            setSentiment(result.sentiment);
            setSuggestedReply(result.payload?.suggestedReplyBody || '');
            setSuggestedChannel(result.suggestedChannel || 'sms');

            // Auto-link member if AI extracted one and none was pre-selected
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

    // Search Effect
    useEffect(() => {
        if (memberQuery.length > 2) {
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
        } else {
            setMembers([]);
        }
    }, [memberQuery]);

    async function handleConfirm() {
        if (!preview) return;
        setLoading(true);
        try {
            await createTask({
                category,
                subType,
                priority,
                sentiment,
                payload: preview.payload,
                notes: text,
                memberId: selectedMember?.id,
                suggestedReplyBody: suggestedReply,
                suggestedChannel: suggestedChannel || 'none'
            });
            onCreated();
        } catch (err: any) {
            alert('Creation failed: ' + err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
                <h2 className="text-xl font-bold mb-4">Create New Task</h2>

                {step === 'INPUT' ? (
                    <>
                        <p className="text-sm text-gray-600 mb-2">
                            Describe the issue or request. VinAgent will categorize it for you.
                        </p>
                        <textarea
                            className="w-full h-32 p-3 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
                            placeholder="E.g. The printer is out of paper, or Customer John Smith is asking for a refund..."
                            value={text}
                            onChange={e => setText(e.target.value)}
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
                        <div className="bg-blue-50 p-4 rounded mb-4">
                            <div className="mb-3">
                                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Title</label>
                                <input
                                    type="text"
                                    className="w-full text-sm border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Category</label>
                                    <select
                                        className="w-full text-sm border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                        value={category}
                                        onChange={e => setCategory(e.target.value)}
                                    >
                                        <option value="BOOKING">Booking</option>
                                        <option value="ORDER">Order</option>
                                        <option value="ACCOUNT">Account</option>
                                        <option value="GENERAL">General</option>
                                        <option value="INTERNAL">Internal</option>
                                        <option value="SYSTEM">System</option>
                                        <option value="OPERATIONS">Operations</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Type</label>
                                    <input
                                        type="text"
                                        className="w-full text-sm border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                        value={subType}
                                        onChange={e => setSubType(e.target.value)}
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Priority</label>
                                    <select
                                        className="w-full text-sm border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                        value={priority}
                                        onChange={e => setPriority(e.target.value)}
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
                                        onChange={e => setSentiment(e.target.value)}
                                    >
                                        <option value="NEUTRAL">Neutral</option>
                                        <option value="POSITIVE">Positive</option>
                                        <option value="NEGATIVE">Negative</option>
                                    </select>
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
