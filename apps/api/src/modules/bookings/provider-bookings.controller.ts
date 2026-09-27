import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { Auth, CurrentUser } from '../auth/guards/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  bookingActionSchema,
  cancelBookingSchema,
  listBookingsSchema,
} from './dto/booking.schema';
import { BookingService } from './booking.service';

@Controller('bookings/provider')
export class ProviderBookingsController {
  constructor(private readonly booking: BookingService) {}

  @Auth('PROVIDER')
  @Get()
  async list(
    @CurrentUser() user: { sub: string },
    @Query(new ZodValidationPipe(listBookingsSchema)) query: any,
  ) {
    return this.booking.listForProvider({ sub: user.sub, role: 'PROVIDER' }, query);
  }

  @Auth('PROVIDER')
  @Get(':id')
  async detail(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return { data: await this.booking.getForProvider({ sub: user.sub, role: 'PROVIDER' }, id) };
  }

  @Auth('PROVIDER')
  @Patch(':id/confirm')
  async confirm(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(bookingActionSchema)) body: any,
  ) {
    return { data: await this.booking.confirm({ sub: user.sub, role: 'PROVIDER' }, id, body) };
  }

  @Auth('PROVIDER')
  @Patch(':id/decline')
  async decline(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(bookingActionSchema)) body: any,
  ) {
    return { data: await this.booking.decline({ sub: user.sub, role: 'PROVIDER' }, id, body) };
  }

  @Auth('PROVIDER')
  @Patch(':id/start')
  async start(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return { data: await this.booking.start({ sub: user.sub, role: 'PROVIDER' }, id) };
  }

  @Auth('PROVIDER')
  @Patch(':id/complete')
  async complete(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return { data: await this.booking.complete({ sub: user.sub, role: 'PROVIDER' }, id) };
  }

  @Auth('PROVIDER')
  @Patch(':id/cancel')
  async cancel(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelBookingSchema)) body: any,
  ) {
    return { data: await this.booking.cancelAsProvider({ sub: user.sub, role: 'PROVIDER' }, id, body) };
  }
}
