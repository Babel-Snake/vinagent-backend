'use client';

import { useState } from 'react';
import { autoclassifyTask, createTask, AutoclassifyResponse } from '../lib/api';

interface CreateTaskModalProps {
    onClose: () => void;
    onCreated: () => void;
}

export default function CreateTaskModal({ onClose, onCreated }: CreateTaskModalProps) {
    const [step, setStep] = useState<'INPUT' | 'PREVIEW'>('INPUT');
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(false);
    const [preview, setPreview] = useState<AutoclassifyResponse | null>(null);

    async function handleAnalyze() {
        if (!text.trim()) return;
        setLoading(true);
        try {
            const result = await autoclassifyTask(text);
            setPreview(result);
            setStep('PREVIEW');
        } catch (err: any) {
            alert('Analysis failed: ' + err.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleConfirm() {
        if (!preview) return;
        setLoading(true);
        try {
            await createTask({
                category: preview.category,
                subType: preview.subType,
                priority: preview.priority,
                sentiment: preview.sentiment,
                payload: preview.payload,
                notes: text // Save original text as note
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
                        {preview && (
                            <div className="bg-blue-50 p-4 rounded mb-4">
                                <h3 className="font-bold text-blue-900 mb-2">{preview.suggestedTitle}</h3>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div><span className="font-semibold">Category:</span> {preview.category}</div>
                                    <div><span className="font-semibold">Type:</span> {preview.subType}</div>
                                    <div><span className="font-semibold">Priority:</span> {preview.priority}</div>
                                    <div><span className="font-semibold">Sentiment:</span> {preview.sentiment}</div>
                                </div>
                            </div>
                        )}
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
