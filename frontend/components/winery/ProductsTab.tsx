'use client';

import { useState } from 'react';
import { createProduct, updateProduct, deleteProduct, type Winery, type WineryProduct } from '../../lib/api';
import ConfirmDialog from '../ui/ConfirmDialog';

const emptyProductForm = {
    name: '',
    category: 'Red',
    vintage: '',
    price: '',
    stockStatus: 'IN_STOCK',
    tastingNotes: '',
    keySellingPoints: '',
    pairingSuggestions: '',
    awards: ''
};

const productCategories = ['Red', 'White', 'Sparkling', 'Rose', 'Fortified', 'Merchandise', 'Event'];
const stockStatuses = [
    { value: 'IN_STOCK', label: 'In Stock' },
    { value: 'LOW_STOCK', label: 'Low Stock' },
    { value: 'OUT_OF_STOCK', label: 'Out of Stock' }
];

export function ProductsTab({ winery, onUpdate }: { winery: Winery, onUpdate: () => void }) {
    const products = winery.products || [];
    const [newProduct, setNewProduct] = useState(emptyProductForm);
    const [editingProductId, setEditingProductId] = useState<number | null>(null);
    const [editingProduct, setEditingProduct] = useState(emptyProductForm);
    const [loading, setLoading] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [productPendingDeletion, setProductPendingDeletion] = useState<WineryProduct | null>(null);

    const keySellingPointsToInput = (value: unknown) => {
        if (Array.isArray(value)) return value.join(', ');
        return typeof value === 'string' ? value : '';
    };

    const buildPayload = (product: typeof emptyProductForm) => ({
        ...product,
        price: parseFloat(product.price) || 0,
        keySellingPoints: product.keySellingPoints
            ? product.keySellingPoints.split(',').map(s => s.trim()).filter(Boolean)
            : []
    });

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setFeedback(null);
        setLoading(true);
        try {
            await createProduct(buildPayload(newProduct));
            setNewProduct(emptyProductForm);
            onUpdate();
        } catch (error) {
            setFeedback(error instanceof Error ? error.message : 'Failed to add product');
        } finally {
            setLoading(false);
        }
    };

    const deletePendingProduct = async () => {
        const product = productPendingDeletion;
        if (!product) return;
        setFeedback(null);
        try {
            await deleteProduct(product.id);
            if (editingProductId === product.id) handleCancelEdit();
            onUpdate();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to delete product';
            setFeedback(message);
            throw new Error(message);
        }
    };

    const handleEdit = (product: WineryProduct) => {
        setEditingProductId(product.id);
        setEditingProduct({
            name: product.name || '',
            category: product.category || 'Red',
            vintage: product.vintage || '',
            price: product.price !== undefined && product.price !== null ? String(product.price) : '',
            stockStatus: product.stockStatus || 'IN_STOCK',
            tastingNotes: product.tastingNotes || '',
            keySellingPoints: keySellingPointsToInput(product.keySellingPoints),
            pairingSuggestions: product.pairingSuggestions || '',
            awards: product.awards || ''
        });
    };

    const handleCancelEdit = () => {
        setEditingProductId(null);
        setEditingProduct(emptyProductForm);
    };

    const handleUpdate = async (e: React.FormEvent, id: number) => {
        e.preventDefault();
        setFeedback(null);
        setSavingEdit(true);
        try {
            await updateProduct(id, buildPayload(editingProduct));
            handleCancelEdit();
            onUpdate();
        } catch (error) {
            setFeedback(error instanceof Error ? error.message : 'Failed to update product');
        } finally {
            setSavingEdit(false);
        }
    };

    return (
        <>
        <div className="space-y-8">
            {feedback && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{feedback}</p>}
            {/* List */}
            <div>
                <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">Current Products</h3>
                <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                    <table className="min-w-full divide-y divide-gray-300">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Name</th>
                                <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Vintage</th>
                                <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Category</th>
                                <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Price</th>
                                <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Status</th>
                                <th className="relative py-3.5 pl-3 pr-4 sm:pr-6"><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                            {products.map(product => (
                                editingProductId === product.id ? (
                                    <tr key={product.id}>
                                        <td colSpan={6} className="bg-gray-50 px-4 py-5 sm:px-6">
                                            <form onSubmit={(e) => handleUpdate(e, product.id)} className="grid grid-cols-1 gap-y-5 gap-x-4 sm:grid-cols-6">
                                                <div className="sm:col-span-3">
                                                    <label className="block text-sm font-medium text-gray-700">Name</label>
                                                    <input type="text" required value={editingProduct.name} onChange={e => setEditingProduct({ ...editingProduct, name: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                                                </div>
                                                <div className="sm:col-span-1">
                                                    <label className="block text-sm font-medium text-gray-700">Vintage</label>
                                                    <input type="text" value={editingProduct.vintage} onChange={e => setEditingProduct({ ...editingProduct, vintage: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                                                </div>
                                                <div className="sm:col-span-2">
                                                    <label className="block text-sm font-medium text-gray-700">Category</label>
                                                    <select value={editingProduct.category} onChange={e => setEditingProduct({ ...editingProduct, category: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2">
                                                        {productCategories.map(category => <option key={category}>{category}</option>)}
                                                    </select>
                                                </div>
                                                <div className="sm:col-span-1">
                                                    <label className="block text-sm font-medium text-gray-700">Price</label>
                                                    <input type="number" step="0.01" value={editingProduct.price} onChange={e => setEditingProduct({ ...editingProduct, price: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                                                </div>
                                                <div className="sm:col-span-2">
                                                    <label className="block text-sm font-medium text-gray-700">Status</label>
                                                    <select value={editingProduct.stockStatus} onChange={e => setEditingProduct({ ...editingProduct, stockStatus: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2">
                                                        {stockStatuses.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}
                                                    </select>
                                                </div>
                                                <div className="sm:col-span-3">
                                                    <label className="block text-sm font-medium text-gray-700">Tasting Notes</label>
                                                    <input type="text" value={editingProduct.tastingNotes} onChange={e => setEditingProduct({ ...editingProduct, tastingNotes: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                                                </div>
                                                <div className="sm:col-span-6">
                                                    <label className="block text-sm font-medium text-gray-700">Selling Points (Comma separated)</label>
                                                    <input type="text" value={editingProduct.keySellingPoints} onChange={e => setEditingProduct({ ...editingProduct, keySellingPoints: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                                                </div>
                                                <div className="sm:col-span-6">
                                                    <label className="block text-sm font-medium text-gray-700">Awards/Accolades</label>
                                                    <input type="text" value={editingProduct.awards} onChange={e => setEditingProduct({ ...editingProduct, awards: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                                                </div>
                                                <div className="sm:col-span-6">
                                                    <label className="block text-sm font-medium text-gray-700">Pairing Suggestions</label>
                                                    <input type="text" value={editingProduct.pairingSuggestions} onChange={e => setEditingProduct({ ...editingProduct, pairingSuggestions: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                                                </div>
                                                <div className="sm:col-span-6 flex justify-end gap-3">
                                                    <button type="button" onClick={handleCancelEdit} className="inline-flex justify-center rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">Cancel</button>
                                                    <button type="submit" disabled={savingEdit} className="btn-primary">
                                                        {savingEdit ? 'Saving...' : 'Save Product'}
                                                    </button>
                                                </div>
                                            </form>
                                        </td>
                                    </tr>
                                ) : (
                                    <tr key={product.id}>
                                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">{product.name}</td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{product.vintage || '-'}</td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{product.category}</td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">${product.price}</td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                            <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${product.stockStatus === 'IN_STOCK' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                {stockStatuses.find(status => status.value === product.stockStatus)?.label || product.stockStatus}
                                            </span>
                                        </td>
                                        <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                                            <button type="button" onClick={() => handleEdit(product)} className="mr-4 text-[var(--brand-strong)] hover:underline">Edit</button>
                                            <button type="button" onClick={() => setProductPendingDeletion(product)} className="text-red-600 hover:text-red-900">Delete</button>
                                        </td>
                                    </tr>
                                )
                            ))}
                            {products.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-sm text-gray-500">No products added yet.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add Form */}
            <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                <h4 className="text-md font-medium text-gray-900 mb-4">Add New Product</h4>
                <form onSubmit={handleCreate} className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                    <div className="sm:col-span-3">
                        <label className="block text-sm font-medium text-gray-700">Name</label>
                        <input type="text" required value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    </div>
                    <div className="sm:col-span-1">
                        <label className="block text-sm font-medium text-gray-700">Vintage</label>
                        <input type="text" value={newProduct.vintage} onChange={e => setNewProduct({ ...newProduct, vintage: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" placeholder="2023" />
                    </div>

                    <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-gray-700">Category</label>
                        <select value={newProduct.category} onChange={e => setNewProduct({ ...newProduct, category: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2">
                            {productCategories.map(category => <option key={category}>{category}</option>)}
                        </select>
                    </div>

                    <div className="sm:col-span-1">
                        <label className="block text-sm font-medium text-gray-700">Price</label>
                        <input type="number" step="0.01" value={newProduct.price} onChange={e => setNewProduct({ ...newProduct, price: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    </div>

                    <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-gray-700">Status</label>
                        <select value={newProduct.stockStatus} onChange={e => setNewProduct({ ...newProduct, stockStatus: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2">
                            {stockStatuses.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}
                        </select>
                    </div>

                    <div className="sm:col-span-3">
                        <label className="block text-sm font-medium text-gray-700">Tasting Notes</label>
                        <input type="text" value={newProduct.tastingNotes} onChange={e => setNewProduct({ ...newProduct, tastingNotes: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    </div>

                    <div className="sm:col-span-6">
                        <label className="block text-sm font-medium text-gray-700">Selling Points (Comma separated)</label>
                        <input type="text" value={newProduct.keySellingPoints} onChange={e => setNewProduct({ ...newProduct, keySellingPoints: e.target.value })} placeholder="Gold Medal 2023, Organic, Single Vineyard" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    </div>

                    <div className="sm:col-span-6">
                        <label className="block text-sm font-medium text-gray-700">Awards/Accolades</label>
                        <input type="text" value={newProduct.awards} onChange={e => setNewProduct({ ...newProduct, awards: e.target.value })} placeholder="Gold Medal, 95pts" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    </div>

                    <div className="sm:col-span-6">
                        <label className="block text-sm font-medium text-gray-700">Pairing Suggestions</label>
                        <input type="text" value={newProduct.pairingSuggestions} onChange={e => setNewProduct({ ...newProduct, pairingSuggestions: e.target.value })} placeholder="Steak, Hard Cheeses" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    </div>

                    <div className="sm:col-span-6">
                        <button type="submit" disabled={loading} className="btn-primary">
                            {loading ? 'Adding...' : 'Add Product'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
        <ConfirmDialog
            open={Boolean(productPendingDeletion)}
            onClose={() => setProductPendingDeletion(null)}
            onConfirm={deletePendingProduct}
            title="Delete product?"
            description={productPendingDeletion ? `"${productPendingDeletion.name}" will be permanently removed.` : ''}
            confirmLabel="Delete product"
            destructive
        />
        </>
    );
}
