import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async dashboard(user: any) {
    if (user.role === Role.ADMIN) {
      // Example: global time totals
      const totalMinutes = await this.prisma.timeEntry.aggregate({ _sum: { durationMinutes: true } });
      return { totalMinutes: totalMinutes._sum.durationMinutes || 0 };
    } else {
      const totalMinutes = await this.prisma.timeEntry.aggregate({
        where: { userId: user.userId },
        _sum: { durationMinutes: true },
      });
      return { totalMinutes: totalMinutes._sum.durationMinutes || 0 };
    }
  }
}
