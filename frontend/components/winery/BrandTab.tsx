'use client';

import { useState } from 'react';
import { updateBrand } from '../../lib/api';

export function BrandTab({ winery, onUpdate }: { winery: any, onUpdate: () => void }) {
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            // Parse JSON fields safely
            const payload = {
                ...formData,
                doSayExamples: formData.doSayExamples ? JSON.parse(formData.doSayExamples) : [],
                dontSayExamples: formData.dontSayExamples ? JSON.parse(formData.dontSayExamples) : [],
                formalityLevel: parseInt(formData.formalityLevel as any)
            };
            await updateBrand(payload);
            alert('Brand Settings Saved!');
            onUpdate();
        } catch (e) {
            console.error(e);
            alert('Failed to save (Check JSON syntax for examples)');
        } finally {
            setSaving(false);
        }
    };

    const handleChange = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
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
                    <label className="block text-sm font-medium text-gray-700">Don't Say (JSON Array)</label>
                    <textarea rows={4} value={formData.dontSayExamples} onChange={e => handleChange('dontSayExamples', e.target.value)} className="block w-full rounded-md border-gray-300 shadow-sm border p-2 font-mono text-xs" placeholder='["customers", "shop"]' />
                </div>
            </div>

            <div>
                <button type="submit" disabled={saving} className="btn-primary inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:bg-gray-400">
                    {saving ? 'Saving...' : 'Save Brand Settings'}
                </button>
            </div>
        </form>
    );
}
