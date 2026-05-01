import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async createUser({ email, name, role, password }: { email: string; name: string; role: string; password: string }) {
    const bcrypt = require('bcryptjs');
    const passwordHash = await bcrypt.hash(password, 10);
    return this.prisma.user.create({
      data: { email, name, role: role as Role, passwordHash },
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findAll() {
    return this.prisma.user.findMany({
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
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(data.role !== undefined && { role: data.role as Role }),
        ...(data.name !== undefined && { name: data.name }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.pensumPercent !== undefined && { pensumPercent: data.pensumPercent }),
        ...(data.hoursPerWeek !== undefined && { hoursPerWeek: data.hoursPerWeek }),
        ...(data.hoursPerYear !== undefined && { hoursPerYear: data.hoursPerYear }),
        ...(data.vacationDaysYearly !== undefined && { vacationDaysYearly: data.vacationDaysYearly }),
      },
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
}
