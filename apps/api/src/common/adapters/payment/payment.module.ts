import { Module } from '@nestjs/common';
import {
  PAYMENT_PROVIDER,
  PAYMENT_PROVIDERS,
  PaymentProvider,
  PaymentMethod,
} from './payment.provider';
import { ALL_PAYMENT_PROVIDERS } from './psp-adapters';

/**
 * Wires the available payment providers. The default provider (OTHER) is used
 * when the requested method has no dedicated adapter. Real providers (M-Pesa,
 * card, bank) are swapped in here without touching domain code — the gateway
 * selects by `method`.
 */
@Module({
  providers: [
    ...ALL_PAYMENT_PROVIDERS.map((p) => ({ provide: p.constructor, useValue: p })),
    {
      provide: PAYMENT_PROVIDERS,
      useFactory: (): PaymentProvider[] => ALL_PAYMENT_PROVIDERS,
    },
    {
      provide: PAYMENT_PROVIDER,
      useFactory: (providers: PaymentProvider[]): PaymentProvider => {
        const byMethod = (m: PaymentMethod) => providers.find((p) => p.methods.includes(m));
        return byMethod('OTHER') ?? providers[0];
      },
      inject: [PAYMENT_PROVIDERS],
    },
  ],
  exports: [PAYMENT_PROVIDERS, PAYMENT_PROVIDER],
})
export class PaymentModule {}
