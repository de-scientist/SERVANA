import { z } from 'zod';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Auth, CurrentUser } from '../auth/guards/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PayoutService } from './payout.service';
import { PayoutMethodService } from './payout-method.service';
import { createPayoutSchema, payoutAdjustmentSchema, processPayoutSchema, reconciliationQuerySchema, retryPayoutSchema } from './dto/payout.schema';

@Controller('payments/payouts')
export class PayoutController {
  constructor(
    private readonly payouts: PayoutService,
    private readonly payoutMethods: PayoutMethodService,
  ) {}

  @Auth('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get('failed')
  async failed(@CurrentUser() user: { sub: string; role: string }, @Query('page') page = '1', @Query('pageSize') pageSize = '20') {
    const actor = { sub: user.sub, role: user.role as any };
    return { data: await this.payouts.adminDashboard(actor, { status: 'FAILED', page: Number(page), pageSize: Number(pageSize) }) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get('dashboard')
  async adminDashboard(@CurrentUser() user: { sub: string; role: string }, @Query('page') page = '1', @Query('pageSize') pageSize = '20', @Query('status') status?: string) {
    const actor = { sub: user.sub, role: user.role as any };
    return { data: await this.payouts.adminDashboard(actor, { page: Number(page), pageSize: Number(pageSize), status }) };
  }

  @Auth('PROVIDER', 'ADMIN', 'SUPPORT')
  @Get('earnings')
  async providerDashboard(@CurrentUser() user: { sub: string; role: string }, @Query('providerId') providerId?: string) {
    const actor = { sub: user.sub, role: user.role as any };
    return { data: await this.payouts.getEarningsDashboard(actor, providerId) };
  }

  @Auth('PROVIDER', 'ADMIN', 'SUPPORT')
  @Get()
  async list(@CurrentUser() user: { sub: string; role: string }, @Query('providerId') providerId?: string, @Query('status') status?: string, @Query('page') page = '1', @Query('pageSize') pageSize = '20') {
    const actor = { sub: user.sub, role: user.role as any };
    return { data: await this.payouts.listPayouts(actor, { providerId, status, page: Number(page), pageSize: Number(pageSize) }) };
  }

  @Auth('PROVIDER', 'ADMIN', 'SUPPORT')
  @Get(':id')
  async get(@CurrentUser() user: { sub: string; role: string }, @Param('id') id: string) {
    const actor = { sub: user.sub, role: user.role as any };
    return { data: await this.payouts.getPayout(actor, id) };
  }

  @Auth('PROVIDER', 'ADMIN', 'SUPPORT')
  @Get(':id/transactions')
  async transactions(@CurrentUser() user: { sub: string; role: string }, @Param('id') id: string) {
    const actor = { sub: user.sub, role: user.role as any };
    return { data: await this.payouts.getTransactionDetail(actor, id) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Post()
  async create(@CurrentUser() user: { sub: string; role: string }, @Body(new ZodValidationPipe(createPayoutSchema)) body: any) {
    const actor = { sub: user.sub, role: user.role as any };
    return { data: await this.payouts.createPayout(actor, { providerId: body.providerId, methodId: body.methodId, totalCents: BigInt(body.totalCents), currency: body.currency }) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Post(':id/process')
  async process(@CurrentUser() user: { sub: string; role: string }, @Param('id') id: string) {
    const actor = { sub: user.sub, role: user.role as any };
    return { data: await this.payouts.processPayout(actor, id) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Post(':id/retry')
  async retry(@CurrentUser() user: { sub: string; role: string }, @Param('id') id: string) {
    const actor = { sub: user.sub, role: user.role as any };
    return { data: await this.payouts.retryPayout(actor, id) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Post(':id/reverse')
  async reverse(@CurrentUser() user: { sub: string; role: string }, @Param('id') id: string, @Body(new ZodValidationPipe(z.object({ reason: z.string().max(500).optional() }))) body: { reason?: string }) {
    const actor = { sub: user.sub, role: user.role as any };
    return { data: await this.payouts.reversePayout(actor, id, body.reason) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Post(':id/adjustment')
  async adjustment(@CurrentUser() user: { sub: string; role: string }, @Param('id') id: string, @Body(new ZodValidationPipe(payoutAdjustmentSchema)) body: any) {
    const actor = { sub: user.sub, role: user.role as any };
    return { data: await this.payouts.adjustPayout(actor, id, BigInt(body.amountCents), body.reason) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Post(':id/fail')
  async fail(@CurrentUser() user: { sub: string; role: string }, @Param('id') id: string, @Body(new ZodValidationPipe(z.object({ reason: z.string().max(500) }))) body: { reason: string }) {
    const actor = { sub: user.sub, role: user.role as any };
    return { data: await this.payouts.failPayout(actor, id, body.reason) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get('reconciliation')
  async reconciliation(@CurrentUser() user: { sub: string; role: string }, @Query('providerId') providerId?: string, @Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string) {
    const actor = { sub: user.sub, role: user.role as any };
    return { data: await this.payouts.reconcile(actor, { providerId, dateFrom: dateFrom ? new Date(dateFrom) : undefined, dateTo: dateTo ? new Date(dateTo) : undefined }) };
  }

  // --- payout methods ---------------------------------------------------

  @Auth('PROVIDER', 'ADMIN', 'SUPPORT')
  @Get('methods')
  async listMethods(@CurrentUser() user: { sub: string; role: string }, @Query('providerId') providerId?: string) {
    const actor = { sub: user.sub, role: user.role as any };
    return { data: await this.payoutMethods.listMethods(actor, providerId) };
  }

  @Auth('PROVIDER', 'ADMIN', 'SUPPORT')
  @Post('methods')
  async addMethod(@CurrentUser() user: { sub: string; role: string }, @Body(new ZodValidationPipe(z.object({ type: z.enum(['MPESA', 'BANK']), detailsRef: z.string().min(1).max(200), isDefault: z.boolean().optional() }))) body: any) {
    const actor = { sub: user.sub, role: user.role as any };
    return { data: await this.payoutMethods.addMethod(actor, { type: body.type, detailsRef: body.detailsRef, isDefault: body.isDefault }) };
  }

  @Auth('PROVIDER', 'ADMIN', 'SUPPORT')
  @Delete('methods/:id')
  async removeMethod(@CurrentUser() user: { sub: string; role: string }, @Param('id') id: string) {
    const actor = { sub: user.sub, role: user.role as any };
    return { data: await this.payoutMethods.removeMethod(actor, id) };
  }

  @Auth('PROVIDER', 'ADMIN', 'SUPPORT')
  @Patch('methods/:id/default')
  async setDefault(@CurrentUser() user: { sub: string; role: string }, @Param('id') id: string) {
    const actor = { sub: user.sub, role: user.role as any };
    return { data: await this.payoutMethods.setDefault(actor, id) };
  }
}
