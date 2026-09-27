import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../../common/adapters/notification/notification.module';
import { NotificationsService } from './notifications.service';
import { NotificationsWorker } from './notifications.worker';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [PrismaModule, AuditModule, NotificationModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsWorker],
  exports: [NotificationsService],
})
export class NotificationsModule {}
