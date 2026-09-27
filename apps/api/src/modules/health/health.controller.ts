import { Controller, Get } from '@nestjs/common';
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

  private async checkDb(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
