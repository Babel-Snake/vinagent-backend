'use client';

import { useState } from 'react';
import { createWineryContact, deleteWineryContact, updateWineryContact, Winery, WineryContact } from '../../lib/api';

export function OrganisationTab({ winery, onUpdate }: { winery: Winery, onUpdate: () => void }) {
    const contacts = winery.contacts || [];
    const [newContact, setNewContact] = useState<Partial<WineryContact>>({
        name: '',
        role: '',
        email: '',
        phone: '',
        layer: '',
        notes: '',
        isActive: true
    });
    const [loading, setLoading] = useState(false);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await createWineryContact(newContact);

            setNewContact({
                name: '',
                role: '',
                email: '',
                phone: '',
                layer: '',
                notes: '',
                isActive: true
            });
            onUpdate();
        } catch (e) {
            alert('Failed to add contact');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this contact?')) return;
        try {
            await deleteWineryContact(id);
            onUpdate();
        } catch (e) {
            alert('Failed to delete contact');
        }
    };

    // Group contacts by layer
    const groupedContacts: Record<string, WineryContact[]> = contacts.reduce((acc, contact) => {
        const layer = contact.layer || 'Unassigned';
        if (!acc[layer]) acc[layer] = [];
        acc[layer].push(contact);
        return acc;
    }, {} as Record<string, WineryContact[]>);

    return (
        <div className="space-y-8">
            {/* List by Layer */}
            <div>
                <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">Organisation Map</h3>
                {Object.keys(groupedContacts).length === 0 ? (
                    <div className="text-sm text-gray-500 italic pb-4">No contacts added yet.</div>
                ) : (
                    Object.entries(groupedContacts).map(([layer, layerContacts]) => (
                        <div key={layer} className="mb-6">
                            <h4 className="text-md font-semibold text-indigo-700 bg-indigo-50 py-2 px-4 rounded-t-md border-b border-indigo-100">{layer}</h4>
                            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-b-md">
                                <table className="min-w-full divide-y divide-gray-300">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Name</th>
                                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Role</th>
                                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Email</th>
                                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Phone</th>
                                            <th className="relative py-3.5 pl-3 pr-4 sm:pr-6"><span className="sr-only">Actions</span></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 bg-white">
                                        {layerContacts.map((contact) => (
                                            <tr key={contact.id}>
                                                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">{contact.name}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{contact.role}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{contact.email || '-'}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{contact.phone || '-'}</td>
                                                <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                                                    <button onClick={() => handleDelete(contact.id)} className="text-red-600 hover:text-red-900">Delete</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Add Form */}
            <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                <h4 className="text-md font-medium text-gray-900 mb-4">Add Contact</h4>
                <form onSubmit={handleCreate} className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                    <div className="sm:col-span-3">
                        <label className="block text-sm font-medium text-gray-700">Name</label>
                        <input type="text" required value={newContact.name} onChange={e => setNewContact({ ...newContact, name: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    </div>
                    
                    <div className="sm:col-span-3">
                        <label className="block text-sm font-medium text-gray-700">Role</label>
                        <input type="text" required value={newContact.role} onChange={e => setNewContact({ ...newContact, role: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" placeholder="e.g. Tasting Room Manager" />
                    </div>

                    <div className="sm:col-span-3">
                        <label className="block text-sm font-medium text-gray-700">Layer/Department</label>
                        <input type="text" value={newContact.layer} onChange={e => setNewContact({ ...newContact, layer: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" placeholder="e.g. Management, Operations, Sales" />
                    </div>

                    <div className="sm:col-span-3">
                        <label className="block text-sm font-medium text-gray-700">Email (Optional)</label>
                        <input type="email" value={newContact.email} onChange={e => setNewContact({ ...newContact, email: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    </div>

                    <div className="sm:col-span-3">
                        <label className="block text-sm font-medium text-gray-700">Phone (Optional)</label>
                        <input type="text" value={newContact.phone} onChange={e => setNewContact({ ...newContact, phone: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    </div>

                    <div className="sm:col-span-6">
                        <label className="block text-sm font-medium text-gray-700">Internal Notes</label>
                        <textarea rows={2} value={newContact.notes} onChange={e => setNewContact({ ...newContact, notes: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    </div>

                    <div className="sm:col-span-6 flex gap-4 items-center">
                        <label className="flex items-center text-sm font-medium text-gray-700">
                            <input type="checkbox" checked={newContact.isActive} onChange={e => setNewContact({ ...newContact, isActive: e.target.checked })} className="mr-2 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                            Active Contact
                        </label>
                        <div className="flex-1 text-right">
                            <button type="submit" disabled={loading} className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:bg-gray-400">
                                {loading ? 'Adding...' : 'Add Contact'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
