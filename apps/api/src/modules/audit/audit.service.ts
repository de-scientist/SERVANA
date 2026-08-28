import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppLoggerService } from '../../common/logging/logger.service';

export interface AuditEntry {
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLoggerService,
  ) {}

  /** Write an audit record. Best-effort: never breaks the caller's request. */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? '',
          before: entry.before as object | undefined,
          after: entry.after as object | undefined,
          ip: entry.ip ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(`Audit write failed for ${entry.action}: ${(err as Error).message}`);
    }
  }
}
