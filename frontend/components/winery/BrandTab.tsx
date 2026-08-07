'use client';

import { useState } from 'react';
import { updateBrand, type Winery } from '../../lib/api';
import { clientLogger } from '../../lib/clientLogger';

export function BrandTab({ winery, onUpdate }: { winery: Winery, onUpdate: () => void }) {
    const profile = winery.brandProfile || {};
    const [formData, setFormData] = useState({
        brandStoryShort: profile.brandStoryShort || '',
        tonePreset: profile.tonePreset || 'warm',
        voiceGuidelines: profile.voiceGuidelines || '',
        signOffDefault: profile.signOffDefault || '',
        spellingLocale: profile.spellingLocale || 'AU',
        formalityLevel: profile.formalityLevel || 3,
        // Helper accessors for examples
        doSayExamples: profile.doSayExamples ? JSON.stringify(profile.doSayExamples) : '',
        dontSayExamples: profile.dontSayExamples ? JSON.stringify(profile.dontSayExamples) : ''
    });
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFeedback(null);
        setSaving(true);
        try {
            // Parse JSON fields safely
            const payload = {
                ...formData,
                doSayExamples: formData.doSayExamples ? JSON.parse(formData.doSayExamples) : [],
                dontSayExamples: formData.dontSayExamples ? JSON.parse(formData.dontSayExamples) : [],
                formalityLevel: Number(formData.formalityLevel)
            };
            await updateBrand(payload);
            setFeedback({ tone: 'success', message: 'Brand and voice settings saved.' });
            onUpdate();
        } catch (e) {
            clientLogger.error(e);
            setFeedback({ tone: 'error', message: e instanceof Error ? e.message : 'Failed to save. Check JSON syntax for examples.' });
        } finally {
            setSaving(false);
        }
    };

    const handleChange = (field: keyof typeof formData, value: string | number) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
            {feedback && <p role={feedback.tone === 'error' ? 'alert' : 'status'} className={`rounded-md border px-3 py-2 text-sm ${feedback.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>{feedback.message}</p>}
            {/* ID */}
            <div>
                <label className="block text-sm font-medium text-gray-700">Winery Story (Short)</label>
                <p className="text-xs text-gray-500 mb-2">Used by AI to explain history.</p>
                <textarea rows={4} value={formData.brandStoryShort} onChange={e => handleChange('brandStoryShort', e.target.value)} className="block w-full rounded-md border-gray-300 shadow-sm border p-2" />
            </div>

            {/* Voice Controls */}
            <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2 bg-gray-50 p-4 rounded-lg">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Tone Preset</label>
                    <select value={formData.tonePreset} onChange={e => handleChange('tonePreset', e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2">
                        <option value="warm">Warm</option>
                        <option value="premium">Premium</option>
                        <option value="playful">Playful</option>
                        <option value="rustic">Rustic</option>
                        <option value="formal">Formal</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Formality (1-5)</label>
                    <input type="number" min="1" max="5" value={formData.formalityLevel} onChange={e => handleChange('formalityLevel', e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Spelling Locale</label>
                    <select value={formData.spellingLocale} onChange={e => handleChange('spellingLocale', e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2">
                        <option value="AU">Australia / UK</option>
                        <option value="US">USA</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Sign-off</label>
                    <input type="text" value={formData.signOffDefault} onChange={e => handleChange('signOffDefault', e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" placeholder="Cheers," />
                </div>
            </div>

            {/* Deep Guidelines */}
            <div>
                <label className="block text-sm font-medium text-gray-700">Voice Guidelines</label>
                <textarea rows={3} value={formData.voiceGuidelines} onChange={e => handleChange('voiceGuidelines', e.target.value)} className="block w-full rounded-md border-gray-300 shadow-sm border p-2" placeholder="Bulleted list of rules..." />
            </div>

            {/* JSON Lists */}
            <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Do Say (JSON Array)</label>
                    <textarea rows={4} value={formData.doSayExamples} onChange={e => handleChange('doSayExamples', e.target.value)} className="block w-full rounded-md border-gray-300 shadow-sm border p-2 font-mono text-xs" placeholder='["guests", "cellar door"]' />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Don&apos;t Say (JSON Array)</label>
                    <textarea rows={4} value={formData.dontSayExamples} onChange={e => handleChange('dontSayExamples', e.target.value)} className="block w-full rounded-md border-gray-300 shadow-sm border p-2 font-mono text-xs" placeholder='["customers", "shop"]' />
                </div>
            </div>

            <div>
                <button type="submit" disabled={saving} className="btn-primary">
                    {saving ? 'Saving...' : 'Save Brand Settings'}
                </button>
            </div>
        </form>
    );
}
