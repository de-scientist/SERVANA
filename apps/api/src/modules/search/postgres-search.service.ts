import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityService } from '../availability/availability.service';
import {
  SearchProvider,
  SearchQuery,
  SearchResult,
  ProviderSearchHit,
  ServiceSearchHit,
} from './search.provider';

@Injectable()
export class PostgresSearchService implements SearchProvider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
  ) {}

  async search(query: SearchQuery): Promise<SearchResult> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, query.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const providers = await this.searchProviders(query);
    const services = await this.searchServices(query);

    let providerHits = providers;
    if (query.lat != null && query.lng != null && query.radiusKm != null) {
      providerHits = providers.filter((p) =>
        this.withinRadius(p, query.lat!, query.lng!, query.radiusKm!),
      );
    }

    const providerSlice = providerHits.slice(skip, skip + pageSize);
    const serviceSlice = this.sortServices(services, query.sort).slice(
      skip,
      skip + pageSize,
    );

    return {
      providers: providerSlice,
      services: serviceSlice,
      meta: {
        totalProviders: providerHits.length,
        totalServices: services.length,
        page,
        pageSize,
      },
    };
  }

  private async searchProviders(query: SearchQuery): Promise<ProviderSearchHit[]> {
    const where: Prisma.ProviderProfileWhereInput = { status: 'VERIFIED' };

    if (query.q) {
      const q = query.q;
      where.OR = [
        { businessName: { contains: q, mode: 'insensitive' } },
        { tagline: { contains: q, mode: 'insensitive' } },
        { bio: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (query.city) {
      where.city = { contains: query.city, mode: 'insensitive' };
    }
    if (query.categoryId) {
      where.OR = [
        ...(where.OR ?? []),
        { categories: { some: { categoryId: query.categoryId } } },
        { services: { some: { categoryId: query.categoryId } } },
      ];
    }
    if (query.availableOn) {
      const openIds = await this.openProviderIds(query.availableOn);
      where.id = { in: openIds };
    }

    const rows = await this.prisma.providerProfile.findMany({
      where,
      select: {
        id: true,
        slug: true,
        businessName: true,
        city: true,
        country: true,
        status: true,
        lat: true,
        lng: true,
        user: { select: { profileImage: true } },
        categories: {
          select: { category: { select: { id: true, name: true, slug: true } } },
        },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      businessName: r.businessName,
      city: r.city,
      country: r.country,
      avatarUrl: r.user?.profileImage ?? null,
      verified: r.status === 'VERIFIED',
      lat: r.lat,
      lng: r.lng,
      categories: r.categories.map((pc) => pc.category),
    }));
  }

  private async searchServices(query: SearchQuery): Promise<ServiceSearchHit[]> {
    const where: Prisma.ProviderServiceWhereInput = {
      isActive: true,
      provider: { status: 'VERIFIED' },
    };

    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }
    if (query.minPriceCents != null || query.maxPriceCents != null) {
      where.priceCents = {};
      if (query.minPriceCents != null)
        (where.priceCents as any).gte = BigInt(query.minPriceCents);
      if (query.maxPriceCents != null)
        (where.priceCents as any).lte = BigInt(query.maxPriceCents);
    }

    const rows = await this.prisma.providerService.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
        priceCents: true,
        currency: true,
        durationMin: true,
        deliveryTypes: true,
        provider: {
          select: {
            id: true,
            slug: true,
            businessName: true,
            city: true,
            status: true,
          },
        },
      },
    });

    let hits = rows.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      priceCents: s.priceCents,
      currency: s.currency,
      durationMin: s.durationMin,
      deliveryTypes: (Array.isArray(s.deliveryTypes)
        ? s.deliveryTypes
        : []) as string[],
      provider: {
        id: s.provider.id,
        slug: s.provider.slug,
        businessName: s.provider.businessName,
        city: s.provider.city,
        verified: s.provider.status === 'VERIFIED',
      },
    }));

    if (query.travelToCustomer) {
      hits = hits.filter((h) => h.deliveryTypes.includes('TRAVEL_TO_CUSTOMER'));
    }
    if (query.availableOn) {
      const openIds = await this.openProviderIds(query.availableOn);
      hits = hits.filter((h) => openIds.includes(h.provider.id));
    }

    return hits;
  }

  private sortServices(
    hits: ServiceSearchHit[],
    sort?: SearchQuery['sort'],
  ): ServiceSearchHit[] {
    if (sort === 'price_asc') {
      return [...hits].sort((a, b) => (a.priceCents > b.priceCents ? 1 : -1));
    }
    if (sort === 'price_desc') {
      return [...hits].sort((a, b) => (a.priceCents < b.priceCents ? 1 : -1));
    }
    return hits;
  }

  private async openProviderIds(date: string): Promise<string[]> {
    const providers = await this.prisma.providerProfile.findMany({
      where: { status: 'VERIFIED' },
      select: { id: true },
    });
    const ids: string[] = [];
    for (const p of providers) {
      if (await this.availability.isOpenOn(p.id, date)) ids.push(p.id);
    }
    return ids;
  }

  private withinRadius(
    p: ProviderSearchHit & { lat?: number | null; lng?: number | null },
    lat: number,
    lng: number,
    radiusKm: number,
  ): boolean {
    if (p.lat == null || p.lng == null) return false;
    const R = 6371;
    const dLat = ((p.lat - lat) * Math.PI) / 180;
    const dLng = ((p.lng - lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat * Math.PI) / 180) *
        Math.cos((p.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c <= radiusKm;
  }
}
