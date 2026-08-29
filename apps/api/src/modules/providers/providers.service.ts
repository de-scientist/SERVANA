import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProviderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppLoggerService } from '../../common/logging/logger.service';
import { StorageProvider, STORAGE_PROVIDER } from '../../common/adapters/storage/storage.provider';
import { toMinorUnits, fromMinorUnits } from '../../common/money/money';
import { slugify, randomSuffix } from '../../common/utils/slug';
import {
  ALLOWED_UPLOAD_TYPES,
  MAX_UPLOAD_BYTES,
  CreateProviderProfileInput,
  UpdateProviderProfileInput,
  SetProviderCategoriesInput,
  CreateProviderServiceInput,
  UpdateProviderServiceInput,
  CreatePortfolioItemInput,
  UpdatePortfolioItemInput,
  ListProvidersInput,
} from './dto/provider.schema';

@Injectable()
export class ProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly logger: AppLoggerService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  // --- ownership helpers ---------------------------------------------------

  async getProviderByUser(userId: string) {
    const profile = await this.prisma.providerProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Provider profile not found');
    return profile;
  }

  // --- profile -------------------------------------------------------------

  async createProfile(userId: string, dto: CreateProviderProfileInput) {
    const existing = await this.prisma.providerProfile.findUnique({ where: { userId } });
    if (existing) throw new ConflictException('Provider profile already exists');

    const slug = await this.uniqueSlug(slugify(dto.businessName) || 'provider');
    const profile = await this.prisma.providerProfile.create({
      data: {
        userId,
        businessName: dto.businessName,
        slug,
        tagline: dto.tagline ?? null,
        bio: dto.bio ?? null,
        city: dto.city ?? null,
        country: dto.country ?? null,
        address: (dto.address as Prisma.JsonValue) ?? Prisma.JsonNull,
        lat: dto.lat ?? null,
        lng: dto.lng ?? null,
        serviceRadiusKm: dto.serviceRadiusKm ?? null,
        travelToCustomer: dto.travelToCustomer ?? false,
        websiteUrl: dto.websiteUrl ?? null,
        businessPhone: dto.businessPhone ?? null,
        yearsExperience: dto.yearsExperience ?? null,
        languages: dto.languages ?? [],
        socialLinks: (dto.socialLinks as Prisma.JsonValue) ?? Prisma.JsonNull,
        workingPreferences: (dto.workingPreferences as Prisma.JsonValue) ?? Prisma.JsonNull,
        status: ProviderStatus.DRAFT,
      },
    });

    // Every provider starts with a PENDING verification record.
    await this.prisma.providerVerification.upsert({
      where: { providerId: profile.id },
      update: {},
      create: { providerId: profile.id, status: 'PENDING' },
    });

    await this.audit.record({
      actorId: userId,
      action: 'provider.profile.create',
      entity: 'provider',
      entityId: profile.id,
      after: { businessName: profile.businessName, slug: profile.slug },
    });
    return this.mapProfile(profile);
  }

  async getOwnProfile(userId: string) {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId },
      include: {
        categories: { include: { category: true } },
        services: { orderBy: { sortOrder: 'asc' } },
        portfolio: { orderBy: { sortOrder: 'asc' } },
        verification: { include: { history: { orderBy: { createdAt: 'desc' } }, documents: true } },
        user: { select: { name: true, email: true, phone: true, profileImage: true } },
      },
    });
    if (!profile) throw new NotFoundException('Provider profile not found');
    return this.mapProfileDetail(profile);
  }

  async updateProfile(userId: string, dto: UpdateProviderProfileInput) {
    const profile = await this.getProviderByUser(userId);
    const data: Prisma.ProviderProfileUpdateInput = {};
    if (dto.businessName !== undefined) data.businessName = dto.businessName;
    if (dto.tagline !== undefined) data.tagline = dto.tagline;
    if (dto.bio !== undefined) data.bio = dto.bio;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.country !== undefined) data.country = dto.country;
    data.address = dto.address === null ? Prisma.JsonNull : ((dto.address as Prisma.JsonValue) ?? undefined);
    if (dto.lat !== undefined) data.lat = dto.lat;
    if (dto.lng !== undefined) data.lng = dto.lng;
    if (dto.serviceRadiusKm !== undefined) data.serviceRadiusKm = dto.serviceRadiusKm;
    if (dto.travelToCustomer !== undefined) data.travelToCustomer = dto.travelToCustomer;
    if (dto.websiteUrl !== undefined) data.websiteUrl = dto.websiteUrl;
    if (dto.businessPhone !== undefined) data.businessPhone = dto.businessPhone;
    if (dto.yearsExperience !== undefined) data.yearsExperience = dto.yearsExperience;
    if (dto.languages !== undefined) data.languages = dto.languages;
    data.socialLinks = dto.socialLinks === null ? Prisma.JsonNull : ((dto.socialLinks as Prisma.JsonValue) ?? undefined);
    data.workingPreferences = dto.workingPreferences === null ? Prisma.JsonNull : ((dto.workingPreferences as Prisma.JsonValue) ?? undefined);

    const updated = await this.prisma.providerProfile.update({ where: { id: profile.id }, data });
    await this.audit.record({
      actorId: userId,
      action: 'provider.profile.update',
      entity: 'provider',
      entityId: profile.id,
      after: dto,
    });
    return this.mapProfile(updated);
  }

  private async uniqueSlug(base: string): Promise<string> {
    let slug = base || 'provider';
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const clash = await this.prisma.providerProfile.findUnique({ where: { slug } });
      if (!clash) return slug;
      slug = `${base}-${randomSuffix(5)}`;
    }
  }

  // --- categories ----------------------------------------------------------

  async setCategories(userId: string, dto: SetProviderCategoriesInput) {
    const profile = await this.getProviderByUser(userId);
    const found = await this.prisma.category.findMany({ where: { id: { in: dto.categoryIds } } });
    if (found.length !== dto.categoryIds.length) throw new NotFoundException('One or more categories do not exist');
    await this.prisma.providerCategory.deleteMany({ where: { providerId: profile.id } });
    await this.prisma.providerCategory.createMany({
      data: dto.categoryIds.map((categoryId) => ({ providerId: profile.id, categoryId })),
    });
    await this.audit.record({
      actorId: userId,
      action: 'provider.categories.set',
      entity: 'provider',
      entityId: profile.id,
      after: { categoryIds: dto.categoryIds },
    });
    return this.getCategories(userId);
  }

  async getCategories(userId: string) {
    const profile = await this.getProviderByUser(userId);
    const rows = await this.prisma.providerCategory.findMany({
      where: { providerId: profile.id },
      include: { category: true },
      orderBy: { categoryId: 'asc' },
    });
    return rows.map((r) => r.category);
  }

  // --- services ------------------------------------------------------------

  async createService(userId: string, dto: CreateProviderServiceInput) {
    const profile = await this.getProviderByUser(userId);
    if (!dto.serviceId && !dto.categoryId) {
      throw new ConflictException('A service must reference a catalog service or a category');
    }
    if (dto.categoryId) {
      const cat = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
      if (!cat) throw new NotFoundException('Category not found');
    }
    const service = await this.prisma.providerService.create({
      data: {
        providerId: profile.id,
        serviceId: dto.serviceId ?? null,
        categoryId: dto.categoryId ?? null,
        name: dto.name,
        description: dto.description ?? null,
        priceCents: toMinorUnits(dto.price),
        currency: dto.currency,
        durationMin: dto.durationMin,
        deliveryTypes: dto.deliveryTypes as Prisma.JsonValue,
        travelFeeCents: dto.travelFee !== undefined ? toMinorUnits(dto.travelFee) : null,
        images: (dto.images as Prisma.JsonValue) ?? Prisma.JsonNull,
        isActive: dto.isActive,
        sortOrder: dto.sortOrder ?? 0,
        bookingWindowDays: dto.bookingWindowDays ?? null,
      },
    });
    await this.audit.record({
      actorId: userId,
      action: 'provider.service.create',
      entity: 'providerService',
      entityId: service.id,
      after: { name: service.name },
    });
    return this.mapService(service);
  }

  async listServices(userId: string, onlyActive = false) {
    const profile = await this.getProviderByUser(userId);
    const services = await this.prisma.providerService.findMany({
      where: { providerId: profile.id, ...(onlyActive ? { isActive: true } : {}) },
      orderBy: { sortOrder: 'asc' },
    });
    return services.map((s) => this.mapService(s));
  }

  async getService(userId: string, id: string) {
    const profile = await this.getProviderByUser(userId);
    const service = await this.prisma.providerService.findFirst({ where: { id, providerId: profile.id } });
    if (!service) throw new NotFoundException('Service not found');
    return this.mapService(service);
  }

  async updateService(userId: string, id: string, dto: UpdateProviderServiceInput) {
    const profile = await this.getProviderByUser(userId);
    const existing = await this.prisma.providerService.findFirst({ where: { id, providerId: profile.id } });
    if (!existing) throw new NotFoundException('Service not found');

    const data: Prisma.ProviderServiceUpdateInput = {};
    if (dto.serviceId !== undefined) data.serviceId = dto.serviceId;
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.price !== undefined) data.priceCents = toMinorUnits(dto.price);
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.durationMin !== undefined) data.durationMin = dto.durationMin;
    if (dto.deliveryTypes !== undefined) data.deliveryTypes = dto.deliveryTypes as Prisma.JsonValue;
    if (dto.travelFee !== undefined) data.travelFeeCents = toMinorUnits(dto.travelFee);
    data.images = dto.images === undefined ? undefined : ((dto.images as Prisma.JsonValue) ?? Prisma.JsonNull);
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.bookingWindowDays !== undefined) data.bookingWindowDays = dto.bookingWindowDays;

    const updated = await this.prisma.providerService.update({ where: { id }, data });
    await this.audit.record({
      actorId: userId,
      action: 'provider.service.update',
      entity: 'providerService',
      entityId: id,
      after: dto,
    });
    return this.mapService(updated);
  }

  async deleteService(userId: string, id: string) {
    const profile = await this.getProviderByUser(userId);
    const existing = await this.prisma.providerService.findFirst({ where: { id, providerId: profile.id } });
    if (!existing) throw new NotFoundException('Service not found');
    const bookings = await this.prisma.booking.count({ where: { providerServiceId: id } });
    if (bookings > 0) {
      // Keep history: deactivate instead of deleting when linked to bookings.
      await this.prisma.providerService.update({ where: { id }, data: { isActive: false } });
      return { data: { id, deleted: false, deactivated: true } };
    }
    await this.prisma.providerService.delete({ where: { id } });
    await this.audit.record({
      actorId: userId,
      action: 'provider.service.delete',
      entity: 'providerService',
      entityId: id,
    });
    return { data: { id, deleted: true, deactivated: false } };
  }

  // --- portfolio -----------------------------------------------------------

  async createPortfolioItem(userId: string, dto: CreatePortfolioItemInput) {
    const profile = await this.getProviderByUser(userId);
    const item = await this.prisma.portfolioItem.create({
      data: {
        providerId: profile.id,
        title: dto.title,
        description: dto.description ?? null,
        images: (dto.images as Prisma.JsonValue) ?? Prisma.JsonNull,
        link: dto.link ?? null,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.audit.record({
      actorId: userId,
      action: 'provider.portfolio.create',
      entity: 'portfolioItem',
      entityId: item.id,
    });
    return this.mapPortfolio(item);
  }

  async listPortfolio(userId: string) {
    const profile = await this.getProviderByUser(userId);
    const items = await this.prisma.portfolioItem.findMany({
      where: { providerId: profile.id },
      orderBy: { sortOrder: 'asc' },
    });
    return items.map((i) => this.mapPortfolio(i));
  }

  async updatePortfolioItem(userId: string, id: string, dto: UpdatePortfolioItemInput) {
    const profile = await this.getProviderByUser(userId);
    const existing = await this.prisma.portfolioItem.findFirst({ where: { id, providerId: profile.id } });
    if (!existing) throw new NotFoundException('Portfolio item not found');
    const data: Prisma.PortfolioItemUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.link !== undefined) data.link = dto.link;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    data.images = dto.images === undefined ? undefined : ((dto.images as Prisma.JsonValue) ?? Prisma.JsonNull);
    const updated = await this.prisma.portfolioItem.update({ where: { id }, data });
    await this.audit.record({ actorId: userId, action: 'provider.portfolio.update', entity: 'portfolioItem', entityId: id });
    return this.mapPortfolio(updated);
  }

  async deletePortfolioItem(userId: string, id: string) {
    const profile = await this.getProviderByUser(userId);
    const existing = await this.prisma.portfolioItem.findFirst({ where: { id, providerId: profile.id } });
    if (!existing) throw new NotFoundException('Portfolio item not found');
    await this.prisma.portfolioItem.delete({ where: { id } });
    await this.audit.record({ actorId: userId, action: 'provider.portfolio.delete', entity: 'portfolioItem', entityId: id });
    return { data: { id, deleted: true } };
  }

  // --- media upload --------------------------------------------------------

  async uploadMedia(userId: string, file: { buffer: Buffer; mimetype: string; originalname?: string }) {
    // Authorization: must own (or be creating) a provider profile.
    await this.getProviderByUser(userId).catch(() => {
      throw new ForbiddenException('A provider profile is required to upload media');
    });
    if (!ALLOWED_UPLOAD_TYPES.includes(file.mimetype as (typeof ALLOWED_UPLOAD_TYPES)[number])) {
      throw new ConflictException('Unsupported file type');
    }
    if (file.buffer.byteLength > MAX_UPLOAD_BYTES) {
      throw new ConflictException('File too large');
    }
    const key = `providers/media/${userId}/${Date.now()}-${randomSuffix(8)}`;
    const result = await this.storage.upload({
      key,
      contentType: file.mimetype,
      data: file.buffer,
      isPublic: true,
    });
    await this.audit.record({
      actorId: userId,
      action: 'provider.media.upload',
      entity: 'providerMedia',
      entityId: key,
    });
    return { data: { key: result.storageKey, url: result.url } };
  }

  // --- public read ---------------------------------------------------------

  async listProviders(filters: ListProvidersInput) {
    const where: Prisma.ProviderProfileWhereInput = { status: ProviderStatus.VERIFIED };
    if (filters.q) {
      where.OR = [
        { businessName: { contains: filters.q, mode: 'insensitive' } },
        { tagline: { contains: filters.q, mode: 'insensitive' } },
        { bio: { contains: filters.q, mode: 'insensitive' } },
      ];
    }
    if (filters.city) where.city = { contains: filters.city, mode: 'insensitive' };
    if (filters.travelToCustomer) where.travelToCustomer = true;
    if (filters.categoryId) {
      where.categories = { some: { categoryId: filters.categoryId } };
    }

    const [rows, total] = await Promise.all([
      this.prisma.providerProfile.findMany({
        where,
        include: {
          categories: { include: { category: true } },
          services: { where: { isActive: true }, take: 4, orderBy: { sortOrder: 'asc' } },
          verification: { select: { status: true, level: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.providerProfile.count({ where }),
    ]);

    return {
      data: rows.map((p) => this.mapPublicSummary(p)),
      meta: {
        page: filters.page,
        pageSize: filters.pageSize,
        total,
        pages: Math.ceil(total / filters.pageSize) || 0,
      },
    };
  }

  async getPublicProfile(slug: string) {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { slug },
      include: {
        categories: { include: { category: true } },
        services: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        portfolio: { orderBy: { sortOrder: 'asc' } },
        verification: { select: { status: true, level: true, verifiedAt: true } },
        user: { select: { name: true, profileImage: true } },
      },
    });
    if (!profile || profile.status !== ProviderStatus.VERIFIED) {
      throw new NotFoundException('Provider not found');
    }
    return this.mapPublicProfile(profile);
  }

  // --- admin management ---------------------------------------------------

  async listAllProviders(filters: { status?: string; q?: string; page: number; pageSize: number }) {
    const where: Prisma.ProviderProfileWhereInput = {};
    if (filters.status) where.status = filters.status as ProviderStatus;
    if (filters.q) {
      where.OR = [
        { businessName: { contains: filters.q, mode: 'insensitive' } },
        { slug: { contains: filters.q, mode: 'insensitive' } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.providerProfile.findMany({
        where,
        include: {
          user: { select: { email: true } },
          verification: { select: { status: true, level: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.providerProfile.count({ where }),
    ]);
    return {
      data: rows.map((p) => ({
        id: p.id,
        businessName: p.businessName,
        slug: p.slug,
        city: p.city,
        country: p.country,
        status: p.status,
        email: p.user.email,
        verificationStatus: p.verification?.status ?? null,
        verificationLevel: p.verification?.level ?? null,
        createdAt: p.createdAt,
      })),
      meta: { page: filters.page, pageSize: filters.pageSize, total, pages: Math.ceil(total / filters.pageSize) || 0 },
    };
  }

  async getProviderAdmin(id: string) {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { id },
      include: {
        user: { select: { name: true, email: true, phone: true } },
        categories: { include: { category: true } },
        services: { orderBy: { sortOrder: 'asc' } },
        portfolio: { orderBy: { sortOrder: 'asc' } },
        verification: { include: { history: { orderBy: { createdAt: 'desc' } }, documents: true } },
      },
    });
    if (!profile) throw new NotFoundException('Provider profile not found');
    return this.mapProfileDetail(profile);
  }

  async setProviderStatus(actorId: string, id: string, status: ProviderStatus, note?: string) {
    const profile = await this.prisma.providerProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('Provider profile not found');
    const updated = await this.prisma.providerProfile.update({ where: { id }, data: { status } });
    await this.audit.record({
      actorId,
      action: 'admin.provider.status',
      entity: 'provider',
      entityId: id,
      before: { status: profile.status },
      after: { status: updated.status, note },
    });
    return { data: { id: updated.id, status: updated.status } };
  }

  // --- mappers -------------------------------------------------------------

  private moneyFields(row: { priceCents: bigint; currency: string; travelFeeCents?: bigint | null }) {
    return {
      price: fromMinorUnits(row.priceCents),
      priceCents: row.priceCents.toString(),
      currency: row.currency,
      ...(row.travelFeeCents !== undefined
        ? {
            travelFee: row.travelFeeCents ? fromMinorUnits(row.travelFeeCents) : null,
            travelFeeCents: row.travelFeeCents ? row.travelFeeCents.toString() : null,
          }
        : {}),
    };
  }

  private mapService(s: {
    id: string;
    serviceId: string | null;
    categoryId: string | null;
    name: string;
    description: string | null;
    priceCents: bigint;
    currency: string;
    durationMin: number;
    deliveryTypes: Prisma.JsonValue;
    travelFeeCents: bigint | null;
    images: Prisma.JsonValue | null;
    isActive: boolean;
    sortOrder: number;
    bookingWindowDays: number | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: s.id,
      serviceId: s.serviceId,
      categoryId: s.categoryId,
      name: s.name,
      description: s.description,
      durationMin: s.durationMin,
      deliveryTypes: s.deliveryTypes,
      images: s.images,
      isActive: s.isActive,
      sortOrder: s.sortOrder,
      bookingWindowDays: s.bookingWindowDays,
      ...this.moneyFields(s),
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }

  private mapPortfolio(i: {
    id: string;
    title: string;
    description: string | null;
    images: Prisma.JsonValue | null;
    link: string | null;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: i.id,
      title: i.title,
      description: i.description,
      images: i.images,
      link: i.link,
      sortOrder: i.sortOrder,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    };
  }

  private mapProfile(p: {
    id: string;
    businessName: string | null;
    slug: string;
    tagline: string | null;
    bio: string | null;
    city: string | null;
    country: string | null;
    status: ProviderStatus;
    travelToCustomer: boolean;
    serviceRadiusKm: number | null;
    yearsExperience: number | null;
    languages: string[];
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: p.id,
      businessName: p.businessName,
      slug: p.slug,
      tagline: p.tagline,
      bio: p.bio,
      city: p.city,
      country: p.country,
      status: p.status,
      travelToCustomer: p.travelToCustomer,
      serviceRadiusKm: p.serviceRadiusKm,
      yearsExperience: p.yearsExperience,
      languages: p.languages,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  private mapProfileDetail(p: {
    id: string;
    businessName: string | null;
    slug: string;
    tagline: string | null;
    bio: string | null;
    city: string | null;
    country: string | null;
    address: Prisma.JsonValue | null;
    lat: number | null;
    lng: number | null;
    status: ProviderStatus;
    travelToCustomer: boolean;
    serviceRadiusKm: number | null;
    websiteUrl: string | null;
    businessPhone: string | null;
    yearsExperience: number | null;
    languages: string[];
    socialLinks: Prisma.JsonValue | null;
    workingPreferences: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
    categories: { category: { id: string; name: string; slug: string } }[];
    services: {
      id: string;
      serviceId: string | null;
      categoryId: string | null;
      name: string;
      description: string | null;
      priceCents: bigint;
      currency: string;
      durationMin: number;
      deliveryTypes: Prisma.JsonValue;
      travelFeeCents: bigint | null;
      images: Prisma.JsonValue | null;
      isActive: boolean;
      sortOrder: number;
      bookingWindowDays: number | null;
      createdAt: Date;
      updatedAt: Date;
    }[];
    portfolio: {
      id: string;
      title: string;
      description: string | null;
      images: Prisma.JsonValue | null;
      link: string | null;
      sortOrder: number;
      createdAt: Date;
      updatedAt: Date;
    }[];
    verification: {
      status: string;
      level: string;
      history: { id: string; fromStatus: string | null; toStatus: string; note: string | null; createdAt: Date }[];
      documents: { id: string; kind: string; uploadedAt: Date }[];
    } | null;
    user: { name: string; email: string; phone: string | null; profileImage: string | null };
  }) {
    return {
      ...this.mapProfile(p),
      address: p.address,
      lat: p.lat,
      lng: p.lng,
      websiteUrl: p.websiteUrl,
      businessPhone: p.businessPhone,
      socialLinks: p.socialLinks,
      workingPreferences: p.workingPreferences,
      categories: p.categories.map((c) => c.category),
      services: p.services.map((s) => this.mapService(s)),
      portfolio: p.portfolio.map((i) => this.mapPortfolio(i)),
      verification: p.verification
        ? {
            status: p.verification.status,
            level: p.verification.level,
            history: p.verification.history,
            documents: p.verification.documents,
          }
        : null,
      owner: p.user,
    };
  }

  private mapPublicSummary(p: {
    id: string;
    businessName: string | null;
    slug: string;
    tagline: string | null;
    city: string | null;
    country: string | null;
    travelToCustomer: boolean;
    serviceRadiusKm: number | null;
    yearsExperience: number | null;
    languages: string[];
    categories: { category: { id: string; name: string; slug: string } }[];
    services: {
      id: string;
      serviceId: string | null;
      categoryId: string | null;
      name: string;
      description: string | null;
      priceCents: bigint;
      currency: string;
      durationMin: number;
      deliveryTypes: Prisma.JsonValue;
      travelFeeCents: bigint | null;
      images: Prisma.JsonValue | null;
      isActive: boolean;
      sortOrder: number;
      bookingWindowDays: number | null;
      createdAt: Date;
      updatedAt: Date;
    }[];
    verification: { status: string; level: string } | null;
  }) {
    return {
      id: p.id,
      businessName: p.businessName,
      slug: p.slug,
      tagline: p.tagline,
      city: p.city,
      country: p.country,
      travelToCustomer: p.travelToCustomer,
      serviceRadiusKm: p.serviceRadiusKm,
      yearsExperience: p.yearsExperience,
      languages: p.languages,
      categories: p.categories.map((c) => c.category),
      serviceCount: p.services.length,
      fromPrice: p.services.length ? Math.min(...p.services.map((s) => fromMinorUnits(s.priceCents))) : null,
      verified: p.verification?.status === 'VERIFIED',
      verificationLevel: p.verification?.level ?? null,
    };
  }

  private mapPublicProfile(p: {
    id: string;
    businessName: string | null;
    slug: string;
    tagline: string | null;
    bio: string | null;
    city: string | null;
    country: string | null;
    address: Prisma.JsonValue | null;
    lat: number | null;
    lng: number | null;
    travelToCustomer: boolean;
    serviceRadiusKm: number | null;
    websiteUrl: string | null;
    businessPhone: string | null;
    yearsExperience: number | null;
    languages: string[];
    socialLinks: Prisma.JsonValue | null;
    workingPreferences: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
    categories: { category: { id: string; name: string; slug: string } }[];
    services: {
      id: string;
      serviceId: string | null;
      categoryId: string | null;
      name: string;
      description: string | null;
      priceCents: bigint;
      currency: string;
      durationMin: number;
      deliveryTypes: Prisma.JsonValue;
      travelFeeCents: bigint | null;
      images: Prisma.JsonValue | null;
      isActive: boolean;
      sortOrder: number;
      bookingWindowDays: number | null;
      createdAt: Date;
      updatedAt: Date;
    }[];
    portfolio: {
      id: string;
      title: string;
      description: string | null;
      images: Prisma.JsonValue | null;
      link: string | null;
      sortOrder: number;
      createdAt: Date;
      updatedAt: Date;
    }[];
    verification: { status: string; level: string; verifiedAt: Date | null } | null;
    user: { name: string; profileImage: string | null };
  }) {
    return {
      id: p.id,
      businessName: p.businessName,
      slug: p.slug,
      tagline: p.tagline,
      bio: p.bio,
      city: p.city,
      country: p.country,
      location: p.address,
      lat: p.lat,
      lng: p.lng,
      travelToCustomer: p.travelToCustomer,
      serviceRadiusKm: p.serviceRadiusKm,
      websiteUrl: p.websiteUrl,
      businessPhone: p.businessPhone,
      yearsExperience: p.yearsExperience,
      languages: p.languages,
      socialLinks: p.socialLinks,
      workingPreferences: p.workingPreferences,
      ownerName: p.user.name,
      ownerImage: p.user.profileImage,
      categories: p.categories.map((c) => c.category),
      services: p.services.map((s) => this.mapService(s)),
      portfolio: p.portfolio.map((i) => this.mapPortfolio(i)),
      verification: p.verification
        ? {
            verified: p.verification.status === 'VERIFIED',
            level: p.verification.level,
            verifiedAt: p.verification.verifiedAt,
          }
        : { verified: false, level: null, verifiedAt: null },
      // Placeholders for later phases (booking not yet implemented).
      reviews: { summary: null, placeholder: true },
      availability: { placeholder: true },
      booking: { cta: true, enabled: false },
    };
  }
}
