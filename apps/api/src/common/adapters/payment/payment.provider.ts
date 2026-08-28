export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface PaymentInitRequest {
  idempotencyKey: string;
  amountCents: bigint;
  currency: string;
  phoneNumber?: string;
  reference: string;
}

export interface PaymentInitResult {
  providerRef: string;
  status: 'PENDING' | 'SUCCESSFUL' | 'FAILED';
}

export interface PaymentRefundRequest {
  providerRef: string;
  amountCents: bigint;
  reason?: string;
}

/**
 * Adapter contract for payment providers. Business logic depends only on this
 * interface, never on a specific PSP SDK. Real adapters (M-Pesa, card, bank)
 * are added later without touching domain code.
 */
export interface PaymentProvider {
  readonly id: string;
  initiate(req: PaymentInitRequest): Promise<PaymentInitResult>;
  verifyWebhook(rawBody: string, signature: string | undefined): Promise<boolean>;
  refund(req: PaymentRefundRequest): Promise<{ providerRef: string; status: string }>;
}
