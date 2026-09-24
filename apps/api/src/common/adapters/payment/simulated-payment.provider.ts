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
    const configured = process.env.MPESA_WEBHOOK_SECRET;
    if (configured) {
      // SECURITY: a configured secret must match via HMAC-SHA256 over the
      // exact raw body, compared in constant time. No plain-text backdoors.
      if (!signature) return false;
      try {
        const { createHmac, timingSafeEqual } = await import('crypto');
        const expected = createHmac('sha256', configured).update(rawBody, 'utf8').digest();
        // Accept either raw hex signature or `sha256=<hex>` (common PSP form).
        const hex = signature.startsWith('sha256=') ? signature.slice(7) : signature;
        const actual = Buffer.from(hex, 'hex');
        if (actual.length !== expected.length) return false;
        return timingSafeEqual(actual, expected);
      } catch {
        return false;
      }
    }
    // No secret configured (local dev only): accept unsigned callbacks.
    return true;
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
