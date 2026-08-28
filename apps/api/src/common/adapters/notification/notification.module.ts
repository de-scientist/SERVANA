import { Inject, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NOTIFICATION_PROVIDER,
  NotificationProvider,
} from './notification.provider';
import { StubNotificationProvider } from './stub-notification.provider';

@Module({
  providers: [
    {
      provide: NOTIFICATION_PROVIDER,
      useFactory: (_config: ConfigService): NotificationProvider => new StubNotificationProvider(),
      inject: [ConfigService],
    },
  ],
  exports: [NOTIFICATION_PROVIDER],
})
export class NotificationModule {}
