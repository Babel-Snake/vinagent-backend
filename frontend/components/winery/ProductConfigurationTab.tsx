'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    AreaProductListing,
    deleteAreaProductListing,
    updateAreaProductListing,
    Winery
} from '../../lib/api';
import { ProductsTab } from './ProductsTab';
import ConfirmDialog from '../ui/ConfirmDialog';
import { operationalLabel } from '../../lib/operationalPresentation';

interface WineryProduct {
    id: number;
    name: string;
    vintage?: string | null;
    category?: string | null;
    price?: number | string | null;
    stockStatus?: string | null;
    isActive?: boolean;
}

type ProductConfigurationWinery = Winery & { products?: WineryProduct[] };

export function ProductConfigurationTab({ winery, onUpdate }: { winery: ProductConfigurationWinery, onUpdate: () => void }) {
    const areas = useMemo(() => winery.OperationalAreas || [], [winery.OperationalAreas]);
    const access = winery.configurationAccess;
    const [selectedAreaId, setSelectedAreaId] = useState(access?.managedAreaIds?.[0] || areas[0]?.id || 0);
    const selectedArea = areas.find(area => area.id === selectedAreaId) || areas[0];
    const canManageArea = Boolean(access?.isGlobalManager || access?.managedAreaIds?.includes(Number(selectedArea?.id)));
    const products = (winery.products || []).filter(product => product.isActive !== false);
    const listings = selectedArea?.ProductListings || [];

    return (
        <div className="space-y-10">
            <section className="space-y-5">
                <div className="rounded-lg border border-[var(--border)] bg-[#f8f9f5] p-4">
                    <label className="block text-sm font-semibold text-[#344039]">Product area</label>
                    <select value={selectedArea?.id || ''} onChange={e => setSelectedAreaId(Number(e.target.value))} className="mt-2 w-full max-w-md rounded-md border border-[var(--border)] bg-white p-2">
                        {areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
                    </select>
                    {selectedArea && <p className="mt-2 text-sm text-[var(--muted)]">{canManageArea ? `You can manage product listings for ${selectedArea.name}.` : `${selectedArea.name} listings are read-only for your account.`}</p>}
                </div>

                <div>
                    <h3 className="text-lg font-semibold text-gray-900">{selectedArea?.name || 'Area'} product listings</h3>
                    <p className="mt-1 text-sm text-gray-500">Area listings inherit canonical product details. Only availability, price, stock, featured state and sales notes vary here.</p>
                </div>

                {!selectedArea && <p className="text-sm text-gray-500">Create an operational area before assigning products.</p>}
                {selectedArea && <div className="space-y-3">
                    {products.map(product => (
                        <AreaProductRow
                            key={product.id}
                            areaId={selectedArea.id}
                            product={product}
                            listing={listings.find(listing => Number(listing.productId) === Number(product.id)) || null}
                            canManage={canManageArea}
                            onUpdate={onUpdate}
                        />
                    ))}
                    {products.length === 0 && <p className="rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-500">No active products exist in the shared catalogue.</p>}
                </div>}
            </section>

            <section className="space-y-4 border-t border-[var(--border)] pt-8">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900">Shared winery catalogue</h3>
                    <p className="mt-1 text-sm text-gray-500">Canonical names, vintages, tasting notes, awards and default commercial values.</p>
                </div>
                {!access?.isGlobalManager && <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">The shared catalogue is read-only for area managers.</div>}
                <fieldset disabled={!access?.isGlobalManager} className="disabled:opacity-75">
                    <ProductsTab winery={winery} onUpdate={onUpdate} />
                </fieldset>
            </section>
        </div>
    );
}

function AreaProductRow({ areaId, product, listing, canManage, onUpdate }: {
    areaId: number;
    product: WineryProduct;
    listing: AreaProductListing | null;
    canManage: boolean;
    onUpdate: () => void;
}) {
    const [form, setForm] = useState({
        isAvailable: listing?.isAvailable !== false,
        priceOverride: listing?.priceOverride == null ? '' : String(listing.priceOverride),
        stockStatusOverride: listing?.stockStatusOverride || '',
        isFeatured: Boolean(listing?.isFeatured),
        salesNotes: listing?.salesNotes || ''
    });
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [removeRequested, setRemoveRequested] = useState(false);

    useEffect(() => {
        setForm({
            isAvailable: listing?.isAvailable !== false,
            priceOverride: listing?.priceOverride == null ? '' : String(listing.priceOverride),
            stockStatusOverride: listing?.stockStatusOverride || '',
            isFeatured: Boolean(listing?.isFeatured),
            salesNotes: listing?.salesNotes || ''
        });
    }, [listing]);

    async function addOrSave() {
        if (!canManage) return;
        setFeedback(null);
        setSaving(true);
        try {
            await updateAreaProductListing(areaId, product.id, {
                isAvailable: form.isAvailable,
                priceOverride: form.priceOverride === '' ? null : Number(form.priceOverride),
                stockStatusOverride: form.stockStatusOverride === '' ? null : form.stockStatusOverride as AreaProductListing['stockStatusOverride'],
                isFeatured: form.isFeatured,
                salesNotes: form.salesNotes || null
            });
            onUpdate();
        } catch (error) {
            setFeedback(error instanceof Error ? error.message : 'Failed to save area product');
        } finally {
            setSaving(false);
        }
    }

    async function confirmRemove() {
        if (!canManage || !listing) return;
        setFeedback(null);
        try {
            await deleteAreaProductListing(areaId, product.id);
            onUpdate();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to remove area product';
            setFeedback(message);
            throw new Error(message);
        }
    }

    return (
        <>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="font-semibold text-gray-900">{product.name}</p>
                    <p className="text-sm text-gray-500">{[product.vintage, product.category ? operationalLabel(product.category) : null].filter(Boolean).join(' · ')} · Default ${Number(product.price || 0).toFixed(2)} · {product.stockStatus ? operationalLabel(product.stockStatus) : 'Stock status not set'}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${listing ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>{listing ? 'Listed' : 'Not listed'}</span>
            </div>

            {listing ? <fieldset disabled={!canManage || saving} className="mt-4 grid grid-cols-1 gap-3 disabled:opacity-70 md:grid-cols-4">
                <label className="text-xs font-semibold uppercase text-gray-600">Price override
                    <input type="number" min={0} step="0.01" value={form.priceOverride} onChange={e => setForm({ ...form, priceOverride: e.target.value })} placeholder="Inherit" className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm normal-case" />
                </label>
                <label className="text-xs font-semibold uppercase text-gray-600">Stock override
                    <select value={form.stockStatusOverride} onChange={e => setForm({ ...form, stockStatusOverride: e.target.value })} className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm normal-case">
                        <option value="">Inherit</option><option value="IN_STOCK">In stock</option><option value="LOW_STOCK">Low stock</option><option value="OUT_OF_STOCK">Out of stock</option>
                    </select>
                </label>
                <label className="flex items-center gap-2 pt-6 text-sm text-gray-700"><input type="checkbox" checked={form.isAvailable} onChange={e => setForm({ ...form, isAvailable: e.target.checked })} />Available</label>
                <label className="flex items-center gap-2 pt-6 text-sm text-gray-700"><input type="checkbox" checked={form.isFeatured} onChange={e => setForm({ ...form, isFeatured: e.target.checked })} />Featured</label>
                <label className="text-xs font-semibold uppercase text-gray-600 md:col-span-4">Area sales notes
                    <textarea rows={2} value={form.salesNotes} onChange={e => setForm({ ...form, salesNotes: e.target.value })} className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm normal-case" />
                </label>
                {canManage && <div className="flex gap-3 md:col-span-4"><button type="button" onClick={addOrSave} className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white">{saving ? 'Saving…' : 'Save listing'}</button><button type="button" onClick={() => setRemoveRequested(true)} className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-700">Remove from area</button></div>}
            </fieldset> : canManage && <button type="button" onClick={addOrSave} disabled={saving} className="mt-4 rounded-md bg-green-700 px-3 py-2 text-sm font-medium text-white">{saving ? 'Adding…' : 'Add to area'}</button>}
            {feedback && <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{feedback}</p>}
        </div>
        <ConfirmDialog
            open={removeRequested}
            onClose={() => setRemoveRequested(false)}
            onConfirm={confirmRemove}
            title="Remove area listing?"
            description={`"${product.name}" will revert to the winery catalogue default for this area.`}
            confirmLabel="Remove listing"
            destructive
        />
        </>
    );
}
