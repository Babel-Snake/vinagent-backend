'use client';

import { useState } from 'react';
import { createProduct, deleteProduct } from '../../lib/api';

export function ProductsTab({ winery, onUpdate }: { winery: any, onUpdate: () => void }) {
    const products = winery.products || [];
    const [newProduct, setNewProduct] = useState({
        name: '',
        category: 'Red',
        vintage: '',
        price: '',
        stockStatus: 'IN_STOCK',
        tastingNotes: '',
        keySellingPoints: '', // Comma separated for input convenience
        pairingSuggestions: ''
    });
    const [loading, setLoading] = useState(false);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            // Process selling points
            const pointsArray = newProduct.keySellingPoints
                ? newProduct.keySellingPoints.split(',').map(s => s.trim()).filter(Boolean)
                : [];

            await createProduct({
                ...newProduct,
                price: parseFloat(newProduct.price) || 0,
                keySellingPoints: pointsArray
            });

            setNewProduct({
                name: '',
                category: 'Red',
                vintage: '',
                price: '',
                stockStatus: 'IN_STOCK',
                tastingNotes: '',
                keySellingPoints: '',
                pairingSuggestions: ''
            });
            onUpdate();
        } catch (e) {
            alert('Failed to add product');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this product?')) return;
        try {
            await deleteProduct(id);
            onUpdate();
        } catch (e) {
            alert('Failed to delete product');
        }
    };

    return (
        <div className="space-y-8">
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
                            {products.map((product: any) => (
                                <tr key={product.id}>
                                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">{product.name}</td>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{product.vintage || '-'}</td>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{product.category}</td>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">${product.price}</td>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                        <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${product.stockStatus === 'IN_STOCK' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                            {product.stockStatus}
                                        </span>
                                    </td>
                                    <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                                        <button onClick={() => handleDelete(product.id)} className="text-red-600 hover:text-red-900">Delete</button>
                                    </td>
                                </tr>
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
                            <option>Red</option>
                            <option>White</option>
                            <option>Sparkling</option>
                            <option>Rose</option>
                            <option>Fortified</option>
                            <option>Merchandise</option>
                            <option>Event</option>
                        </select>
                    </div>

                    <div className="sm:col-span-1">
                        <label className="block text-sm font-medium text-gray-700">Price</label>
                        <input type="number" step="0.01" value={newProduct.price} onChange={e => setNewProduct({ ...newProduct, price: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    </div>

                    <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-gray-700">Status</label>
                        <select value={newProduct.stockStatus} onChange={e => setNewProduct({ ...newProduct, stockStatus: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2">
                            <option value="IN_STOCK">In Stock</option>
                            <option value="LOW_STOCK">Low Stock</option>
                            <option value="OUT_OF_STOCK">Out of Stock</option>
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
                        <label className="block text-sm font-medium text-gray-700">Pairing Suggestions</label>
                        <input type="text" value={newProduct.pairingSuggestions} onChange={e => setNewProduct({ ...newProduct, pairingSuggestions: e.target.value })} placeholder="Steak, Hard Cheeses" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" />
                    </div>

                    <div className="sm:col-span-6">
                        <button type="submit" disabled={loading} className="btn-primary inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:bg-gray-400">
                            {loading ? 'Adding...' : 'Add Product'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
