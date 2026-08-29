import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
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

  @Auth('CUSTOMER', 'ADMIN', 'SUPPORT')
  @Get(':id')
  async detail(@CurrentUser() user: { sub: string; roles: string[] }, @Param('id') id: string) {
    const actor: PaymentActor = {
      sub: user.sub,
      role: user.roles.includes('ADMIN') ? 'ADMIN' : user.roles.includes('SUPPORT') ? 'SUPPORT' : 'CUSTOMER',
    };
    return { data: await this.payment.getForCustomer(actor, id) };
  }

  @Auth('CUSTOMER', 'ADMIN', 'SUPPORT')
  @Post(':id/refund')
  async refund(
    @CurrentUser() user: { sub: string; roles: string[] },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(refundPaymentSchema)) body: { reason?: string },
  ) {
    const actor: PaymentActor = {
      sub: user.sub,
      role: user.roles.includes('ADMIN') ? 'ADMIN' : user.roles.includes('SUPPORT') ? 'SUPPORT' : 'CUSTOMER',
    };
    return { data: await this.payment.refund(actor, id, body.reason) };
  }
}
