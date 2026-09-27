const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  parentId?: string | null;
  children?: CategoryNode[];
  subCount?: number;
}

export interface ProviderSearchHit {
  id: string;
  slug: string;
  businessName: string | null;
  city: string | null;
  country: string | null;
  avatarUrl: string | null;
  verified: boolean;
  lat: number | null;
  lng: number | null;
  categories: { id: string; name: string; slug: string }[];
}

export interface ServiceSearchHit {
  id: string;
  name: string;
  description: string | null;
  priceCents: string;
  currency: string;
  durationMin: number;
  deliveryTypes: string[];
  provider: {
    id: string;
    slug: string;
    businessName: string | null;
    city: string | null;
    verified: boolean;
  };
}

export interface SearchResponse {
  providers: ProviderSearchHit[];
  services: ServiceSearchHit[];
  meta: { totalProviders: number; totalServices: number; page: number; pageSize: number };
}

export interface SearchParams {
  q?: string;
  categoryId?: string;
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  verified?: boolean;
  travelToCustomer?: boolean;
  availableOn?: string;
  sort?: 'relevance' | 'price_asc' | 'price_desc';
  page?: number;
  pageSize?: number;
}

export async function fetchCategories(): Promise<CategoryNode[]> {
  try {
    const res = await fetch(`${API_URL}/api/v1/categories`, { cache: 'no-store' });
    if (!res.ok) return [];
    return (await res.json()) as CategoryNode[];
  } catch {
    return [];
  }
}

export async function search(params: SearchParams): Promise<SearchResponse> {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.categoryId) qs.set('categoryId', params.categoryId);
  if (params.city) qs.set('city', params.city);
  if (params.minPrice != null) qs.set('minPrice', String(params.minPrice));
  if (params.maxPrice != null) qs.set('maxPrice', String(params.maxPrice));
  if (params.verified) qs.set('verified', 'true');
  if (params.travelToCustomer) qs.set('travelToCustomer', 'true');
  if (params.availableOn) qs.set('availableOn', params.availableOn);
  if (params.sort) qs.set('sort', params.sort);
  if (params.page) qs.set('page', String(params.page));
  if (params.pageSize) qs.set('pageSize', String(params.pageSize));

  const res = await fetch(`${API_URL}/api/v1/search?${qs.toString()}`, { cache: 'no-store' });
  if (!res.ok) {
    return {
      providers: [],
      services: [],
      meta: { totalProviders: 0, totalServices: 0, page: 1, pageSize: 20 },
    };
  }
  return (await res.json()) as SearchResponse;
}

export function formatPrice(amountCents: number | string, currency = 'KES'): string {
  const value = typeof amountCents === 'string' ? Number(amountCents) : amountCents;
  const major = Math.floor(value / 100);
  return `${currency} ${major.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
}
