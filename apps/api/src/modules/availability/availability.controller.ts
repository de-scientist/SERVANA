import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import { Auth, CurrentUser } from '../auth/guards/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ProvidersService } from '../providers/providers.service';
import {
  listSlotsSchema,
  updateAvailabilitySchema,
} from './dto/availability.schema';
import { AvailabilityService } from './availability.service';

@Controller()
export class AvailabilityController {
  constructor(
    private readonly availability: AvailabilityService,
    private readonly providers: ProvidersService,
  ) {}

  @Auth()
  @Get('providers/me/availability')
  async getMine(@CurrentUser() user: { sub: string }) {
    const profile = await this.providers.getOwnProfile(user.sub);
    if (!profile) return { rules: [], exceptions: [] };
    return this.availability.getAvailability(profile.id);
  }

  @Auth()
  @Put('providers/me/availability')
  async setMine(
    @CurrentUser() user: { sub: string },
    @Body(new ZodValidationPipe(updateAvailabilitySchema)) body: any,
  ) {
    const profile = await this.providers.getOwnProfile(user.sub);
    if (!profile) {
      return { rules: 0, exceptions: 0 };
    }
    return this.availability.setAvailability(profile.id, body);
  }

  @Get('providers/:slug/availability')
  async publicSlots(
    @Param('slug') slug: string,
    @Query(new ZodValidationPipe(listSlotsSchema)) query: any,
  ) {
    return this.availability.getPublicSlots(
      slug,
      query.serviceId,
      query.date,
      query.days ?? 1,
    );
  }
}
