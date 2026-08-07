'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    createBookingType,
    deleteBookingType,
    updateBookingType,
    updateOperationalAreaBookingsConfig,
    Winery
} from '../../lib/api';
import ConfirmDialog from '../ui/ConfirmDialog';

const emptyConfig = {
    walkInsAllowed: true,
    walkInNotes: '',
    groupBookingThreshold: 8,
    leadTimeHours: 24,
    cancellationPolicyText: '',
    kidsPolicy: '',
    petsPolicy: '',
    defaultResponseStrategy: 'create_task' as 'confirm' | 'create_task'
};

export function BookingsTab({ winery, onUpdate }: { winery: Winery, onUpdate: () => void }) {
    const areas = useMemo(() => winery.OperationalAreas || [], [winery.OperationalAreas]);
    const access = winery.configurationAccess;
    const [selectedAreaId, setSelectedAreaId] = useState(access?.managedAreaIds?.[0] || areas[0]?.id || 0);
    const selectedArea = areas.find(area => area.id === selectedAreaId) || areas[0];
    const canManage = Boolean(access?.isGlobalManager || access?.managedAreaIds?.includes(Number(selectedArea?.id)));
    const areaConfig = selectedArea?.BookingsConfig;
    const organisationDefault = useMemo(() => winery.bookingsConfig || {}, [winery]);
    const bookingTypes = selectedArea?.BookingTypes || [];
    const [formConfig, setFormConfig] = useState(emptyConfig);
    const [newType, setNewType] = useState({ name: '', description: '', priceCents: 0 });
    const [editingTypeId, setEditingTypeId] = useState<number | null>(null);
    const [editingType, setEditingType] = useState({ name: '', description: '', priceCents: 0 });
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [bookingTypePendingDeletion, setBookingTypePendingDeletion] = useState<{ id: number; name: string } | null>(null);

    useEffect(() => {
        if (!selectedArea && areas[0]) setSelectedAreaId(areas[0].id);
    }, [areas, selectedArea]);

    useEffect(() => {
        const config = areaConfig || organisationDefault;
        setFormConfig({
            walkInsAllowed: config.walkInsAllowed !== false,
            walkInNotes: config.walkInNotes || '',
            groupBookingThreshold: config.groupBookingThreshold || 8,
            leadTimeHours: config.leadTimeHours ?? 24,
            cancellationPolicyText: config.cancellationPolicyText || '',
            kidsPolicy: config.kidsPolicy || '',
            petsPolicy: config.petsPolicy || '',
            defaultResponseStrategy: config.defaultResponseStrategy === 'confirm' ? 'confirm' : 'create_task'
        });
        setEditingTypeId(null);
    }, [selectedAreaId, areaConfig, organisationDefault]);

    if (!selectedArea) return <p className="text-sm text-[var(--muted)]">Create an operational area before configuring bookings.</p>;

    async function saveRules(event: React.FormEvent) {
        event.preventDefault();
        if (!canManage) return;
        setFeedback(null);
        setSaving(true);
        try {
            await updateOperationalAreaBookingsConfig(selectedArea.id, formConfig);
            onUpdate();
        } catch (error) {
            setFeedback(error instanceof Error ? error.message : 'Failed to save booking rules');
        } finally {
            setSaving(false);
        }
    }

    async function addType(event: React.FormEvent) {
        event.preventDefault();
        if (!canManage || !newType.name.trim()) return;
        setFeedback(null);
        try {
            await createBookingType({ ...newType, areaId: selectedArea.id });
            setNewType({ name: '', description: '', priceCents: 0 });
            onUpdate();
        } catch (error) {
            setFeedback(error instanceof Error ? error.message : 'Failed to create booking type');
        }
    }

    async function deletePendingBookingType() {
        const bookingType = bookingTypePendingDeletion;
        if (!canManage || !bookingType) return;
        setFeedback(null);
        try {
            await deleteBookingType(bookingType.id);
            onUpdate();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to delete booking type';
            setFeedback(message);
            throw new Error(message);
        }
    }

    async function saveType(event: React.FormEvent, id: number) {
        event.preventDefault();
        if (!canManage || !editingType.name.trim()) return;
        setFeedback(null);
        try {
            await updateBookingType(id, editingType);
            setEditingTypeId(null);
            onUpdate();
        } catch (error) {
            setFeedback(error instanceof Error ? error.message : 'Failed to update booking type');
        }
    }

    return (
        <>
        <div className="space-y-8">
            {feedback && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{feedback}</p>}
            <div className="rounded-lg border border-[var(--border)] bg-[#f8f9f5] p-4">
                <label className="block text-sm font-semibold text-[#344039]">Booking area</label>
                <select value={selectedArea.id} onChange={e => setSelectedAreaId(Number(e.target.value))} className="mt-2 w-full max-w-md rounded-md border border-[var(--border)] bg-white p-2">
                    {areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
                </select>
                <p className="mt-2 text-sm text-[var(--muted)]">
                    {canManage ? `You can manage ${selectedArea.name} bookings.` : `${selectedArea.name} bookings are read-only for your account.`}
                    {!areaConfig && ' Organisation defaults are shown until this area saves its own rules.'}
                </p>
            </div>

            <form onSubmit={saveRules} className="space-y-6 rounded-lg border border-gray-200 bg-gray-50 p-6">
                <h3 className="text-lg font-medium text-gray-900">{selectedArea.name} booking rules</h3>
                <fieldset disabled={!canManage || saving} className="grid grid-cols-1 gap-6 disabled:opacity-70 md:grid-cols-2">
                    <div>
                        <label className="flex items-center text-sm text-gray-900">
                            <input type="checkbox" checked={formConfig.walkInsAllowed} onChange={e => setFormConfig({ ...formConfig, walkInsAllowed: e.target.checked })} className="mr-2 h-4 w-4" />
                            Allow walk-ins
                        </label>
                        <label className="mt-4 block text-sm font-medium text-gray-700">Walk-in notes</label>
                        <input value={formConfig.walkInNotes} onChange={e => setFormConfig({ ...formConfig, walkInNotes: e.target.value })} className="mt-1 block w-full rounded-md border border-gray-300 p-2" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <label className="text-sm font-medium text-gray-700">Group threshold
                            <input type="number" min={1} value={formConfig.groupBookingThreshold} onChange={e => setFormConfig({ ...formConfig, groupBookingThreshold: Number(e.target.value) })} className="mt-1 block w-full rounded-md border border-gray-300 p-2" />
                        </label>
                        <label className="text-sm font-medium text-gray-700">Lead time (hours)
                            <input type="number" min={0} value={formConfig.leadTimeHours} onChange={e => setFormConfig({ ...formConfig, leadTimeHours: Number(e.target.value) })} className="mt-1 block w-full rounded-md border border-gray-300 p-2" />
                        </label>
                    </div>
                    <label className="text-sm font-medium text-gray-700">Cancellation policy
                        <textarea rows={4} value={formConfig.cancellationPolicyText} onChange={e => setFormConfig({ ...formConfig, cancellationPolicyText: e.target.value })} className="mt-1 block w-full rounded-md border border-gray-300 p-2" />
                    </label>
                    <div className="space-y-3">
                        <label className="block text-sm font-medium text-gray-700">Children policy
                            <textarea rows={2} value={formConfig.kidsPolicy} onChange={e => setFormConfig({ ...formConfig, kidsPolicy: e.target.value })} className="mt-1 block w-full rounded-md border border-gray-300 p-2" />
                        </label>
                        <label className="block text-sm font-medium text-gray-700">Pets policy
                            <textarea rows={2} value={formConfig.petsPolicy} onChange={e => setFormConfig({ ...formConfig, petsPolicy: e.target.value })} className="mt-1 block w-full rounded-md border border-gray-300 p-2" />
                        </label>
                    </div>
                    <div className="md:col-span-2">
                        <button type="submit" className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:bg-gray-400">{saving ? 'Saving…' : 'Save area rules'}</button>
                    </div>
                </fieldset>
            </form>

            <section className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">{selectedArea.name} experiences / booking types</h3>
                <div className="divide-y divide-gray-200 overflow-hidden rounded-md border border-gray-200 bg-white">
                    {bookingTypes.map(type => (
                        <div key={type.id} className="p-4">
                            {editingTypeId === type.id ? (
                                <form onSubmit={event => saveType(event, type.id)} className="space-y-3">
                                    <input required disabled={!canManage} value={editingType.name} onChange={e => setEditingType({ ...editingType, name: e.target.value })} className="block w-full rounded-md border border-gray-300 p-2" />
                                    <textarea disabled={!canManage} rows={2} value={editingType.description} onChange={e => setEditingType({ ...editingType, description: e.target.value })} className="block w-full rounded-md border border-gray-300 p-2" />
                                    <input disabled={!canManage} type="number" value={editingType.priceCents} onChange={e => setEditingType({ ...editingType, priceCents: Number(e.target.value) })} className="block w-36 rounded-md border border-gray-300 p-2" />
                                    <div className="flex gap-2"><button className="rounded bg-indigo-600 px-3 py-2 text-sm text-white">Save</button><button type="button" onClick={() => setEditingTypeId(null)} className="rounded border px-3 py-2 text-sm">Cancel</button></div>
                                </form>
                            ) : (
                                <div className="flex items-start justify-between gap-4">
                                    <div><p className="font-medium text-indigo-700">{type.name}</p><p className="text-sm text-gray-500">{type.priceCents ? `$${(type.priceCents / 100).toFixed(2)}` : 'Free'}</p>{type.description && <p className="mt-1 text-sm text-gray-600">{type.description}</p>}</div>
                                    {canManage && <div className="flex gap-3 text-sm"><button type="button" onClick={() => { setEditingTypeId(type.id); setEditingType({ name: type.name, description: type.description || '', priceCents: type.priceCents || 0 }); }} className="text-[var(--brand-strong)]">Edit</button><button type="button" onClick={() => setBookingTypePendingDeletion({ id: type.id, name: type.name })} className="text-red-600">Delete</button></div>}
                                </div>
                            )}
                        </div>
                    ))}
                    {bookingTypes.length === 0 && <p className="p-4 text-sm italic text-gray-500">No area-specific booking types defined.</p>}
                </div>
                {canManage && <form onSubmit={addType} className="grid grid-cols-1 gap-3 rounded-lg bg-gray-50 p-4 md:grid-cols-[1fr_10rem]">
                    <input required value={newType.name} onChange={e => setNewType({ ...newType, name: e.target.value })} placeholder="New experience name" className="rounded-md border border-gray-300 p-2" />
                    <input type="number" value={newType.priceCents} onChange={e => setNewType({ ...newType, priceCents: Number(e.target.value) })} placeholder="Price cents" className="rounded-md border border-gray-300 p-2" />
                    <textarea rows={2} value={newType.description} onChange={e => setNewType({ ...newType, description: e.target.value })} placeholder="Description" className="rounded-md border border-gray-300 p-2 md:col-span-2" />
                    <button type="submit" className="w-fit rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white md:col-span-2">Add experience</button>
                </form>}
            </section>
        </div>
        <ConfirmDialog
            open={Boolean(bookingTypePendingDeletion)}
            onClose={() => setBookingTypePendingDeletion(null)}
            onConfirm={deletePendingBookingType}
            title="Delete booking type?"
            description={bookingTypePendingDeletion ? `"${bookingTypePendingDeletion.name}" will be permanently removed from this area's booking options.` : ''}
            confirmLabel="Delete booking type"
            destructive
        />
        </>
    );
}
