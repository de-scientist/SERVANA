import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './modules/prisma/prisma.module';
import { RedisModule } from './modules/redis/redis.module';
import { QueueModule } from './modules/queue/queue.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { AuditModule } from './modules/audit/audit.module';
import { AdminModule } from './modules/admin/admin.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { VerificationModule } from './modules/verification/verification.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { AvailabilityModule } from './modules/availability/availability.module';
import { SearchModule } from './modules/search/search.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { PaymentModule } from './common/adapters/payment/payment.module';
import { AiModule } from './common/adapters/ai/ai.module';
import { NotificationModule } from './common/adapters/notification/notification.module';
import { StorageModule } from './common/adapters/storage/storage.module';
import { ThrottlerGuard } from './common/guards/throttler.guard';
import { LoggingModule } from './common/logging/logging.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '.env.local'] }),
    PrismaModule,
    RedisModule,
    QueueModule,
    HealthModule,
    UsersModule,
    AuthModule,
    RbacModule,
    AuditModule,
    AdminModule,
    ProvidersModule,
    VerificationModule,
    CategoriesModule,
    AvailabilityModule,
    SearchModule,
    BookingsModule,
    PaymentModule,
    AiModule,
    NotificationModule,
    StorageModule,
    LoggingModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
