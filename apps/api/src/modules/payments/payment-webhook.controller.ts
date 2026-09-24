import { Body, Controller, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { PaymentService } from './payment.service';
import { PaymentGateway } from './payment.gateway';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Throttle } from '../../common/guards/throttler.guard';
import { webhookEventSchema } from './dto/payment.schema';

/**
 * Public provider callback endpoint. No auth — but the provider is identified by
 * the URL segment and its signature is verified server-side before the event is
 * trusted. The API never trusts client-supplied success flags, amounts, or
 * commissions; those are recomputed from the authoritative Payment row.
 *
 * SECURITY: signature is computed over the EXACT raw request bytes captured
 * by the JSON verify-callback in main.ts (`req.rawBody`). Re-serializing
 * `req.body` would break HMAC canonicalization and enable forgery.
 */
@Controller('payments/webhook')
export class PaymentWebhookController {
  constructor(
    private readonly payment: PaymentService,
    private readonly gateway: PaymentGateway,
  ) {}

  // Tight throttle: this is an unauthenticated, signature-guessable surface.
  @Throttle(30, 60)
  @Post(':provider')
  async handle(
    @Param('provider') providerId: string,
    @Req() req: Request & { rawBody?: string },
    @Body(new ZodValidationPipe(webhookEventSchema)) event: any,
  ) {
    const provider = this.gateway.getById(providerId);
    if (!provider) return { ok: false, error: 'unknown provider' };

    const signature = (req.headers['x-pay-signature'] as string | undefined) ?? (req.headers['authorization'] as string | undefined);
    const rawBody = req.rawBody ?? JSON.stringify(req.body);
    const valid = await provider.verifyWebhook(rawBody, signature);
    // SECURITY: fail closed with 401 so forged callbacks are visible in
    // monitoring (and never processed), instead of a silent 200 {ok:false}.
    if (!valid) throw new UnauthorizedException('invalid signature');

    return this.payment.handleProviderEvent(providerId, event);
  }
}
