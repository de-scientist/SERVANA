import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { Auth, CurrentUser } from '../auth/guards/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  createReviewSchema,
  respondReviewSchema,
  moderateReviewSchema,
  listReviewsSchema,
  type CreateReviewInput,
  type RespondReviewInput,
  type ModerateReviewInput,
  type ListReviewsInput,
} from './dtos/review.schema';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post()
  @Auth('CUSTOMER')
  async create(
    @CurrentUser() actor: { sub: string; roles: string[] },
    @Body(new ZodValidationPipe(createReviewSchema)) input: CreateReviewInput,
  ) {
    const result = await this.reviews.create({ sub: actor.sub, role: 'CUSTOMER' }, input);
    return { data: result };
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return { data: await this.reviews.getById(id) };
  }

  @Get('/provider/:providerId')
  async getForProvider(
    @Param('providerId') providerId: string,
    @Query(new ZodValidationPipe(listReviewsSchema)) input: ListReviewsInput,
  ) {
    return { data: await this.reviews.getForProvider(providerId, input) };
  }

  @Patch(':id/respond')
  @Auth('PROVIDER')
  async respond(
    @Param('id') id: string,
    @CurrentUser() actor: { sub: string; roles: string[] },
    @Body(new ZodValidationPipe(respondReviewSchema)) input: RespondReviewInput,
  ) {
    const result = await this.reviews.respond({ sub: actor.sub, role: 'PROVIDER' }, id, input);
    return { data: result };
  }

  @Patch(':id/moderate')
  @Auth('ADMIN', 'SUPER_ADMIN')
  async moderate(
    @Param('id') id: string,
    @CurrentUser() actor: { sub: string; roles: string[] },
    @Body(new ZodValidationPipe(moderateReviewSchema)) input: ModerateReviewInput,
  ) {
    const result = await this.reviews.moderate({ sub: actor.sub, role: 'ADMIN' }, id, input);
    return { data: result };
  }
}
