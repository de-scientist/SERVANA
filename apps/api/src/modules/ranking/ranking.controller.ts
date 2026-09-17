import { Controller, Get, Param } from '@nestjs/common';
import { RankingService, ProviderDashboard } from './ranking.service';
import { Auth } from '../auth/guards/current-user.decorator';

@Controller('ranking')
export class RankingController {
  constructor(private readonly ranking: RankingService) {}

  @Get('/providers/:providerId')
  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPPORT', 'SUPER_ADMIN')
  async getRanking(@Param('providerId') providerId: string) {
    const result = await this.ranking.getRanking(providerId);
    return { data: result };
  }

  @Get('/providers/:providerId/dashboard')
  @Auth('CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPPORT', 'SUPER_ADMIN')
  async getDashboard(@Param('providerId') providerId: string): Promise<{ data: ProviderDashboard }> {
    const result = await this.ranking.getDashboard(providerId);
    return { data: result };
  }

  @Get('/snapshots')
  @Auth('ADMIN', 'SUPER_ADMIN')
  async recomputeAll() {
    const count = await this.ranking.computeAllSnapshots();
    return { data: { recomputed: count } };
  }
}
