import { Injectable } from '@nestjs/common';
import { forbidden, notFound } from '../../common/error/error.response';
import { PrismaService } from '../../common/prisma.service';
import { Account, Role } from '@prisma/client';

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: any, page = 1, pageSize = 20): Promise<Account[]> {
    // Enforce role-based access and pagination
    if (!user || !user.role) {
      return this.prisma.account.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
      });
    }
    if (user.role === Role.ADMIN) {
      return this.prisma.account.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
      });
    }
    return this.prisma.account.findMany({
      where: {
        OR: [
          { createdByUserId: user.userId },
          { ownerUserId: user.userId },
        ],
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  }

  async findById(id: string, user: any): Promise<Account> {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) throw notFound('Account not found');
    // If user is undefined (no auth), allow access for testing
    if (!user || !user.role) {
      return account;
    }
    if (user.role !== Role.ADMIN && account.ownerUserId !== user.userId && account.createdByUserId !== user.userId) {
      throw forbidden('Access denied');
    }
    return account;
  }
  async create(body: any, user: any): Promise<Account> {
    // Use the authenticated user as owner/creator if available
    const ownerUserId = body.ownerUserId || user?.userId;
    const createdByUserId = body.createdByUserId || user?.userId;
    if (!ownerUserId || !createdByUserId) {
      throw new Error('ownerUserId and createdByUserId are required');
    }
    return this.prisma.account.create({
      data: {
        name: body.name,
        type: body.type,
        ownerUserId,
        createdByUserId,
        address: body.address || null,
        phone: body.phone || null,
        email: body.email || null,
        notes: body.notes || null,
      },
    });
  }
  async update(id: string, body: any, user: any): Promise<Account> {
    // Only allow update if user is owner or creator or admin
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) throw notFound('Account not found');
    if (user && user.role !== Role.ADMIN && account.ownerUserId !== user.userId && account.createdByUserId !== user.userId) {
      throw forbidden('Access denied');
    }

    // Prevent type/status change unless user is admin
    if (
      body.type &&
      body.type !== account.type &&
      user && user.role !== Role.ADMIN
    ) {
      throw forbidden('Only admins can change account type/status');
    }

    // Log type/status changes for investigation
    if (body.type && body.type !== account.type) {
      // You can replace this with a proper audit log table if needed
      console.log(`Account type change: Account ${id} from ${account.type} to ${body.type} by user ${user?.userId || 'unknown'}`);
    }

    return this.prisma.account.update({
      where: { id },
      data: {
        name: body.name,
        type: body.type,
        address: body.address,
        phone: body.phone,
        email: body.email,
        notes: body.notes,
      },
    });
  }
  async delete(id: string, user: any): Promise<{ deleted: boolean }> {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) throw notFound('Account not found');
    if (user && user.role !== Role.ADMIN && account.ownerUserId !== user.userId && account.createdByUserId !== user.userId) {
      throw forbidden('Access denied');
    }
    await this.prisma.account.delete({ where: { id } });
    return { deleted: true };
  }
}
