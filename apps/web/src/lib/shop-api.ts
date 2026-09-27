const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface ShopProduct {
  id: string;
  name: string;
  brand: string | null;
  sku: string;
  categoryId: string | null;
  priceCents: string;
  price: number;
  saleCents: string | null;
  salePrice: number | null;
  effectiveCents: string;
  effectivePrice: number;
  currency: string;
  status: string;
  providerId: string | null;
  images: { key: string; url: string }[];
  variants: { id: string; attrs: Record<string, unknown>; priceDeltaCents: string; priceDelta: number }[];
  inventory: { variantId: string | null; quantity: number; reserved: number; available: number }[];
}

export interface CrossSellProduct extends ShopProduct {
  reason: string | null;
  source: 'curated' | 'category';
}

export async function fetchProducts(q?: string): Promise<ShopProduct[]> {
  try {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    const res = await fetch(`${API_URL}/api/v1/products?${params.toString()}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const json = (await res.json()) as { data: ShopProduct[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

export async function fetchProduct(id: string): Promise<ShopProduct | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/products/${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = (await res.json()) as { data: ShopProduct };
    return json.data;
  } catch {
    return null;
  }
}

export async function fetchCrossSell(providerServiceId: string): Promise<CrossSellProduct[]> {
  try {
    const res = await fetch(
      `${API_URL}/api/v1/products/cross-sell?providerServiceId=${encodeURIComponent(providerServiceId)}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { data: CrossSellProduct[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}
