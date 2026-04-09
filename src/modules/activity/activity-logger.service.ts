import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

/** Deduplication window in milliseconds (5 seconds) */
const DEDUP_WINDOW_MS = 5000;

@Injectable()
export class ActivityLoggerService {
  constructor(private prisma: PrismaService) {}

  async logActivity({
    actorUserId,
    entityType,
    entityId,
    action,
    payloadJson,
  }: {
    actorUserId: string;
    entityType: string;
    entityId: string;
    action: string;
    payloadJson: any;
  }) {
    // Idempotency check inside a transaction to prevent race-condition duplicates
    return this.prisma.$transaction(async (tx) => {
      const since = new Date(Date.now() - DEDUP_WINDOW_MS);
      const existing = await tx.activity.findFirst({
        where: {
          actorUserId,
          entityType,
          entityId,
          action,
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) return existing;

      return tx.activity.create({
        data: {
          actorUserId,
          entityType,
          entityId,
          action,
          payloadJson,
        },
      });
    });
  }
}
