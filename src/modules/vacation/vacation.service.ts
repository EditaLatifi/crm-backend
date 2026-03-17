import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Role } from '@prisma/client';

const USER_SELECT = { id: true, name: true, email: true, role: true };

@Injectable()
export class VacationService {
  constructor(private prisma: PrismaService) {}

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

  /** Admin: approve or reject */
  async review(id: string, action: 'APPROVED' | 'REJECTED', adminNote: string | undefined, user: any) {
    if (user.role !== Role.ADMIN) throw new ForbiddenException('Nur Admins können Anträge genehmigen');
    const req = await this.prisma.vacationRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Antrag nicht gefunden');
    return this.prisma.vacationRequest.update({
      where: { id },
      data: {
        status: action,
        adminNote: adminNote || null,
        reviewedByUserId: user.userId,
        reviewedAt: new Date(),
      },
      include: { user: { select: USER_SELECT }, reviewedBy: { select: USER_SELECT } },
    });
  }

  /** Stats for admin: days used per user per year */
  async stats(year: number) {
    const y = year || new Date().getFullYear();
    const requests = await this.prisma.vacationRequest.findMany({
      where: {
        status: 'APPROVED',
        startDate: { gte: new Date(`${y}-01-01`), lte: new Date(`${y}-12-31`) },
      },
      include: { user: { select: USER_SELECT } },
    });
    // Aggregate by user
    const map: Record<string, { user: any; days: number; requests: number }> = {};
    for (const r of requests) {
      if (!map[r.userId]) map[r.userId] = { user: r.user, days: 0, requests: 0 };
      map[r.userId].days += r.days;
      map[r.userId].requests += 1;
    }
    return Object.values(map);
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
