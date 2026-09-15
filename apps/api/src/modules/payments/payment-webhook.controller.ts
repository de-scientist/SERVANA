import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { PaymentService } from './payment.service';
import { PaymentGateway } from './payment.gateway';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { webhookEventSchema } from './dto/payment.schema';

/**
 * Public provider callback endpoint. No auth — but the provider is identified by
 * the URL segment and its signature is verified server-side before the event is
 * trusted. The API never trusts client-supplied success flags, amounts, or
 * commissions; those are recomputed from the authoritative Payment row.
 */
@Controller('payments/webhook')
export class PaymentWebhookController {
  constructor(
    private readonly payment: PaymentService,
    private readonly gateway: PaymentGateway,
  ) {}

  @Post(':provider')
  async handle(
    @Param('provider') providerId: string,
    @Req() req: Request,
    @Body(new ZodValidationPipe(webhookEventSchema)) event: any,
  ) {
    const provider = this.gateway.getById(providerId);
    if (!provider) return { ok: false, error: 'unknown provider' };

    const signature = (req.headers['x-pay-signature'] as string | undefined) ?? (req.headers['authorization'] as string | undefined);
    const rawBody = JSON.stringify(req.body);
    const valid = await provider.verifyWebhook(rawBody, signature);
    if (!valid) return { ok: false, error: 'invalid signature' };

    return this.payment.handleProviderEvent(providerId, event);
  }
}
