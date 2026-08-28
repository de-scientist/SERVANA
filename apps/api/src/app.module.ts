import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './modules/prisma/prisma.module';
import { RedisModule } from './modules/redis/redis.module';
import { QueueModule } from './modules/queue/queue.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PaymentModule } from './common/adapters/payment/payment.module';
import { AiModule } from './common/adapters/ai/ai.module';
import { NotificationModule } from './common/adapters/notification/notification.module';
import { StorageModule } from './common/adapters/storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '.env.local'] }),
    PrismaModule,
    RedisModule,
    QueueModule,
    HealthModule,
    UsersModule,
    AuthModule,
    PaymentModule,
    AiModule,
    NotificationModule,
    StorageModule,
  ],
})
export class AppModule {}
