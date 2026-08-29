export type PaymentMethod = 'MPESA' | 'CARD' | 'BANK' | 'OTHER';

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
export const PAYMENT_PROVIDERS = Symbol('PAYMENT_PROVIDERS');

export interface PaymentInitRequest {
  idempotencyKey: string;
  amountCents: bigint;
  currency: string;
  phoneNumber?: string;
  reference: string;
  method: PaymentMethod;
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

export interface PaymentWebhookEvent {
  providerRef: string;
  status: 'PENDING' | 'SUCCESSFUL' | 'FAILED';
  amount: number;
  currency: string;
  transactionId?: string;
}

/**
 * Adapter contract for payment providers. Domain code (PaymentService) depends
 * only on this interface and on a method name — never on a specific PSP SDK or
 * on hard-coded business logic. Real adapters (M-Pesa Daraja, a card PSP, a bank
 * switch) implement this interface; the PaymentGateway routes by `method`.
 *
 * A webhook must be verified server-side (signature/secret) before it is
 * trusted. Under no circumstances should the API trust a client-supplied
 * success flag, redirect, amount, or commission value.
 */
export interface PaymentProvider {
  readonly id: string;
  readonly name: string;
  readonly methods: PaymentMethod[];
  initiate(req: PaymentInitRequest): Promise<PaymentInitResult>;
  verifyWebhook(rawBody: string, signature: string | undefined): Promise<boolean>;
  refund(req: PaymentRefundRequest): Promise<{ providerRef: string; status: string }>;
}
