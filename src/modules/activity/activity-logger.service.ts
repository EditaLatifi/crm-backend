import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

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
    return this.prisma.activity.create({
      data: {
        actorUserId,
        entityType,
        entityId,
        action,
        payloadJson,
      },
    });
  }
}
