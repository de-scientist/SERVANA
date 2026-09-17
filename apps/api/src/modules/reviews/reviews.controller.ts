import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { Auth, CurrentUser } from '../auth/guards/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreateReviewInput,
  RespondReviewInput,
  ModerateReviewInput,
  ListReviewsInput,
} from './dtos/review.schema';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post()
  @Auth('CUSTOMER')
  async create(
    @CurrentUser() actor: { sub: string },
    @Body(new ZodValidationPipe(CreateReviewSchema)) input: CreateReviewInput,
  ) {
    const result = await this.reviews.create(actor, input);
    return { data: result };
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return { data: await this.reviews.getById(id) };
  }

  @Get('/provider/:providerId')
  async getForProvider(
    @Param('providerId') providerId: string,
    @Query(new ZodValidationPipe(ListReviewsSchema)) input: ListReviewsInput,
  ) {
    return { data: await this.reviews.getForProvider(providerId, input) };
  }

  @Patch(':id/respond')
  @Auth('PROVIDER')
  async respond(
    @Param('id') id: string,
    @CurrentUser() actor: { sub: string },
    @Body(new ZodValidationPipe(RespondReviewSchema)) input: RespondReviewInput,
  ) {
    const result = await this.reviews.respond(actor, id, input);
    return { data: result };
  }

  @Patch(':id/moderate')
  @Auth('ADMIN', 'SUPER_ADMIN')
  async moderate(
    @Param('id') id: string,
    @CurrentUser() actor: { sub: string },
    @Body(new ZodValidationPipe(ModerateReviewSchema)) input: ModerateReviewInput,
  ) {
    const result = await this.reviews.moderate(actor, id, input);
    return { data: result };
  }
}
