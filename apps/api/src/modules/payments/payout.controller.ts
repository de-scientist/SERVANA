import { z } from 'zod';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Auth, CurrentUser } from '../auth/guards/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PayoutService, PayoutActor } from './payout.service';
import { PayoutMethodService } from './payout-method.service';
import { createPayoutSchema, payoutAdjustmentSchema } from './dto/payout.schema';

type JwtUser = { sub: string; roles?: string[] };

/**
 * SECURITY: the JWT payload carries `roles: string[]` (never `role`).
 * Previous code read `user.role` (always undefined), which silently disabled
 * provider-scoping checks. Every handler here derives a single actor role
 * from the roles array with an explicit precedence.
 */
function toActor(user: JwtUser): PayoutActor {
  const roles = user.roles ?? [];
  const role = roles.includes('SUPER_ADMIN')
    ? 'SUPER_ADMIN'
    : roles.includes('ADMIN')
      ? 'ADMIN'
      : roles.includes('SUPPORT')
        ? 'SUPPORT'
        : roles.includes('PROVIDER')
          ? 'PROVIDER'
          : 'CUSTOMER';
  return { sub: user.sub, role: role as PayoutActor['role'] };
}

@Controller('payments/payouts')
export class PayoutController {
  constructor(
    private readonly payouts: PayoutService,
    private readonly payoutMethods: PayoutMethodService,
  ) {}

  // --- static admin/provider routes MUST come before ':id' ----------------
  // (Nest matches in registration order; ':id' would swallow them otherwise.)

  @Auth('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get('dashboard')
  async adminDashboard(@CurrentUser() user: JwtUser, @Query('page') page = '1', @Query('pageSize') pageSize = '20', @Query('status') status?: string, @Query('providerId') providerId?: string) {
    const actor = toActor(user);
    return { data: await this.payouts.adminDashboard(actor, { page: Number(page), pageSize: Number(pageSize), status, providerId }) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get('failed')
  async failed(@CurrentUser() user: JwtUser, @Query('page') page = '1', @Query('pageSize') pageSize = '20') {
    const actor = toActor(user);
    return { data: await this.payouts.adminDashboard(actor, { status: 'FAILED', page: Number(page), pageSize: Number(pageSize) }) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get('reconciliation')
  async reconciliation(@CurrentUser() user: JwtUser, @Query('providerId') providerId?: string, @Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string) {
    const actor = toActor(user);
    return { data: await this.payouts.reconcile(actor, { providerId, dateFrom: dateFrom ? new Date(dateFrom) : undefined, dateTo: dateTo ? new Date(dateTo) : undefined }) };
  }

  @Auth('PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get('earnings')
  async providerDashboard(@CurrentUser() user: JwtUser, @Query('providerId') providerId?: string) {
    const actor = toActor(user);
    return { data: await this.payouts.getEarningsDashboard(actor, providerId) };
  }

  @Auth('PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get('methods')
  async listMethods(@CurrentUser() user: JwtUser, @Query('providerId') providerId?: string) {
    const actor = toActor(user);
    return { data: await this.payoutMethods.listMethods(actor, providerId) };
  }

  // SECURITY: payout-method mutation is provider-self or admin-only.
  // SUPPORT is read-only and must not register/remove payout destinations.
  @Auth('PROVIDER', 'ADMIN', 'SUPER_ADMIN')
  @Post('methods')
  async addMethod(@CurrentUser() user: JwtUser, @Body(new ZodValidationPipe(z.object({ type: z.enum(['MPESA', 'BANK']), detailsRef: z.string().min(1).max(200), isDefault: z.boolean().optional(), providerId: z.string().min(1).optional() }))) body: any) {
    const actor = toActor(user);
    return { data: await this.payoutMethods.addMethod(actor, { type: body.type, detailsRef: body.detailsRef, isDefault: body.isDefault, providerId: body.providerId }) };
  }

  @Auth('PROVIDER', 'ADMIN', 'SUPER_ADMIN')
  @Delete('methods/:id')
  async removeMethod(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    const actor = toActor(user);
    return { data: await this.payoutMethods.removeMethod(actor, id) };
  }

  @Auth('PROVIDER', 'ADMIN', 'SUPER_ADMIN')
  @Patch('methods/:id/default')
  async setDefault(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    const actor = toActor(user);
    return { data: await this.payoutMethods.setDefault(actor, id) };
  }

  @Auth('PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get()
  async list(@CurrentUser() user: JwtUser, @Query('providerId') providerId?: string, @Query('status') status?: string, @Query('page') page = '1', @Query('pageSize') pageSize = '20') {
    const actor = toActor(user);
    return { data: await this.payouts.listPayouts(actor, { providerId, status, page: Number(page), pageSize: Number(pageSize) }) };
  }

  // --- param routes last ----------------------------------------------------

  @Auth('PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get(':id')
  async get(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    const actor = toActor(user);
    return { data: await this.payouts.getPayout(actor, id) };
  }

  @Auth('PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get(':id/transactions')
  async transactions(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    const actor = toActor(user);
    return { data: await this.payouts.getTransactionDetail(actor, id) };
  }

  // SECURITY: every money-mutating payout endpoint is ADMIN/SUPER_ADMIN only.
  // SUPPORT staff are read-only (fraud review/annotate) and must never
  // create, process, retry, reverse, adjust, or fail payouts.
  @Auth('ADMIN', 'SUPER_ADMIN')
  @Post()
  async create(@CurrentUser() user: JwtUser, @Body(new ZodValidationPipe(createPayoutSchema)) body: any) {
    const actor = toActor(user);
    return { data: await this.payouts.createPayout(actor, { providerId: body.providerId, methodId: body.methodId, earningIds: body.earningIds, currency: body.currency }) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Post(':id/process')
  async process(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    const actor = toActor(user);
    return { data: await this.payouts.processPayout(actor, id) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Post(':id/retry')
  async retry(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    const actor = toActor(user);
    return { data: await this.payouts.retryPayout(actor, id) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Post(':id/reverse')
  async reverse(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body(new ZodValidationPipe(z.object({ reason: z.string().max(500).optional() }))) body: { reason?: string }) {
    const actor = toActor(user);
    return { data: await this.payouts.reversePayout(actor, id, body.reason) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Post(':id/adjustment')
  async adjustment(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body(new ZodValidationPipe(payoutAdjustmentSchema)) body: any) {
    const actor = toActor(user);
    return { data: await this.payouts.adjustPayout(actor, id, BigInt(body.amountCents), body.reason) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Post(':id/fail')
  async fail(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body(new ZodValidationPipe(z.object({ reason: z.string().max(500) }))) body: { reason: string }) {
    const actor = toActor(user);
    return { data: await this.payouts.failPayout(actor, id, body.reason) };
  }
}
