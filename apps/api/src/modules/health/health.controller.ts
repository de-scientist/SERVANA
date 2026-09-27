import { Controller, Get, Header } from '@nestjs/common';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { RedisService } from '../../modules/redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  liveness(): { status: string; uptime: number } {
    return { status: 'ok', uptime: process.uptime() };
  }

  @Get('ready')
  async readiness(): Promise<{
    status: string;
    db: 'up' | 'down';
    redis: 'up' | 'down';
  }> {
    const dbUp = await this.checkDb();
    const redisUp = await this.redis.ping();
    const status = dbUp && redisUp ? 'ok' : 'degraded';
    return { status, db: dbUp ? 'up' : 'down', redis: redisUp ? 'up' : 'down' };
  }

  /**
   * Minimal Prometheus exposition endpoint (no new deps).
   * NOTE: restrict /metrics to the internal network / scraper via ingress or
   * network policy — it is intentionally unauthenticated for Prometheus.
   */
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async metrics(): Promise<string> {
    const dbUp = await this.checkDb();
    const redisUp = await this.redis.ping();
    const lines = [
      '# HELP servana_uptime_seconds Process uptime in seconds.',
      '# TYPE servana_uptime_seconds gauge',
      `servana_uptime_seconds ${process.uptime()}`,
      '# HELP servana_db_up Database reachability (1 = up, 0 = down).',
      '# TYPE servana_db_up gauge',
      `servana_db_up ${dbUp ? 1 : 0}`,
      '# HELP servana_redis_up Redis reachability (1 = up, 0 = down).',
      '# TYPE servana_redis_up gauge',
      `servana_redis_up ${redisUp ? 1 : 0}`,
    ];
    return `${lines.join('\n')}\n`;
  }

  private async checkDb(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
