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

  async findAll(user: any, page = 1, pageSize = 100, type?: string): Promise<any[]> {
    const where: any = {};
    if (type) where.type = type;
    return this.prisma.account.findMany({
      where,
      include: { owner: { select: { id: true, name: true, email: true } } },
      skip: (page - 1) * pageSize,
      take: Number(pageSize),
    });
  }

  async findById(id: string, user: any): Promise<any> {
    const account = await this.prisma.account.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        contacts: { select: { id: true, name: true, email: true, phone: true, title: true } },
        deals: {
          select: { id: true, name: true, amount: true, currency: true, stage: { select: { id: true, name: true, isWon: true, isLost: true } } },
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
    // Prevent duplicate account names
    if (body.name) {
      const existing = await this.prisma.account.findFirst({ where: { name: body.name } });
      if (existing) {
        throw new Error(`Ein Konto mit dem Namen "${body.name}" existiert bereits.`);
      }
    }
    const account = await this.prisma.account.create({
      data: {
        name: body.name,
        type: body.type,
        ownerUserId,
        createdByUserId,
        address: body.address || null,
        addressStreet: body.addressStreet || null,
        addressNumber: body.addressNumber || null,
        addressZip: body.addressZip || null,
        addressCity: body.addressCity || null,
        addressCanton: body.addressCanton || null,
        phone: body.phone || null,
        email: body.email || null,
        notes: body.notes || null,
        vendorType: body.vendorType || null,
        rating: body.rating ? Number(body.rating) : null,
        contactPerson: body.contactPerson || null,
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

    // Prevent duplicate account names on rename
    if (body.name && body.name !== account.name) {
      const existing = await this.prisma.account.findFirst({ where: { name: body.name, id: { not: id } } });
      if (existing) {
        throw new Error(`Ein Konto mit dem Namen "${body.name}" existiert bereits.`);
      }
    }

    // Prevent type/status change unless user is admin
    if (
      body.type &&
      body.type !== account.type &&
      user && user.role !== Role.ADMIN
    ) {
      throw forbidden('Only admins can change account type/status');
    }

    const changes: Record<string, { from: any; to: any }> = {};
    if (body.name && body.name !== account.name) changes['Name'] = { from: account.name, to: body.name };
    if (body.type && body.type !== account.type) changes['Typ'] = { from: account.type, to: body.type };
    if (body.phone !== undefined && body.phone !== account.phone) changes['Telefon'] = { from: account.phone, to: body.phone };
    if (body.email !== undefined && body.email !== account.email) changes['E-Mail'] = { from: account.email, to: body.email };

    const updated = await this.prisma.account.update({
      where: { id },
      data: {
        name: body.name,
        type: body.type,
        address: body.address,
        addressStreet: body.addressStreet,
        addressNumber: body.addressNumber,
        addressZip: body.addressZip,
        addressCity: body.addressCity,
        addressCanton: body.addressCanton,
        phone: body.phone,
        email: body.email,
        notes: body.notes,
        vendorType: body.vendorType !== undefined ? (body.vendorType || null) : undefined,
        rating: body.rating !== undefined ? (body.rating ? Number(body.rating) : null) : undefined,
        contactPerson: body.contactPerson !== undefined ? (body.contactPerson || null) : undefined,
      },
    });
    if (user?.userId) {
      await this.activityLogger.logActivity({ actorUserId: user.userId, entityType: 'Account', entityId: id, action: 'UPDATE', payloadJson: { name: updated.name, ...(Object.keys(changes).length > 0 ? { changes } : {}) } });
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
