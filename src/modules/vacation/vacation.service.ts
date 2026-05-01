import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Role } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

const USER_SELECT = { id: true, name: true, email: true, role: true };

@Injectable()
export class VacationService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /** Employee: get own requests */
  async findMine(user: any) {
    return this.prisma.vacationRequest.findMany({
      where: { userId: user.userId },
      include: { reviewedBy: { select: USER_SELECT } },
      orderBy: { startDate: 'desc' },
    });
  }

  /** Admin: get all requests (optional filter by userId / status) */
  async findAll(query: any) {
    const where: any = {};
    if (query.userId) where.userId = query.userId;
    if (query.status) where.status = query.status;
    if (query.year) {
      const y = parseInt(query.year);
      where.startDate = { gte: new Date(`${y}-01-01`), lte: new Date(`${y}-12-31`) };
    }
    return this.prisma.vacationRequest.findMany({
      where,
      include: {
        user: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Create a new vacation request */
  async create(data: any, user: any) {
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    if (end < start) throw new Error('Enddatum muss nach dem Startdatum liegen');
    const days = this.calcBusinessDays(start, end);
    return this.prisma.vacationRequest.create({
      data: {
        userId: user.userId,
        startDate: start,
        endDate: end,
        days,
        type: data.type || 'VACATION',
        note: data.note || null,
        status: 'PENDING',
      },
      include: { user: { select: USER_SELECT } },
    });
  }

  /** Employee: cancel own pending request */
  async cancel(id: string, user: any) {
    const req = await this.prisma.vacationRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Antrag nicht gefunden');
    if (req.userId !== user.userId && user.role !== Role.ADMIN) throw new ForbiddenException();
    if (req.status !== 'PENDING') throw new Error('Nur ausstehende Anträge können storniert werden');
    return this.prisma.vacationRequest.delete({ where: { id } });
  }

  /** Admin: approve or reject.
   *  Admins may approve their own requests.
   *  Non-admins cannot reach this endpoint (checked in controller).
   */
  async review(id: string, action: 'APPROVED' | 'REJECTED', adminNote: string | undefined, user: any) {
    if (user.role !== Role.ADMIN) throw new ForbiddenException('Nur Admins können Anträge genehmigen');
    const req = await this.prisma.vacationRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Antrag nicht gefunden');
    const updated = await this.prisma.vacationRequest.update({
      where: { id },
      data: {
        status: action,
        adminNote: adminNote || null,
        reviewedByUserId: user.userId,
        reviewedAt: new Date(),
      },
      include: { user: { select: USER_SELECT }, reviewedBy: { select: USER_SELECT } },
    });
    // Notify employee (even if admin approved own request – notification is to the requester)
    if (req.userId !== user.userId) {
      this.notifications.createForUser(
        req.userId,
        'VACATION_REVIEWED',
        action === 'APPROVED' ? 'Urlaub genehmigt' : 'Urlaub abgelehnt',
        action === 'APPROVED'
          ? 'Dein Urlaubsantrag wurde genehmigt.'
          : 'Dein Urlaubsantrag wurde abgelehnt.',
        'VacationRequest', id, '/vacation',
      ).catch(() => {});
    }
    return updated;
  }

  /** Stats for admin: days used per user per year, with quota and remaining */
  async stats(year: number) {
    const y = year || new Date().getFullYear();
    const [requests, quotas, allUsers] = await Promise.all([
      this.prisma.vacationRequest.findMany({
        where: {
          status: 'APPROVED',
          startDate: { gte: new Date(`${y}-01-01`), lte: new Date(`${y}-12-31`) },
        },
        include: { user: { select: USER_SELECT } },
      }),
      this.prisma.vacationQuota.findMany({
        where: { year: y },
        include: { user: { select: USER_SELECT } },
      }),
      this.prisma.user.findMany({ select: USER_SELECT }),
    ]);

    // Aggregate days used per user
    const usedMap: Record<string, { user: any; days: number; requests: number }> = {};
    for (const r of requests) {
      if (!usedMap[r.userId]) usedMap[r.userId] = { user: r.user, days: 0, requests: 0 };
      usedMap[r.userId].days += r.days;
      usedMap[r.userId].requests += 1;
    }

    // Build quota map
    const quotaMap: Record<string, number> = {};
    for (const q of quotas) quotaMap[q.userId] = q.days;

    // Merge: include all users that have a quota or used days
    const userMap: Record<string, any> = {};
    for (const u of allUsers) userMap[u.id] = u;

    return allUsers.map((u: any) => ({
      user: u,
      days: usedMap[u.id]?.days ?? 0,
      requests: usedMap[u.id]?.requests ?? 0,
      quota: quotaMap[u.id] ?? null,
      remaining: quotaMap[u.id] != null ? quotaMap[u.id] - (usedMap[u.id]?.days ?? 0) : null,
    }));
  }

  /** Get quota for current user's own stats */
  async allStats(year?: number) {
    const y = year || new Date().getFullYear();
    const start = new Date(`${y}-01-01`);
    const end = new Date(`${y}-12-31`);
    const [users, requests, quotas] = await Promise.all([
      this.prisma.user.findMany({ select: { id: true, name: true, email: true, vacationDaysYearly: true } }),
      this.prisma.vacationRequest.findMany({
        where: { status: 'APPROVED', startDate: { gte: start, lte: end } },
        select: { userId: true, days: true },
      }),
      this.prisma.vacationQuota.findMany({ where: { year: y } }),
    ]);
    const usedByUser: Record<string, number> = {};
    for (const r of requests) usedByUser[r.userId] = (usedByUser[r.userId] || 0) + r.days;
    const quotaByUser: Record<string, number> = {};
    for (const q of quotas) quotaByUser[q.userId] = q.days;

    return users.map(u => {
      const total = quotaByUser[u.id] ?? u.vacationDaysYearly ?? null;
      const used = usedByUser[u.id] || 0;
      return {
        userId: u.id,
        name: u.name,
        email: u.email,
        year: y,
        total,
        used,
        remaining: total != null ? total - used : null,
      };
    });
  }

  async myStats(user: any) {
    const year = new Date().getFullYear();
    const [requests, quota] = await Promise.all([
      this.prisma.vacationRequest.findMany({
        where: {
          userId: user.userId,
          status: 'APPROVED',
          startDate: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) },
        },
      }),
      this.prisma.vacationQuota.findUnique({ where: { userId_year: { userId: user.userId, year } } }),
    ]);
    const used = requests.reduce((s, r) => s + r.days, 0);
    return {
      year,
      used,
      quota: quota?.days ?? null,
      remaining: quota != null ? quota.days - used : null,
    };
  }

  /** Admin: get all quotas for a year */
  async getQuotas(year: number) {
    return this.prisma.vacationQuota.findMany({
      where: { year },
      include: { user: { select: USER_SELECT } },
    });
  }

  /** Admin: set quota for a user/year */
  async setQuota(userId: string, year: number, days: number) {
    return this.prisma.vacationQuota.upsert({
      where: { userId_year: { userId, year } },
      update: { days },
      create: { userId, year, days },
      include: { user: { select: USER_SELECT } },
    });
  }

  private calcBusinessDays(start: Date, end: Date): number {
    let count = 0;
    const cur = new Date(start);
    while (cur <= end) {
      const dow = cur.getDay();
      if (dow !== 0 && dow !== 6) count++;
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  }
}
