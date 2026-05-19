'use client';

import { useState } from 'react';
import { updateBookingsConfig, createBookingType, updateBookingType, deleteBookingType } from '../../lib/api';

export function BookingsTab({ winery, onUpdate }: { winery: any, onUpdate: () => void }) {
    const config = winery.bookingsConfig || {};
    const bookingTypes = winery.bookingTypes || [];

    const [formConfig, setFormConfig] = useState({
        walkInsAllowed: config.walkInsAllowed !== false,
        walkInNotes: config.walkInNotes || '',
        groupBookingThreshold: config.groupBookingThreshold || 8,
        leadTimeHours: config.leadTimeHours || 24,
        cancellationPolicyText: config.cancellationPolicyText || '',
        kidsPolicy: config.kidsPolicy || '',
        petsPolicy: config.petsPolicy || '',
        defaultResponseStrategy: config.defaultResponseStrategy || 'create_task'
    });

    // Quick Add for Booking Type
    const [newType, setNewType] = useState({ name: '', description: '', priceCents: 0 });
    const [editingTypeId, setEditingTypeId] = useState<number | null>(null);
    const [editingType, setEditingType] = useState({ name: '', description: '', priceCents: 0 });

    const [saving, setSaving] = useState(false);
    const [savingType, setSavingType] = useState(false);

    const handleConfigSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await updateBookingsConfig(formConfig);
            alert('Booking Rules Saved!');
            onUpdate();
        } catch (e) { alert('Failed to save rules'); }
        finally { setSaving(false); }
    };

    const handleAddType = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newType.name) return;
        try {
            await createBookingType(newType);
            setNewType({ name: '', description: '', priceCents: 0 });
            onUpdate();
        } catch (e) { alert('Failed to creating type'); }
    };

    const handleDeleteType = async (id: number) => {
        if (!confirm('Delete this booking type?')) return;
        try {
            await deleteBookingType(id);
            if (editingTypeId === id) handleCancelEditType();
            onUpdate();
        } catch (e) { alert('Failed'); }
    }

    const handleEditType = (type: any) => {
        setEditingTypeId(type.id);
        setEditingType({
            name: type.name || '',
            description: type.description || '',
            priceCents: type.priceCents || 0
        });
    };

    const handleCancelEditType = () => {
        setEditingTypeId(null);
        setEditingType({ name: '', description: '', priceCents: 0 });
    };

    const handleSaveType = async (e: React.FormEvent, id: number) => {
        e.preventDefault();
        if (!editingType.name) return;
        setSavingType(true);
        try {
            await updateBookingType(id, editingType);
            handleCancelEditType();
            onUpdate();
        } catch (e) {
            alert('Failed to update experience');
        } finally {
            setSavingType(false);
        }
    };

    return (
        <div className="space-y-8">
            {/* Global Rules */}
            <form onSubmit={handleConfigSubmit} className="bg-gray-50 p-6 rounded-lg border border-gray-200 space-y-6">
                <h3 className="text-lg font-medium text-gray-900">Global Booking Rules</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <div className="flex items-center mb-4">
                            <input type="checkbox" checked={formConfig.walkInsAllowed} onChange={e => setFormConfig({ ...formConfig, walkInsAllowed: e.target.checked })} className="h-4 w-4 text-indigo-600 rounded" />
                            <label className="ml-2 text-sm text-gray-900">Allow Walk-ins</label>
                        </div>
                        <label className="block text-sm font-medium text-gray-700">Walk-in Notes</label>
                        <input type="text" value={formConfig.walkInNotes} onChange={e => setFormConfig({ ...formConfig, walkInNotes: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Group Threshold (Guests)</label>
                        <input type="number" value={formConfig.groupBookingThreshold} onChange={e => setFormConfig({ ...formConfig, groupBookingThreshold: parseInt(e.target.value) })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Cancellation Policy</label>
                        <textarea rows={3} value={formConfig.cancellationPolicyText} onChange={e => setFormConfig({ ...formConfig, cancellationPolicyText: e.target.value })} className="block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Children / Pets Policy</label>
                        <div className="space-y-2 mt-1">
                            <input type="text" placeholder="Kids policy..." value={formConfig.kidsPolicy} onChange={e => setFormConfig({ ...formConfig, kidsPolicy: e.target.value })} className="block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                            <input type="text" placeholder="Pets policy..." value={formConfig.petsPolicy} onChange={e => setFormConfig({ ...formConfig, petsPolicy: e.target.value })} className="block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                        </div>
                    </div>
                </div>

                <div className="pt-4">
                    <button type="submit" disabled={saving} className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400">
                        {saving ? 'Saving...' : 'Save Rules'}
                    </button>
                </div>
            </form>

            {/* Experiences List */}
            <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Experiences / Booking Types</h3>
                <div className="bg-white shadow overflow-hidden sm:rounded-md mb-4">
                    <ul role="list" className="divide-y divide-gray-200">
                        {bookingTypes.map((type: any) => (
                            <li key={type.id} className="px-4 py-4 sm:px-6">
                                {editingTypeId === type.id ? (
                                    <form onSubmit={(e) => handleSaveType(e, type.id)} className="space-y-4">
                                        <div className="flex gap-4 items-start w-full">
                                            <div className="flex-grow">
                                                <label className="block text-sm font-medium text-gray-700">Experience Name</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={editingType.name}
                                                    onChange={e => setEditingType({ ...editingType, name: e.target.value })}
                                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">Price (Cents)</label>
                                                <input
                                                    type="number"
                                                    value={editingType.priceCents}
                                                    onChange={e => setEditingType({ ...editingType, priceCents: parseInt(e.target.value) || 0 })}
                                                    className="mt-1 block w-28 rounded-md border-gray-300 shadow-sm border p-2"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Description</label>
                                            <textarea
                                                rows={2}
                                                value={editingType.description}
                                                onChange={e => setEditingType({ ...editingType, description: e.target.value })}
                                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                                            />
                                        </div>
                                        <div className="flex justify-end gap-3">
                                            <button
                                                type="button"
                                                onClick={handleCancelEditType}
                                                className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={savingType}
                                                className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400"
                                            >
                                                {savingType ? 'Saving...' : 'Save Experience'}
                                            </button>
                                        </div>
                                    </form>
                                ) : (
                                    <div className="flex justify-between items-center gap-4">
                                        <div>
                                            <p className="text-sm font-medium text-indigo-600 truncate">{type.name}</p>
                                            <p className="text-sm text-gray-500">{type.priceCents > 0 ? `$${(type.priceCents / 100).toFixed(2)}` : 'Free'}</p>
                                            {type.description && <p className="text-sm text-gray-600 mt-1 max-w-2xl">{type.description}</p>}
                                        </div>
                                        <div className="flex shrink-0 gap-3">
                                            <button onClick={() => handleEditType(type)} className="text-indigo-600 hover:text-indigo-900 text-sm">Edit</button>
                                            <button onClick={() => handleDeleteType(type.id)} className="text-red-600 hover:text-red-900 text-sm">Delete</button>
                                        </div>
                                    </div>
                                )}
                            </li>
                        ))}
                        {bookingTypes.length === 0 && <li className="px-4 py-4 text-gray-500 italic text-sm">No experiences defined.</li>}
                    </ul>
                </div>

                {/* Simple Add Form */}
                <form onSubmit={handleAddType} className="flex flex-col gap-4 bg-gray-50 p-4 rounded-lg">
                    <div className="flex gap-4 items-start w-full">
                        <div className="flex-grow">
                            <label className="block text-sm font-medium text-gray-700">New Experience Name</label>
                            <input type="text" required value={newType.name} onChange={e => setNewType({ ...newType, name: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Price (Cents)</label>
                            <input type="number" value={newType.priceCents} onChange={e => setNewType({ ...newType, priceCents: parseInt(e.target.value) })} className="mt-1 block w-24 rounded-md border-gray-300 shadow-sm border p-2" />
                        </div>
                    </div>
                    <div className="w-full">
                        <label className="block text-sm font-medium text-gray-700">Description</label>
                        <textarea
                            rows={2}
                            value={newType.description}
                            onChange={e => setNewType({ ...newType, description: e.target.value })}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                            placeholder="Optional short description of what's included..."
                        />
                    </div>
                    <div className="flex justify-end">
                        <button type="submit" className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700">
                            Add Experience
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
