export interface SearchQuery {
  q?: string;
  categoryId?: string;
  city?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  minPriceCents?: number;
  maxPriceCents?: number;
  verified?: boolean;
  travelToCustomer?: boolean;
  availableOn?: string;
  sort?: 'relevance' | 'price_asc' | 'price_desc';
  page?: number;
  pageSize?: number;
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
  priceCents: bigint;
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

export interface SearchResult {
  providers: ProviderSearchHit[];
  services: ServiceSearchHit[];
  meta: {
    totalProviders: number;
    totalServices: number;
    page: number;
    pageSize: number;
  };
}

export const SEARCH_PROVIDER = Symbol('SEARCH_PROVIDER');

export interface SearchProvider {
  search(query: SearchQuery): Promise<SearchResult>;
}
