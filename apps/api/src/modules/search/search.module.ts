import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { PostgresSearchService } from './postgres-search.service';
import { SEARCH_PROVIDER } from './search.provider';
import { AvailabilityModule } from '../availability/availability.module';

@Module({
  imports: [AvailabilityModule],
  controllers: [SearchController],
  providers: [
    { provide: SEARCH_PROVIDER, useClass: PostgresSearchService },
  ],
  exports: [SEARCH_PROVIDER],
})
export class SearchModule {}
