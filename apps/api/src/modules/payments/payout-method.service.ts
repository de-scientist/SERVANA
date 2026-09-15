import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PayoutMethodType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface PayoutMethodActor {
  sub: string;
  role: 'CUSTOMER' | 'PROVIDER' | 'ADMIN' | 'SUPER_ADMIN' | 'SUPPORT';
}

@Injectable()
export class PayoutMethodService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listMethods(actor: PayoutMethodActor, providerId?: string): Promise<Array<{
    id: string;
    type: PayoutMethodType;
    detailsRef: string;
    isDefault: boolean;
    createdAt: Date;
  }>> {
    const targetProviderId = providerId ?? actor.sub;

    if (actor.role === 'PROVIDER' && actor.sub !== targetProviderId) {
      throw new ForbiddenException('Cannot view another provider\'s payout methods');
    }
    if (actor.role === 'CUSTOMER') {
      throw new ForbiddenException('Customers cannot view payout methods');
    }

    const methods = await this.prisma.payoutMethod.findMany({
      where: { providerId: targetProviderId },
      orderBy: [{ isDefault: 'desc' }],
    });

    return methods.map((m) => ({
      id: m.id,
      type: m.type as PayoutMethodType,
      detailsRef: this.maskDetailsRef(m.detailsRef, m.type),
      isDefault: m.isDefault,
      createdAt: m.createdAt,
    }));
  }

  async addMethod(actor: PayoutMethodActor, input: { type: PayoutMethodType; detailsRef: string; isDefault?: boolean }) {
    if (actor.role !== 'PROVIDER' && actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN' && actor.role !== 'SUPPORT') {
      throw new ForbiddenException('Only providers and admins can add payout methods');
    }

    const method = await this.prisma.payoutMethod.create({
      data: {
        providerId: actor.sub,
        type: input.type,
        detailsRef: input.detailsRef,
        isDefault: input.isDefault ?? false,
      },
    });

    await this.audit.record({
      actorId: actor.sub,
      action: 'payoutMethod.add',
      entity: 'payoutMethod',
      entityId: method.id,
      after: { type: input.type as string, isDefault: input.isDefault ?? false },
    });

    return {
      id: method.id,
      type: method.type,
      detailsRef: this.maskDetailsRef(method.detailsRef, method.type),
      isDefault: method.isDefault,
      createdAt: method.createdAt,
    };
  }

  async removeMethod(actor: PayoutMethodActor, methodId: string) {
    const method = await this.prisma.payoutMethod.findUnique({ where: { id: methodId } });
    if (!method) throw new NotFoundException('Payout method not found');

    if (actor.role === 'PROVIDER' && method.providerId !== actor.sub) {
      throw new ForbiddenException('Cannot remove another provider\'s payout method');
    }
    if (actor.role === 'CUSTOMER') {
      throw new ForbiddenException('Customers cannot remove payout methods');
    }

    if (method.isDefault) {
      throw new BadRequestException('Cannot remove the default payout method; set another default first');
    }

    await this.prisma.payoutMethod.delete({ where: { id: methodId } });

    await this.audit.record({
      actorId: actor.sub,
      action: 'payoutMethod.remove',
      entity: 'payoutMethod',
      entityId: methodId,
    });

    return { deleted: true };
  }

  async setDefault(actor: PayoutMethodActor, methodId: string) {
    const method = await this.prisma.payoutMethod.findUnique({ where: { id: methodId } });
    if (!method) throw new NotFoundException('Payout method not found');

    if (actor.role === 'PROVIDER' && method.providerId !== actor.sub) {
      throw new ForbiddenException('Cannot set another provider\'s method as default');
    }

    await this.prisma.payoutMethod.updateMany({
      where: { providerId: method.providerId },
      data: { isDefault: false },
    });

    await this.prisma.payoutMethod.update({
      where: { id: methodId },
      data: { isDefault: true },
    });

    await this.audit.record({
      actorId: actor.sub,
      action: 'payoutMethod.setDefault',
      entity: 'payoutMethod',
      entityId: methodId,
    });

    return { id: method.id, isDefault: true };
  }

  private maskDetailsRef(detailsRef: string, type: PayoutMethodType): string {
    if (type === 'MPESA') {
      return detailsRef.replace(/(\d{4})\d{@4}/, '$1****');
    }
    return detailsRef.replace(/.(?=.{4})/g, '*');
  }
}
