import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

const SYSTEM_ACTIONS = ['timer_stop'];

interface ActivityFilters {
  page: number;
  pageSize: number;
  userId?: string;
  action?: string;
  entityType?: string;
  dateFrom?: string;
  dateTo?: string;
}

@Injectable()
export class ActivityService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: any, filters: ActivityFilters): Promise<{ data: any[]; total: number; page: number; pageSize: number }> {
    if (!user) return { data: [], total: 0, page: 1, pageSize: 25 };

    const where: any = {};
    if (filters.userId) where.actorUserId = filters.userId;
    if (filters.action) {
      if (filters.action === 'SYSTEM') {
        where.action = { in: SYSTEM_ACTIONS };
      } else {
        where.action = filters.action;
      }
    }
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
      if (filters.dateTo) {
        const to = new Date(filters.dateTo);
        to.setHours(23, 59, 59, 999);
        where.createdAt.lte = to;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        include: { actor: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.activity.count({ where }),
    ]);

    return { data, total, page: filters.page, pageSize: filters.pageSize };
  }
}
