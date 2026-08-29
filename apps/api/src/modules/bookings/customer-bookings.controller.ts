import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Auth, CurrentUser } from '../auth/guards/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  bookingActionSchema,
  cancelBookingSchema,
  createBookingSchema,
  listBookingsSchema,
} from './dto/booking.schema';
import { BookingService } from './booking.service';

@Controller('bookings')
export class CustomerBookingsController {
  constructor(private readonly booking: BookingService) {}

  @Auth('CUSTOMER')
  @Post()
  async create(
    @CurrentUser() user: { sub: string },
    @Body(new ZodValidationPipe(createBookingSchema)) body: any,
  ) {
    return this.booking.create({ sub: user.sub, role: 'CUSTOMER' }, body);
  }

  @Auth('CUSTOMER')
  @Get()
  async list(
    @CurrentUser() user: { sub: string },
    @Query(new ZodValidationPipe(listBookingsSchema)) query: any,
  ) {
    return this.booking.listForCustomer({ sub: user.sub, role: 'CUSTOMER' }, query);
  }

  @Auth('CUSTOMER')
  @Get(':id')
  async detail(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return this.booking.getForCustomer({ sub: user.sub, role: 'CUSTOMER' }, id);
  }

  @Auth('CUSTOMER')
  @Patch(':id/cancel')
  async cancel(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelBookingSchema)) body: any,
  ) {
    return this.booking.cancelAsCustomer({ sub: user.sub, role: 'CUSTOMER' }, id, body);
  }
}
