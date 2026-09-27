import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Auth, CurrentUser } from '../auth/guards/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { LoyaltyService } from './loyalty.service';
import { ReferralService } from './referral.service';
import { PromotionService } from './promotion.service';
import {
  updateRuleSchema,
  updateTierSchema,
  redeemSchema,
  createRewardSchema,
  updateRewardSchema,
  historyQuerySchema,
  claimReferralSchema,
  createPromotionSchema,
  updatePromotionSchema,
} from './dto/loyalty.schema';

type Actor = { sub: string; role: string };

@Controller()
export class LoyaltyController {
  constructor(
    private readonly loyalty: LoyaltyService,
    private readonly referrals: ReferralService,
    private readonly promotions: PromotionService,
  ) {}

  // --- customer: account ----------------------------------------------------------

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get('loyalty/account')
  async account(@CurrentUser() user: Actor) {
    return { data: await this.loyalty.getAccount(user.sub) };
  }

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get('loyalty/history')
  async history(@CurrentUser() user: Actor, @Query(new ZodValidationPipe(historyQuerySchema)) query: any) {
    return this.loyalty.history(user.sub, query.page, query.pageSize);
  }

  @Get('loyalty/rules')
  async rules() {
    return { data: await this.loyalty.listRules() };
  }

  @Get('rewards')
  async rewards() {
    return { data: await this.loyalty.listRewards(true) };
  }

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Post('loyalty/redeem')
  async redeem(@CurrentUser() user: Actor, @Body(new ZodValidationPipe(redeemSchema)) body: any) {
    return { data: await this.loyalty.redeem(user.sub, body.rewardId) };
  }

  // --- customer: referrals ----------------------------------------------------------

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get('referrals/code')
  async myCode(@CurrentUser() user: Actor) {
    return { data: await this.referrals.myCode(user.sub) };
  }

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Post('referrals/claim')
  async claim(@CurrentUser() user: Actor, @Body(new ZodValidationPipe(claimReferralSchema)) body: any) {
    return { data: await this.referrals.claim(user.sub, body.code) };
  }

  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get('referrals/mine')
  async mine(@CurrentUser() user: Actor) {
    return { data: await this.referrals.mine(user.sub) };
  }

  // --- admin: rules / tiers / rewards -----------------------------------------------------

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Patch('admin/loyalty/rules')
  async updateRule(@CurrentUser() user: Actor, @Body(new ZodValidationPipe(updateRuleSchema)) body: any) {
    return { data: await this.loyalty.updateRule(user.sub, body) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Get('admin/loyalty/tiers')
  async tiers() {
    return { data: await this.loyalty.listTiers() };
  }

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Patch('admin/loyalty/tiers/:id')
  async updateTier(
    @CurrentUser() user: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTierSchema)) body: any,
  ) {
    return { data: await this.loyalty.updateTier(user.sub, id, body.threshold) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Post('admin/rewards')
  async createReward(@CurrentUser() user: Actor, @Body(new ZodValidationPipe(createRewardSchema)) body: any) {
    return { data: await this.loyalty.createReward(user.sub, body) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Patch('admin/rewards/:id')
  async updateReward(
    @CurrentUser() user: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRewardSchema)) body: any,
  ) {
    return { data: await this.loyalty.updateReward(user.sub, id, body) };
  }

  // --- admin: promotions -----------------------------------------------------------------------

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Post('admin/promotions')
  async createPromotion(@CurrentUser() user: Actor, @Body(new ZodValidationPipe(createPromotionSchema)) body: any) {
    return { data: await this.promotions.create(user.sub, body) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @Get('admin/promotions')
  async listPromotions() {
    return { data: await this.promotions.list() };
  }

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Patch('admin/promotions/:id')
  async updatePromotion(
    @CurrentUser() user: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePromotionSchema)) body: any,
  ) {
    return { data: await this.promotions.update(user.sub, id, body) };
  }

  @Auth('ADMIN', 'SUPER_ADMIN')
  @Delete('admin/promotions/:id')
  async deactivatePromotion(@CurrentUser() user: Actor, @Param('id') id: string) {
    return { data: await this.promotions.update(user.sub, id, { active: false }) };
  }
}
