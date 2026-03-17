import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class ActivityService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: any, limit = 50): Promise<any[]> {
    if (!user) return [];

    const include = {
      actor: { select: { id: true, name: true, email: true } },
    };
    const orderBy = { createdAt: 'desc' as const };
    const take = limit;

    // Admins see everything
    if (user.role === Role.ADMIN) {
      return this.prisma.activity.findMany({ include, orderBy, take });
    }

    // Regular users see all activities (full team feed) — at minimum their own
    return this.prisma.activity.findMany({ include, orderBy, take });
  }
}
