const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface PublicProviderSummary {
  id: string;
  businessName: string | null;
  slug: string;
  tagline: string | null;
  city: string | null;
  country: string | null;
  travelToCustomer: boolean;
  serviceRadiusKm: number | null;
  languages: string[];
  categories: { id: string; name: string; slug: string }[];
  serviceCount: number;
  fromPrice: number | null;
  verified: boolean;
  verificationLevel: string | null;
}

export interface PublicProviderService {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  deliveryTypes: string[];
  price: number;
  priceCents: string;
  currency: string;
  travelFee: number | null;
  images: { key: string; url: string }[] | null;
  isActive: boolean;
}

export interface PublicProviderProfile {
  id: string;
  businessName: string | null;
  slug: string;
  tagline: string | null;
  bio: string | null;
  city: string | null;
  country: string | null;
  travelToCustomer: boolean;
  serviceRadiusKm: number | null;
  websiteUrl: string | null;
  // NOTE: exact coordinates, street address and business phone are private
  // (shared in-booking via messaging) and never appear on public profiles.
  yearsExperience: number | null;
  languages: string[];
  categories: { id: string; name: string; slug: string }[];
  services: PublicProviderService[];
  portfolio: { id: string; title: string; description: string | null; images: { key: string; url: string }[] | null; link: string | null }[];
  verification: { verified: boolean; level: string | null; verifiedAt: string | null };
  reviews: { overall: number; total: number; completionRate: number; customersServed: number; responseRate: number };
}

export interface PublicReview {
  id: string;
  overall: number;
  title: string | null;
  body: string | null;
  dimensions: { id: string; name: string; score: number }[];
  response: { id: string; body: string } | null;
  createdAt: string;
}

export async function fetchProviders(): Promise<{ data: PublicProviderSummary[]; meta: { total: number; pages: number } }> {
  try {
    const res = await fetch(`${API_URL}/api/v1/providers?pageSize=24`, { cache: 'no-store' });
    if (!res.ok) return { data: [], meta: { total: 0, pages: 0 } };
    const json = (await res.json()) as { data: PublicProviderSummary[]; meta: { total: number; pages: number } };
    return json;
  } catch {
    return { data: [], meta: { total: 0, pages: 0 } };
  }
}

export async function fetchProvider(slug: string): Promise<PublicProviderProfile | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/providers/${encodeURIComponent(slug)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = (await res.json()) as { data: PublicProviderProfile };
    return json.data;
  } catch {
    return null;
  }
}

export async function fetchProviderReviews(providerId: string): Promise<PublicReview[]> {
  try {
    const res = await fetch(
      `${API_URL}/api/v1/reviews/provider/${encodeURIComponent(providerId)}?pageSize=10&status=APPROVED`,
      { cache: 'no-store' },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { data: { data: PublicReview[] } };
    return json.data?.data ?? [];
  } catch {
    return [];
  }
}

export function formatPrice(amount: number, currency = 'KES'): string {
  return `${currency} ${amount.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
}

export interface PublicService {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  durationMin: number;
  bufferMin: number;
  bookingWindowDays: number | null;
  deliveryTypes: string[];
  images: { key: string; url: string }[] | null;
  isActive: boolean;
  price: number;
  priceCents: string;
  currency: string;
  travelFee: number | null;
  travelFeeCents: string | null;
  provider: {
    id: string;
    businessName: string | null;
    slug: string;
    city: string | null;
    country: string | null;
    travelToCustomer: boolean;
    serviceRadiusKm: number | null;
    yearsExperience: number | null;
    languages: string[];
    categories: { id: string; name: string; slug: string }[];
    ownerName: string | null;
    ownerImage: string | null;
    verified: boolean;
    verificationLevel: string | null;
  };
}

export async function fetchService(id: string): Promise<PublicService | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/services/${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as PublicService;
  } catch {
    return null;
  }
}
