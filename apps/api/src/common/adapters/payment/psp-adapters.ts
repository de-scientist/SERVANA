import { SimulatedPaymentProvider } from './simulated-payment.provider';
import { PaymentMethod } from './payment.provider';

export class MpesaPaymentProvider extends SimulatedPaymentProvider {
  readonly id = 'mpesa';
  readonly name = 'M-Pesa';
  readonly methods: PaymentMethod[] = ['MPESA'];
}

export class CardPaymentProvider extends SimulatedPaymentProvider {
  readonly id = 'card';
  readonly name = 'Card';
  readonly methods: PaymentMethod[] = ['CARD'];
}

export class BankPaymentProvider extends SimulatedPaymentProvider {
  readonly id = 'bank';
  readonly name = 'Bank transfer';
  readonly methods: PaymentMethod[] = ['BANK'];
}

export class OtherPaymentProvider extends SimulatedPaymentProvider {
  readonly id = 'other';
  readonly name = 'Other PSP';
  readonly methods: PaymentMethod[] = ['OTHER'];
}

export const ALL_PAYMENT_PROVIDERS = [
  new MpesaPaymentProvider(),
  new CardPaymentProvider(),
  new BankPaymentProvider(),
  new OtherPaymentProvider(),
];
