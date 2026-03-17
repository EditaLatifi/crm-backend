import { Injectable } from '@nestjs/common';
import { forbidden, notFound } from '../../common/error/error.response';
import { PrismaService } from '../../common/prisma.service';
import { ActivityLoggerService } from '../activity/activity-logger.service';
import { Account, Role } from '@prisma/client';

@Injectable()
export class AccountsService {
  constructor(
    private prisma: PrismaService,
    private activityLogger: ActivityLoggerService,
  ) {}

  async findAll(user: any, page = 1, pageSize = 20): Promise<Account[]> {
    // All authenticated users can see all accounts
    return this.prisma.account.findMany({
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  }

  async findById(id: string, user: any): Promise<any> {
    const account = await this.prisma.account.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        contacts: { select: { id: true, name: true, email: true, phone: true, title: true } },
        deals: {
          select: { id: true, name: true, amount: true, currency: true, probability: true, stage: { select: { id: true, name: true, isWon: true, isLost: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
    if (!account) throw notFound('Account not found');
    return account;
  }
  async create(body: any, user: any): Promise<Account> {
    // Use the authenticated user as owner/creator if available
    const ownerUserId = body.ownerUserId || user?.userId;
    const createdByUserId = body.createdByUserId || user?.userId;
    if (!ownerUserId || !createdByUserId) {
      throw new Error('ownerUserId and createdByUserId are required');
    }
    const account = await this.prisma.account.create({
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
    if (user?.userId) {
      await this.activityLogger.logActivity({ actorUserId: user.userId, entityType: 'Account', entityId: account.id, action: 'CREATE', payloadJson: { name: account.name } });
    }
    return account;
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

    const updated = await this.prisma.account.update({
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
    if (user?.userId) {
      await this.activityLogger.logActivity({ actorUserId: user.userId, entityType: 'Account', entityId: id, action: 'UPDATE', payloadJson: { name: updated.name } });
    }
    return updated;
  }
  async delete(id: string, user: any): Promise<{ deleted: boolean }> {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) throw notFound('Account not found');
    if (user && user.role !== Role.ADMIN && account.ownerUserId !== user.userId && account.createdByUserId !== user.userId) {
      throw forbidden('Access denied');
    }
    await this.prisma.account.delete({ where: { id } });
    if (user?.userId) {
      await this.activityLogger.logActivity({ actorUserId: user.userId, entityType: 'Account', entityId: id, action: 'DELETE', payloadJson: { name: account.name } });
    }
    return { deleted: true };
  }
}
