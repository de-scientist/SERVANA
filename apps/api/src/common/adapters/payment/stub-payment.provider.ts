import { Injectable } from '@nestjs/common';
import {
  PaymentInitRequest,
  PaymentInitResult,
  PaymentProvider,
  PaymentRefundRequest,
} from './payment.provider';

/**
 * Development stub. Simulates a successful payment without contacting any PSP.
 * Replace with a real adapter (e.g. MpesaProvider) selected by env config.
 */
@Injectable()
export class StubPaymentProvider implements PaymentProvider {
  readonly id = 'stub';

  async initiate(req: PaymentInitRequest): Promise<PaymentInitResult> {
    return {
      providerRef: `stub_${req.idempotencyKey}`,
      status: 'PENDING',
    };
  }

  async verifyWebhook(rawBody: string, signature: string | undefined): Promise<boolean> {
    return signature === process.env.MPESA_WEBHOOK_SECRET || signature === 'test-signature';
  }

  async refund(req: PaymentRefundRequest): Promise<{ providerRef: string; status: string }> {
    return { providerRef: `refund_${req.providerRef}`, status: 'SUCCESSFUL' };
  }
}
