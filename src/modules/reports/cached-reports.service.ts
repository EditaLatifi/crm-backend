import { Injectable } from '@nestjs/common';
import { RedisService } from '../../common/redis.service';
import { PrismaService } from '../../common/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class CachedReportsService {
  constructor(
    private redis: RedisService,
    private prisma: PrismaService,
  ) {}

  async dashboard(user: any) {
    const cacheKey = user.role === Role.ADMIN ? 'dashboard:admin' : `dashboard:user:${user.userId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
    // Fallback to DB
    let totalMinutes = 0;
    if (user.role === Role.ADMIN) {
      const agg = await this.prisma.timeEntry.aggregate({ _sum: { durationMinutes: true } });
      totalMinutes = agg._sum.durationMinutes || 0;
    } else {
      const agg = await this.prisma.timeEntry.aggregate({ where: { userId: user.userId }, _sum: { durationMinutes: true } });
      totalMinutes = agg._sum.durationMinutes || 0;
    }
    const result = { totalMinutes };
    await this.redis.set(cacheKey, JSON.stringify(result), 60); // 1 min TTL
    return result;
  }
}
