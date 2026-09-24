import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { searchSchema, SearchInput } from './dto/search.schema';
import { SEARCH_PROVIDER, SearchProvider } from './search.provider';
import { AnalyticsService } from '../analytics/analytics.service';

@Controller('search')
export class SearchController {
  constructor(
    @Inject(SEARCH_PROVIDER) private readonly search: SearchProvider,
    private readonly analytics: AnalyticsService,
  ) {}

  @Get()
  async searchAll(@Query(new ZodValidationPipe(searchSchema)) query: SearchInput) {
    const result = await this.search.search({
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
    await this.analytics.track('SEARCH_PERFORMED', {
      payload: {
        q: query.q ?? null,
        categoryId: query.categoryId ?? null,
        city: query.city ?? null,
        verified: query.verified ?? null,
      },
    });
    return result;
  }
}
