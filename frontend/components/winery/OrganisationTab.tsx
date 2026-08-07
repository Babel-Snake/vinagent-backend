'use client';

import { useState } from 'react';
import { createWineryContact, deleteWineryContact, updateWineryContact, Winery, WineryContact } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import ConfirmDialog from '../ui/ConfirmDialog';

type ContactForm = Partial<WineryContact> & {
    primaryAreaId: number | null;
    linkedAreaIds: number[];
};

function placement(contact: WineryContact) {
    const areas = contact.OperationalAreas || [];
    const primary = areas.find(area => area.WineryContactArea?.relationshipType === 'PRIMARY');
    return {
        primaryAreaId: primary?.id || null,
        linkedAreaIds: areas.filter(area => area.WineryContactArea?.relationshipType === 'LINKED').map(area => area.id)
    };
}

function emptyContact(primaryAreaId: number | null): ContactForm {
    return {
        name: '', role: '', email: '', phone: '', layer: '', notes: '',
        reportsToId: undefined, responsibilities: '', isActive: true,
        primaryAreaId, linkedAreaIds: []
    };
}

export function OrganisationTab({ winery, onUpdate }: { winery: Winery, onUpdate: () => void }) {
    const contacts = winery.contacts || [];
    const areas = winery.OperationalAreas || [];
    const isGlobalManager = Boolean(winery.configurationAccess?.isGlobalManager);
    const managedAreaIds = winery.configurationAccess?.managedAreaIds || [];
    const defaultPrimaryAreaId = isGlobalManager ? null : (managedAreaIds[0] || null);
    const [filter, setFilter] = useState(isGlobalManager ? 'all' : String(defaultPrimaryAreaId || 'all'));
    const [form, setForm] = useState<ContactForm>(() => emptyContact(defaultPrimaryAreaId));
    const [editingId, setEditingId] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [contactPendingDeletion, setContactPendingDeletion] = useState<WineryContact | null>(null);

    const primaryAreaIdFor = (contact: WineryContact) => placement(contact).primaryAreaId;
    const canEditContact = (contact: WineryContact) => isGlobalManager || managedAreaIds.includes(Number(primaryAreaIdFor(contact)));
    const filteredContacts = contacts.filter(contact => {
        if (filter === 'all') return true;
        const contactAreas = contact.OperationalAreas || [];
        if (filter === 'shared') return contactAreas.length === 0;
        return contactAreas.some(area => area.id === Number(filter));
    });
    const groupedContacts = filteredContacts.reduce((groups, contact) => {
        const layer = contact.layer || 'Unassigned';
        (groups[layer] ||= []).push(contact);
        return groups;
    }, {} as Record<string, WineryContact[]>);
    const editingContact = editingId ? contacts.find(contact => contact.id === editingId) : null;
    const canEditForm = editingContact ? canEditContact(editingContact) : Boolean(isGlobalManager || defaultPrimaryAreaId);

    function resetForm() {
        setForm(emptyContact(defaultPrimaryAreaId));
        setEditingId(null);
    }

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        setFeedback(null);
        setLoading(true);
        try {
            if (editingId) await updateWineryContact(editingId, form);
            else await createWineryContact(form);
            resetForm();
            onUpdate();
        } catch (error: unknown) {
            setFeedback(errorMessage(error, editingId ? 'Failed to update contact' : 'Failed to add contact'));
        } finally {
            setLoading(false);
        }
    }

    async function deletePendingContact() {
        const contact = contactPendingDeletion;
        if (!contact) return;
        setFeedback(null);
        try {
            await deleteWineryContact(contact.id);
            if (editingId === contact.id) resetForm();
            onUpdate();
        } catch (error: unknown) {
            const message = errorMessage(error, 'Failed to delete contact');
            setFeedback(message);
            throw new Error(message);
        }
    }

    function handleEdit(contact: WineryContact) {
        const contactPlacement = placement(contact);
        setForm({
            name: contact.name,
            role: contact.role,
            email: contact.email || '',
            phone: contact.phone || '',
            layer: contact.layer || '',
            notes: contact.notes || '',
            reportsToId: contact.reportsToId,
            responsibilities: contact.responsibilities || '',
            isActive: contact.isActive,
            ...contactPlacement
        });
        setEditingId(contact.id);
    }

    function toggleLinkedArea(areaId: number) {
        setForm(current => ({
            ...current,
            linkedAreaIds: current.linkedAreaIds.includes(areaId)
                ? current.linkedAreaIds.filter(id => id !== areaId)
                : [...current.linkedAreaIds, areaId]
        }));
    }

    function managerName(id?: number) {
        return contacts.find(contact => contact.id === id)?.name || '-';
    }

    return (
        <>
        <div className="space-y-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900">Organisation map</h3>
                    <p className="mt-1 text-sm text-gray-600">Reporting lines remain winery-wide. Area placement identifies operational ownership and cross-area responsibilities.</p>
                </div>
                <label className="text-sm font-medium text-gray-700">View
                    <select value={filter} onChange={event => setFilter(event.target.value)} className="mt-1 block min-w-52 rounded-md border border-gray-300 bg-white p-2">
                        <option value="all">All contacts</option>
                        <option value="shared">Organisation-wide</option>
                        {areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
                    </select>
                </label>
            </div>

            {feedback && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{feedback}</p>}

            {Object.keys(groupedContacts).length === 0 ? (
                <p className="text-sm italic text-gray-500">No contacts in this scope.</p>
            ) : Object.entries(groupedContacts).map(([layer, layerContacts]) => (
                <section key={layer}>
                    <h4 className="rounded-t-md border-b border-indigo-100 bg-indigo-50 px-4 py-2 font-semibold text-indigo-700">{layer}</h4>
                    <div className="overflow-x-auto rounded-b-md border border-t-0 border-gray-200">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50"><tr>
                                {['Name', 'Role', 'Areas', 'Email', 'Reports to', ''].map(label => <th key={label} className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-600">{label}</th>)}
                            </tr></thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                                {layerContacts.map(contact => (
                                    <tr key={contact.id}>
                                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{contact.name}</td>
                                        <td className="px-4 py-3 text-sm text-gray-600">{contact.role}</td>
                                        <td className="px-4 py-3"><div className="flex flex-wrap gap-1">
                                            {(contact.OperationalAreas || []).length === 0
                                                ? <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">Organisation</span>
                                                : contact.OperationalAreas?.map(area => (
                                                    <span key={area.id} className={`rounded-full px-2 py-1 text-xs ${area.WineryContactArea?.relationshipType === 'PRIMARY' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>{area.name}</span>
                                                ))}
                                        </div></td>
                                        <td className="px-4 py-3 text-sm text-gray-600">{contact.email || '-'}</td>
                                        <td className="px-4 py-3 text-sm text-gray-600">{managerName(contact.reportsToId)}</td>
                                        <td className="px-4 py-3 text-right text-sm">
                                            {canEditContact(contact) && <>
                                                <button type="button" onClick={() => handleEdit(contact)} className="mr-3 text-[var(--brand-strong)] hover:underline">Edit</button>
                                                <button type="button" onClick={() => setContactPendingDeletion(contact)} className="text-red-600 hover:text-red-900">Delete</button>
                                            </>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            ))}

            {!canEditForm && !editingId && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Only winery managers can add organisation-wide contacts. Area managers can add contacts to areas they manage.</div>
            )}

            <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-gray-50 p-6">
                <fieldset disabled={!canEditForm || loading} className="grid grid-cols-1 gap-4 disabled:opacity-70 sm:grid-cols-2">
                    <h4 className="sm:col-span-2 font-semibold text-gray-900">{editingId ? 'Edit contact' : 'Add contact'}</h4>
                    <label className="text-sm font-medium text-gray-700">Name
                        <input required value={form.name || ''} onChange={event => setForm({ ...form, name: event.target.value })} className="mt-1 w-full rounded-md border border-gray-300 p-2" />
                    </label>
                    <label className="text-sm font-medium text-gray-700">Role
                        <input required value={form.role || ''} onChange={event => setForm({ ...form, role: event.target.value })} className="mt-1 w-full rounded-md border border-gray-300 p-2" />
                    </label>
                    <label className="text-sm font-medium text-gray-700">Primary area
                        <select value={form.primaryAreaId || ''} onChange={event => setForm({ ...form, primaryAreaId: event.target.value ? Number(event.target.value) : null, linkedAreaIds: form.linkedAreaIds.filter(id => id !== Number(event.target.value)) })} className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2">
                            {isGlobalManager && <option value="">Organisation-wide</option>}
                            {areas.filter(area => isGlobalManager || managedAreaIds.includes(area.id)).map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
                        </select>
                    </label>
                    <label className="text-sm font-medium text-gray-700">Layer / department
                        <input value={form.layer || ''} onChange={event => setForm({ ...form, layer: event.target.value })} className="mt-1 w-full rounded-md border border-gray-300 p-2" />
                    </label>
                    <label className="text-sm font-medium text-gray-700">Email
                        <input type="email" value={form.email || ''} onChange={event => setForm({ ...form, email: event.target.value })} className="mt-1 w-full rounded-md border border-gray-300 p-2" />
                    </label>
                    <label className="text-sm font-medium text-gray-700">Phone
                        <input value={form.phone || ''} onChange={event => setForm({ ...form, phone: event.target.value })} className="mt-1 w-full rounded-md border border-gray-300 p-2" />
                    </label>
                    <label className="text-sm font-medium text-gray-700">Reports to
                        <select value={form.reportsToId || ''} onChange={event => setForm({ ...form, reportsToId: event.target.value ? Number(event.target.value) : undefined })} className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2">
                            <option value="">No reporting manager</option>
                            {contacts.filter(contact => contact.id !== editingId).map(contact => <option key={contact.id} value={contact.id}>{contact.name} ({contact.role})</option>)}
                        </select>
                    </label>
                    <div className="sm:col-span-2">
                        <span className="text-sm font-medium text-gray-700">Linked areas</span>
                        <div className="mt-2 flex flex-wrap gap-3">
                            {areas.filter(area => area.id !== form.primaryAreaId).map(area => {
                                const checked = form.linkedAreaIds.includes(area.id);
                                const canChange = Boolean(form.primaryAreaId) && (isGlobalManager || managedAreaIds.includes(area.id) || checked);
                                return <label key={area.id} className="inline-flex items-center gap-2 text-sm text-gray-700">
                                    <input type="checkbox" checked={checked} disabled={!canChange} onChange={() => toggleLinkedArea(area.id)} className="h-4 w-4 rounded border-gray-300" />
                                    {area.name}
                                </label>;
                            })}
                        </div>
                    </div>
                    <label className="sm:col-span-2 text-sm font-medium text-gray-700">Responsibilities / jurisdiction
                        <textarea rows={2} value={form.responsibilities || ''} onChange={event => setForm({ ...form, responsibilities: event.target.value })} className="mt-1 w-full rounded-md border border-gray-300 p-2" />
                    </label>
                    <label className="sm:col-span-2 text-sm font-medium text-gray-700">Internal notes
                        <textarea rows={2} value={form.notes || ''} onChange={event => setForm({ ...form, notes: event.target.value })} className="mt-1 w-full rounded-md border border-gray-300 p-2" />
                    </label>
                    <div className="sm:col-span-2 flex items-center justify-between gap-4">
                        <label className="inline-flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={Boolean(form.isActive)} onChange={event => setForm({ ...form, isActive: event.target.checked })} /> Active</label>
                        <div className="flex gap-2">
                            {editingId && <button type="button" onClick={resetForm} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm">Cancel</button>}
                            <button type="submit" className="btn-primary">{loading ? 'Saving...' : editingId ? 'Save changes' : 'Add contact'}</button>
                        </div>
                    </div>
                </fieldset>
            </form>
        </div>
        <ConfirmDialog
            open={Boolean(contactPendingDeletion)}
            onClose={() => setContactPendingDeletion(null)}
            onConfirm={deletePendingContact}
            title="Delete contact?"
            description={contactPendingDeletion ? `"${contactPendingDeletion.name}" will be permanently removed from the organisation map.` : ''}
            confirmLabel="Delete contact"
            destructive
        />
        </>
    );
}
