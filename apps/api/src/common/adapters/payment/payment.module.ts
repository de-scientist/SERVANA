import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PAYMENT_PROVIDER, PaymentProvider } from './payment.provider';
import { StubPaymentProvider } from './stub-payment.provider';

@Module({
  providers: [
    {
      provide: PAYMENT_PROVIDER,
      useFactory: (_config: ConfigService): PaymentProvider => {
        // Future: switch on config.get('PAYMENT_DEFAULT_PROVIDER') to return
        // MpesaProvider / CardProvider / BankProvider.
        return new StubPaymentProvider();
      },
      inject: [ConfigService],
    },
  ],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentModule {}
