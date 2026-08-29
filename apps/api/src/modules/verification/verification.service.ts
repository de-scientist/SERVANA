import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProviderStatus, VerificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppLoggerService } from '../../common/logging/logger.service';
import { AuditService } from '../audit/audit.service';
import { StorageProvider, STORAGE_PROVIDER } from '../../common/adapters/storage/storage.provider';
import { randomSuffix } from '../../common/utils/slug';
import {
  DOCUMENT_KINDS,
  SubmitVerificationInput,
  ReviewVerificationInput,
  ListVerificationsInput,
} from './dto/verification.schema';
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from '../providers/dto/provider.schema';

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly logger: AppLoggerService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  private async getProviderId(userId: string): Promise<string> {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Provider profile not found');
    return profile.id;
  }

  private async recordHistory(verificationId: string, providerId: string, from: VerificationStatus | null, to: VerificationStatus, actorId: string | null, note?: string) {
    await this.prisma.providerVerificationHistory.create({
      data: { verificationId, providerId, fromStatus: from, toStatus: to, actorId: actorId ?? null, note: note ?? null },
    });
  }

  // --- provider self-service ----------------------------------------------

  async submit(userId: string, dto: SubmitVerificationInput) {
    const providerId = await this.getProviderId(userId);
    const verification = await this.prisma.providerVerification.findUnique({ where: { providerId } });
    if (!verification) throw new NotFoundException('Verification record not found');

    const from = verification.status as VerificationStatus;
    if (from === VerificationStatus.VERIFIED || from === VerificationStatus.UNDER_REVIEW) {
      throw new ConflictException(`Cannot resubmit while verification is ${from}`);
    }

    const updated = await this.prisma.providerVerification.update({
      where: { providerId },
      data: {
        status: VerificationStatus.UNDER_REVIEW,
        submittedAt: new Date(),
        reviewerNotes: dto.notes ?? null,
        rejectionReason: null,
        level: dto.level ?? verification.level,
      },
    });
    await this.prisma.providerProfile.update({
      where: { id: providerId },
      data: { status: ProviderStatus.PENDING_VERIFICATION },
    });
    await this.recordHistory(updated.id, providerId, from, VerificationStatus.UNDER_REVIEW, userId, dto.notes);
    await this.audit.record({ actorId: userId, action: 'provider.verification.submit', entity: 'providerVerification', entityId: providerId, after: { status: updated.status } });
    return this.mapVerification(updated);
  }

  async getOwn(userId: string) {
    const providerId = await this.getProviderId(userId);
    const verification = await this.prisma.providerVerification.findUnique({
      where: { providerId },
      include: {
        history: { orderBy: { createdAt: 'desc' } },
        documents: { orderBy: { uploadedAt: 'desc' } },
      },
    });
    if (!verification) throw new NotFoundException('Verification record not found');
    return this.mapVerificationDetail(verification);
  }

  async uploadDocument(
    userId: string,
    file: { buffer: Buffer; mimetype: string; originalname?: string },
    kind: string,
  ) {
    const providerId = await this.getProviderId(userId);
    if (!DOCUMENT_KINDS.includes(kind as (typeof DOCUMENT_KINDS)[number])) {
      throw new ConflictException('Invalid document kind');
    }
    if (!ALLOWED_UPLOAD_TYPES.includes(file.mimetype as (typeof ALLOWED_UPLOAD_TYPES)[number])) {
      throw new ConflictException('Unsupported file type');
    }
    if (file.buffer.byteLength > MAX_UPLOAD_BYTES) {
      throw new ConflictException('File too large');
    }
    const verification = await this.prisma.providerVerification.findUnique({ where: { providerId } });
    if (!verification) throw new NotFoundException('Verification record not found');

    const key = `providers/docs/${providerId}/${Date.now()}-${randomSuffix(8)}`;
    // Documents are stored in the PRIVATE bucket — never publicly accessible.
    const result = await this.storage.upload({ key, contentType: file.mimetype, data: file.buffer, isPublic: false });
    const doc = await this.prisma.providerDocument.create({
      data: {
        providerId,
        verificationId: verification.id,
        kind,
        storageKey: result.storageKey,
        contentType: file.mimetype,
      },
    });
    await this.audit.record({ actorId: userId, action: 'provider.verification.doc.upload', entity: 'providerDocument', entityId: doc.id, after: { kind } });
    return {
      data: {
        id: doc.id,
        kind: doc.kind,
        contentType: doc.contentType,
        uploadedAt: doc.uploadedAt,
      },
    };
  }

  // --- admin ---------------------------------------------------------------

  async listForAdmin(filters: ListVerificationsInput) {
    const where: Prisma.ProviderVerificationWhereInput = {};
    if (filters.status) where.status = filters.status;
    const [rows, total] = await Promise.all([
      this.prisma.providerVerification.findMany({
        where,
        include: { provider: { select: { id: true, businessName: true, slug: true, city: true, status: true, userId: true } } },
        orderBy: { submittedAt: 'desc' },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.providerVerification.count({ where }),
    ]);
    return {
      data: rows.map((v) => ({
        providerId: v.providerId,
        businessName: v.provider.businessName,
        slug: v.provider.slug,
        city: v.provider.city,
        providerStatus: v.provider.status,
        status: v.status,
        level: v.level,
        submittedAt: v.submittedAt,
        reviewedAt: v.reviewedAt,
      })),
      meta: { page: filters.page, pageSize: filters.pageSize, total, pages: Math.ceil(total / filters.pageSize) || 0 },
    };
  }

  async getForAdmin(providerId: string) {
    const verification = await this.prisma.providerVerification.findUnique({
      where: { providerId },
      include: {
        provider: { select: { id: true, businessName: true, slug: true, city: true, country: true, status: true, userId: true } },
        history: { orderBy: { createdAt: 'desc' } },
        documents: { orderBy: { uploadedAt: 'desc' } },
      },
    });
    if (!verification) throw new NotFoundException('Verification record not found');
    return {
      providerId: verification.providerId,
      businessName: verification.provider.businessName,
      slug: verification.provider.slug,
      city: verification.provider.city,
      country: verification.provider.country,
      providerStatus: verification.provider.status,
      status: verification.status,
      level: verification.level,
      submittedAt: verification.submittedAt,
      reviewedAt: verification.reviewedAt,
      reviewerNotes: verification.reviewerNotes,
      rejectionReason: verification.rejectionReason,
      expiresAt: verification.expiresAt,
      history: verification.history,
      // Documents are returned as metadata only — never raw bytes/keys exposed.
      documents: verification.documents.map((d) => ({ id: d.id, kind: d.kind, contentType: d.contentType, uploadedAt: d.uploadedAt })),
    };
  }

  /** Returns a time-limited signed URL for a private verification document. */
  async getDocumentSignedUrl(providerId: string, docId: string, actorId: string) {
    const doc = await this.prisma.providerDocument.findUnique({ where: { id: docId } });
    if (!doc || doc.providerId !== providerId) throw new NotFoundException('Document not found');
    const url = await this.storage.getSignedUrl(doc.storageKey, 300);
    await this.audit.record({ actorId, action: 'provider.verification.doc.access', entity: 'providerDocument', entityId: doc.id, ip: undefined });
    return { data: { id: doc.id, url } };
  }

  async review(actorId: string, providerId: string, dto: ReviewVerificationInput) {
    const verification = await this.prisma.providerVerification.findUnique({ where: { providerId } });
    if (!verification) throw new NotFoundException('Verification record not found');
    const from = verification.status as VerificationStatus;

    if (dto.decision === 'APPROVE') {
      const expiresAt = dto.expiresInDays ? new Date(Date.now() + dto.expiresInDays * 86400000) : null;
      const updated = await this.prisma.providerVerification.update({
        where: { providerId },
        data: {
          status: VerificationStatus.VERIFIED,
          reviewedAt: new Date(),
          reviewedById: actorId,
          reviewerNotes: dto.note ?? null,
          rejectionReason: null,
          level: dto.level ?? verification.level,
          expiresAt,
          verifiedById: actorId,
          verifiedAt: new Date(),
        },
      });
      await this.prisma.providerProfile.update({ where: { id: providerId }, data: { status: ProviderStatus.VERIFIED } });
      await this.recordHistory(updated.id, providerId, from, VerificationStatus.VERIFIED, actorId, dto.note);
      await this.audit.record({ actorId, action: 'provider.verification.approve', entity: 'providerVerification', entityId: providerId, after: { level: updated.level } });
      return this.mapVerification(updated);
    }

    // REJECT
    const updated = await this.prisma.providerVerification.update({
      where: { providerId },
      data: {
        status: VerificationStatus.REJECTED,
        reviewedAt: new Date(),
        reviewedById: actorId,
        reviewerNotes: dto.note ?? null,
        rejectionReason: dto.rejectionReason ?? 'Rejected by reviewer',
      },
    });
    await this.prisma.providerProfile.update({ where: { id: providerId }, data: { status: ProviderStatus.DRAFT } });
    await this.recordHistory(updated.id, providerId, from, VerificationStatus.REJECTED, actorId, dto.rejectionReason);
    await this.audit.record({ actorId, action: 'provider.verification.reject', entity: 'providerVerification', entityId: providerId, after: { reason: updated.rejectionReason } });
    return this.mapVerification(updated);
  }

  // --- mappers -------------------------------------------------------------

  private mapVerification(v: { providerId: string; status: VerificationStatus; level: string; submittedAt: Date | null; reviewedAt: Date | null; expiresAt: Date | null; verifiedAt: Date | null }) {
    return {
      providerId: v.providerId,
      status: v.status,
      level: v.level,
      submittedAt: v.submittedAt,
      reviewedAt: v.reviewedAt,
      expiresAt: v.expiresAt,
      verifiedAt: v.verifiedAt,
    };
  }

  private mapVerificationDetail(v: {
    providerId: string;
    status: VerificationStatus;
    level: string;
    submittedAt: Date | null;
    reSubmittedAt: Date | null;
    reviewedAt: Date | null;
    reviewedById: string | null;
    reviewerNotes: string | null;
    rejectionReason: string | null;
    expiresAt: Date | null;
    verifiedById: string | null;
    verifiedAt: Date | null;
    history: { id: string; fromStatus: VerificationStatus | null; toStatus: VerificationStatus; actorId: string | null; note: string | null; createdAt: Date }[];
    documents: { id: string; kind: string; contentType: string | null; uploadedAt: Date }[];
  }) {
    return {
      ...this.mapVerification(v),
      reSubmittedAt: v.reSubmittedAt,
      reviewedById: v.reviewedById,
      reviewerNotes: v.reviewerNotes,
      rejectionReason: v.rejectionReason,
      verifiedById: v.verifiedById,
      history: v.history,
      documents: v.documents.map((d) => ({ id: d.id, kind: d.kind, contentType: d.contentType, uploadedAt: d.uploadedAt })),
    };
  }
}
