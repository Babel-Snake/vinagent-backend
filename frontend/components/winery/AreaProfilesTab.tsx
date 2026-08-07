'use client';

import { useEffect, useMemo, useState } from 'react';
import { updateOperationalAreaProfile, Winery } from '../../lib/api';

export function AreaProfilesTab({ winery, onUpdate }: { winery: Winery, onUpdate: () => void }) {
    const areas = useMemo(() => winery.OperationalAreas || [], [winery.OperationalAreas]);
    const access = winery.configurationAccess;
    const initialAreaId = access?.managedAreaIds?.[0] || areas[0]?.id || 0;
    const [selectedAreaId, setSelectedAreaId] = useState(initialAreaId);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
    const selectedArea = areas.find(area => area.id === selectedAreaId) || areas[0];
    const canManage = Boolean(access?.isGlobalManager || access?.managedAreaIds?.includes(Number(selectedArea?.id)));
    const profile = selectedArea?.Profile;
    const [formData, setFormData] = useState({
        publicEmail: '',
        publicPhone: '',
        openingHoursText: '',
        guestDirections: '',
        serviceNotes: ''
    });

    useEffect(() => {
        if (!selectedArea && areas[0]) setSelectedAreaId(areas[0].id);
    }, [areas, selectedArea]);

    useEffect(() => {
        setFormData({
            publicEmail: profile?.publicEmail || '',
            publicPhone: profile?.publicPhone || '',
            openingHoursText: profile?.openingHoursText || '',
            guestDirections: profile?.guestDirections || '',
            serviceNotes: profile?.serviceNotes || ''
        });
    }, [selectedAreaId, profile]);

    if (!selectedArea) return <p className="text-sm text-[var(--muted)]">Create an operational area before adding area profiles.</p>;

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        if (!canManage) return;
        setFeedback(null);
        setSaving(true);
        try {
            await updateOperationalAreaProfile(selectedArea.id, formData);
            setFeedback({ tone: 'success', message: 'Area profile saved.' });
            onUpdate();
        } catch (error) {
            setFeedback({ tone: 'error', message: error instanceof Error ? error.message : 'Failed to save area profile' });
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="space-y-6">
            <div className="rounded-lg border border-[var(--border)] bg-[#f8f9f5] p-4">
                <label className="block text-sm font-semibold text-[#344039]">Operational area</label>
                <select
                    value={selectedArea.id}
                    onChange={event => setSelectedAreaId(Number(event.target.value))}
                    className="mt-2 w-full max-w-md rounded-md border border-[var(--border)] bg-white p-2"
                >
                    {areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
                </select>
                <p className="mt-2 text-sm text-[var(--muted)]">
                    {canManage ? `You can edit ${selectedArea.name}.` : `${selectedArea.name} is read-only for your account.`}
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6 rounded-lg border border-gray-200 bg-gray-50 p-6">
                {feedback && <p role={feedback.tone === 'error' ? 'alert' : 'status'} className={`rounded-md border px-3 py-2 text-sm ${feedback.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>{feedback.message}</p>}
                <div>
                    <h3 className="text-lg font-medium text-gray-900">{selectedArea.name} public profile</h3>
                    <p className="mt-1 text-sm text-gray-500">Blank contact fields fall back to the organisation profile.</p>
                </div>
                <fieldset disabled={!canManage || saving} className="grid grid-cols-1 gap-5 md:grid-cols-2 disabled:opacity-70">
                    <label className="text-sm font-medium text-gray-700">
                        Public email
                        <input type="email" value={formData.publicEmail} onChange={e => setFormData({ ...formData, publicEmail: e.target.value })} placeholder={winery.publicEmail || ''} className="mt-1 block w-full rounded-md border border-gray-300 p-2" />
                    </label>
                    <label className="text-sm font-medium text-gray-700">
                        Public phone
                        <input type="text" value={formData.publicPhone} onChange={e => setFormData({ ...formData, publicPhone: e.target.value })} placeholder={winery.publicPhone || ''} className="mt-1 block w-full rounded-md border border-gray-300 p-2" />
                    </label>
                    <label className="text-sm font-medium text-gray-700 md:col-span-2">
                        Opening hours
                        <textarea rows={3} value={formData.openingHoursText} onChange={e => setFormData({ ...formData, openingHoursText: e.target.value })} className="mt-1 block w-full rounded-md border border-gray-300 p-2" />
                    </label>
                    <label className="text-sm font-medium text-gray-700 md:col-span-2">
                        Guest directions
                        <textarea rows={3} value={formData.guestDirections} onChange={e => setFormData({ ...formData, guestDirections: e.target.value })} className="mt-1 block w-full rounded-md border border-gray-300 p-2" />
                    </label>
                    <label className="text-sm font-medium text-gray-700 md:col-span-2">
                        Service notes
                        <textarea rows={4} value={formData.serviceNotes} onChange={e => setFormData({ ...formData, serviceNotes: e.target.value })} className="mt-1 block w-full rounded-md border border-gray-300 p-2" />
                    </label>
                    <div className="md:col-span-2">
                        <button type="submit" className="btn-primary">
                            {saving ? 'Saving…' : 'Save area profile'}
                        </button>
                    </div>
                </fieldset>
            </form>
        </div>
    );
}
