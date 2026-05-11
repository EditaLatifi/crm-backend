import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EmailService } from '../email/email.service';
import { Role } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private email: EmailService,
  ) {}

  async createUser({ email, name, role, password }: { email: string; name: string; role: string; password: string }) {
    const bcrypt = require('bcryptjs');
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: { email, name, role: role as Role, passwordHash },
    });

    // Send welcome email with credentials
    const loginUrl = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/login`;
    this.email.send({
      to: email,
      subject: 'Willkommen im IP3 CRM – Dein Zugang',
      text: [
        `Hallo ${name},`,
        ``,
        `Dein Konto im IP3 CRM wurde erstellt.`,
        ``,
        `Login-URL:  ${loginUrl}`,
        `E-Mail:     ${email}`,
        `Passwort:   ${password}`,
        ``,
        `Bitte ändere dein Passwort nach dem ersten Login unter Profil.`,
        ``,
        `Viele Grüsse,`,
        `IP3 CRM Team`,
      ].join('\n'),
      accountId: null,
      loggedByUserId: user.id,
      entityType: 'User',
      entityId: user.id,
    }).catch(() => {});

    return user;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findAll() {
    return this.prisma.user.findMany({
      where: {
        email: { not: 'anonymous@crm.local' },
      },
      select: {
        id: true, email: true, name: true, role: true, createdAt: true, lastLoginAt: true,
        pensumPercent: true, hoursPerWeek: true, hoursPerYear: true, vacationDaysYearly: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async updateUser(
    id: string,
    data: {
      role?: string;
      name?: string;
      email?: string;
      pensumPercent?: number | null;
      hoursPerWeek?: number | null;
      hoursPerYear?: number | null;
      vacationDaysYearly?: number | null;
    },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    // Auto-calculate hours from Pensum if pensumPercent is provided
    const updateData: any = {
      ...(data.role !== undefined && { role: data.role as Role }),
      ...(data.name !== undefined && { name: data.name }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.pensumPercent !== undefined && { pensumPercent: data.pensumPercent }),
      ...(data.hoursPerWeek !== undefined && { hoursPerWeek: data.hoursPerWeek }),
      ...(data.hoursPerYear !== undefined && { hoursPerYear: data.hoursPerYear }),
      ...(data.vacationDaysYearly !== undefined && { vacationDaysYearly: data.vacationDaysYearly }),
    };

    // Auto-calculate: 100% = 42h/week, proportional
    if (data.pensumPercent !== undefined && data.pensumPercent !== null) {
      const hpw = Math.round((42 * data.pensumPercent / 100) * 10) / 10;
      const hpy = Math.round(hpw * 52 * 10) / 10;
      if (data.hoursPerWeek === undefined) updateData.hoursPerWeek = hpw;
      if (data.hoursPerYear === undefined) updateData.hoursPerYear = hpy;
    }

    return this.prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true, email: true, name: true, role: true, createdAt: true, lastLoginAt: true,
        pensumPercent: true, hoursPerWeek: true, hoursPerYear: true, vacationDaysYearly: true,
      },
    });
  }

  async deleteUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    await this.prisma.user.delete({ where: { id } });
    return { deleted: true };
  }

  async resetPassword(id: string, newPassword: string) {
    const bcrypt = require('bcryptjs');
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    return { success: true };
  }

  async updateLastLogin(id: string) {
    return this.prisma.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
  }

  async updatePasswordHash(id: string, passwordHash: string) {
    return this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  async updateProfile(id: string, data: { name?: string; email?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.email !== undefined && { email: data.email }),
      },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
  }

  async changePassword(id: string, oldPassword: string, newPassword: string) {
    const bcrypt = require('bcryptjs');
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    const valid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!valid) throw new Error('Aktuelles Passwort ist falsch');
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    return { success: true };
  }

  /** Calculate user utilization based on Pensum and logged hours */
  async getAuslastung(userId: string, year?: number) {
    const y = year || new Date().getFullYear();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, pensumPercent: true, hoursPerWeek: true, hoursPerYear: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const start = new Date(`${y}-01-01`);
    const end = new Date(`${y}-12-31T23:59:59`);

    const entries = await this.prisma.timeEntry.aggregate({
      where: { userId, startedAt: { gte: start, lte: end } },
      _sum: { durationMinutes: true },
    });

    const loggedMinutes = entries._sum.durationMinutes || 0;
    const loggedHours = Math.round(loggedMinutes / 60 * 10) / 10;
    const targetHours = user.hoursPerYear || (42 * (user.pensumPercent || 100) / 100 * 52);
    const utilizationPercent = targetHours > 0 ? Math.round((loggedHours / targetHours) * 1000) / 10 : 0;

    // Monthly breakdown
    const monthlyEntries = await this.prisma.timeEntry.findMany({
      where: { userId, startedAt: { gte: start, lte: end } },
      select: { startedAt: true, durationMinutes: true },
    });
    const byMonth: Record<number, number> = {};
    for (const e of monthlyEntries) {
      const m = new Date(e.startedAt).getMonth();
      byMonth[m] = (byMonth[m] || 0) + e.durationMinutes;
    }

    return {
      userId: user.id,
      name: user.name,
      year: y,
      pensumPercent: user.pensumPercent,
      targetHoursYear: Math.round(targetHours * 10) / 10,
      loggedHours,
      remainingHours: Math.round((targetHours - loggedHours) * 10) / 10,
      utilizationPercent,
      byMonth: Object.fromEntries(
        Array.from({ length: 12 }, (_, i) => [i, Math.round((byMonth[i] || 0) / 60 * 10) / 10])
      ),
    };
  }
}
