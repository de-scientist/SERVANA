import { Controller, Get, Param } from '@nestjs/common';
import { ProvidersService } from './providers.service';

@Controller('services')
export class ServicesController {
  constructor(private readonly providers: ProvidersService) {}

  @Get(':id')
  async getPublic(@Param('id') id: string) {
    return this.providers.getPublicService(id);
  }
}
