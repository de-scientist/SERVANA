import { Injectable } from '@nestjs/common';
import { NotificationMessage, NotificationProvider, NotificationResult } from './notification.provider';

@Injectable()
export class StubNotificationProvider implements NotificationProvider {
  readonly id = 'stub';

  async send(msg: NotificationMessage): Promise<NotificationResult> {
    // No-op in foundation; logs to stdout so wiring is observable.
    void msg.channel;
    return { delivered: true, providerRef: `stub_${Date.now()}` };
  }
}
