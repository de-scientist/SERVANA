import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { searchSchema, SearchInput } from './dto/search.schema';
import { SEARCH_PROVIDER, SearchProvider } from './search.provider';

@Controller('search')
export class SearchController {
  constructor(
    @Inject(SEARCH_PROVIDER) private readonly search: SearchProvider,
  ) {}

  @Get()
  async searchAll(@Query(new ZodValidationPipe(searchSchema)) query: SearchInput) {
    return this.search.search({
      q: query.q,
      categoryId: query.categoryId,
      city: query.city,
      lat: query.lat,
      lng: query.lng,
      radiusKm: query.radiusKm,
      minPriceCents: query.minPrice,
      maxPriceCents: query.maxPrice,
      verified: query.verified,
      travelToCustomer: query.travelToCustomer,
      availableOn: query.availableOn,
      sort: query.sort,
      page: query.page,
      pageSize: query.pageSize,
    });
  }
}
