import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { Auth, CurrentUser } from '../auth/guards/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PaymentService, PaymentActor } from './payment.service';
import { initiatePaymentSchema, refundPaymentSchema } from './dto/payment.schema';

@Controller('payments')
export class PaymentController {
  constructor(private readonly payment: PaymentService) {}

  @Auth('CUSTOMER')
  @Post()
  async initiate(
    @CurrentUser() user: { sub: string },
    @Body(new ZodValidationPipe(initiatePaymentSchema)) body: { bookingId: string; method?: any },
  ) {
    const actor: PaymentActor = { sub: user.sub, role: 'CUSTOMER' };
    return { data: await this.payment.initiate(actor, body) };
  }

  // SECURITY: payment detail carries amounts + ledger data — owner and
  // ADMIN/SUPER_ADMIN only. SUPPORT uses aggregated dashboards, not raw rows.
  @Auth('CUSTOMER', 'ADMIN', 'SUPER_ADMIN')
  @Get(':id')
  async detail(@CurrentUser() user: { sub: string; roles: string[] }, @Param('id') id: string) {
    const actor: PaymentActor = {
      sub: user.sub,
      role: user.roles.includes('SUPER_ADMIN') ? 'SUPER_ADMIN' : user.roles.includes('ADMIN') ? 'ADMIN' : 'CUSTOMER',
    };
    return { data: await this.payment.getForCustomer(actor, id) };
  }

  // SECURITY: refunds move money — admin-only. Customers request refunds
  // via disputes/support; they can never self-refund (privilege + ledger risk).
  @Auth('ADMIN', 'SUPER_ADMIN')
  @Post(':id/refund')
  async refund(
    @CurrentUser() user: { sub: string; roles: string[] },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(refundPaymentSchema)) body: { reason?: string },
  ) {
    const actor: PaymentActor = {
      sub: user.sub,
      role: user.roles.includes('SUPER_ADMIN') ? 'SUPER_ADMIN' : 'ADMIN',
    };
    return { data: await this.payment.refund(actor, id, body.reason) };
  }
}
