import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class AggregationJobService {
  private readonly logger = new Logger(AggregationJobService.name);
  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async runDailyAggregates() {
    this.logger.log('Running daily aggregates...');
    // Example: aggregate time by user
    const today = new Date();
    today.setHours(0,0,0,0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const entries = await this.prisma.timeEntry.findMany({
      where: {
        startedAt: { gte: today, lt: tomorrow },
      },
    });
    // ...aggregate and store in daily tables
  }
}
