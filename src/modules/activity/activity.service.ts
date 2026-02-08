import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Activity, Role } from '@prisma/client';

@Injectable()
export class ActivityService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: any): Promise<Activity[]> {
    if (user.role === Role.ADMIN) {
      return this.prisma.activity.findMany();
    }
    // Only activities for entities user can access (simplified)
    return this.prisma.activity.findMany({
      where: {
        OR: [
          { actorUserId: user.userId },
        ],
      },
    });
  }
}
