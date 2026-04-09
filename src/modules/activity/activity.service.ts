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

  /** Resolve entity display names for activities missing them in payloadJson */
  private async enrichEntityNames(activities: any[]): Promise<any[]> {
    // Collect entity IDs grouped by type for batch lookup
    const lookups: Record<string, Set<string>> = {};
    for (const act of activities) {
      const p = act.payloadJson as any;
      if (p?.name || p?.title || p?.subject) continue; // already has a display name
      if (!lookups[act.entityType]) lookups[act.entityType] = new Set();
      lookups[act.entityType].add(act.entityId);
    }

    // Batch resolve names
    const nameMap: Record<string, string> = {};
    const resolvers: Record<string, (ids: string[]) => Promise<{ id: string; name?: string; title?: string }[]>> = {
      Deal: (ids) => this.prisma.deal.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
      Account: (ids) => this.prisma.account.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
      Contact: (ids) => this.prisma.contact.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
      Task: (ids) => this.prisma.task.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } }),
      Project: (ids) => this.prisma.project.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    };

    for (const [type, idSet] of Object.entries(lookups)) {
      const resolver = resolvers[type];
      if (!resolver) continue;
      const entities = await resolver(Array.from(idSet));
      for (const e of entities) {
        nameMap[`${type}:${e.id}`] = (e as any).name || (e as any).title || e.id;
      }
    }

    // Enrich activities
    return activities.map((act) => {
      const p = act.payloadJson as any;
      if (p?.name || p?.title || p?.subject) return act;
      const resolvedName = nameMap[`${act.entityType}:${act.entityId}`];
      if (resolvedName) {
        return { ...act, payloadJson: { ...p, name: resolvedName } };
      }
      return act;
    });
  }

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

    // Enrich activities with entity names where payload doesn't contain them
    const enriched = await this.enrichEntityNames(data);

    return { data: enriched, total, page: filters.page, pageSize: filters.pageSize };
  }
}
