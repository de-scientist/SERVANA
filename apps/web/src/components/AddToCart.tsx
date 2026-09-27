'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';

export default function AddToCart({ productId, variants }: {
  productId: string;
  variants: { id: string; attrs: Record<string, unknown> }[];
}) {
  const [variantId, setVariantId] = useState<string | undefined>(variants[0]?.id);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function add() {
    setBusy(true);
    setError(null);
    const res = await apiClient.post('/cart/items', { productId, variantId, qty });
    setBusy(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    router.push('/cart');
  }

  return (
    <div className="mt-4 space-y-3">
      {variants.length > 0 && (
        <label className="block text-sm">
          <span className="text-muted-foreground">Option</span>
          <select
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border px-3"
          >
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {Object.entries(v.attrs).map(([k, val]) => `${k}: ${String(val)}`).join(', ')}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground" htmlFor="qty">Qty</label>
        <input
          id="qty"
          type="number"
          min={1}
          max={99}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
          className="h-10 w-20 rounded-md border px-3 text-sm"
        />
        <button
          onClick={add}
          disabled={busy}
          className="h-10 flex-1 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? 'Adding…' : 'Add to cart'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
