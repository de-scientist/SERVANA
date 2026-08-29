import { Injectable, NotImplementedException } from '@nestjs/common';
import {
  PaymentInitRequest,
  PaymentInitResult,
  PaymentMethod,
  PaymentProvider,
  PaymentRefundRequest,
} from './payment.provider';

/**
 * Shared simulation used by every dev/test adapter. It does NOT move real money.
 *
 * In production (`NODE_ENV === 'production'`) the simulate methods throw, forcing
 * a real PSP implementation to be wired in. The `initiate`/`refund` of a real
 * adapter would call the provider's API and return its reference; `verifyWebhook`
 * would verify the HMAC signature with the provider secret.
 *
 * This base keeps provider-specific adapters thin and prevents business logic
 * from being hard-coded to a single PSP.
 */
@Injectable()
export abstract class SimulatedPaymentProvider implements PaymentProvider {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly methods: PaymentMethod[];

  protected readonly simulate: boolean;

  constructor() {
    this.simulate = process.env.NODE_ENV !== 'production';
  }

  async initiate(req: PaymentInitRequest): Promise<PaymentInitResult> {
    if (!this.simulate) {
      throw new NotImplementedException(
        `Payment provider "${this.id}" has no production integration configured`,
      );
    }
    return {
      providerRef: `${this.id}_${req.idempotencyKey}`,
      status: 'PENDING',
    };
  }

  async verifyWebhook(rawBody: string, signature: string | undefined): Promise<boolean> {
    if (!this.simulate) {
      // Production: verify HMAC with the provider secret. Hard fail by default.
      return false;
    }
    void rawBody;
    return signature === process.env.MPESA_WEBHOOK_SECRET || signature === 'test-signature';
  }

  async refund(req: PaymentRefundRequest): Promise<{ providerRef: string; status: string }> {
    if (!this.simulate) {
      throw new NotImplementedException(
        `Payment provider "${this.id}" has no production integration configured`,
      );
    }
    return { providerRef: `refund_${req.providerRef}`, status: 'SUCCESSFUL' };
  }
}
