import { Inject, Injectable } from '@nestjs/common';
import {
  PAYMENT_PROVIDERS,
  PaymentMethod,
  PaymentProvider,
} from '../../common/adapters/payment/payment.provider';

/**
 * Routes a payment method to its configured provider adapter. Domain code asks
 * the gateway for a provider by method and never references a concrete PSP, so
 * M-Pesa / card / bank / other can be mixed without business-logic changes.
 */
@Injectable()
export class PaymentGateway {
  private readonly byMethod = new Map<PaymentMethod, PaymentProvider>();
  private readonly byId = new Map<string, PaymentProvider>();

  constructor(@Inject(PAYMENT_PROVIDERS) private readonly providers: PaymentProvider[]) {
    for (const p of providers) {
      this.byId.set(p.id, p);
      for (const m of p.methods) {
        if (!this.byMethod.has(m)) this.byMethod.set(m, p);
      }
    }
  }

  get(method: PaymentMethod): PaymentProvider {
    return (
      this.byMethod.get(method) ??
      this.byId.get('other') ??
      this.providers[0]
    );
  }

  getById(id: string | undefined | null): PaymentProvider | undefined {
    return id ? this.byId.get(id) : undefined;
  }
}
