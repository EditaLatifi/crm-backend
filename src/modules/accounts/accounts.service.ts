import { Injectable, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { forbidden, notFound } from '../../common/error/error.response';
import { PrismaService } from '../../common/prisma.service';
import { ActivityLoggerService } from '../activity/activity-logger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { assertInternal, assertManagerOrOwner, isManager } from '../../common/access.util';
import { Account, Role } from '@prisma/client';

@Injectable()
export class AccountsService {
  constructor(
    private prisma: PrismaService,
    private activityLogger: ActivityLoggerService,
    private notifications: NotificationsService,
  ) {}

  async findAll(user: any, page = 1, pageSize = 100, type?: string): Promise<any[]> {
    assertInternal(user);
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
    assertInternal(user);
    const account = await this.prisma.account.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        contacts: { select: { id: true, name: true, email: true, phone: true, title: true } },
        // Deals are management-only; never expose them on the account detail to non-managers.
        ...(isManager(user?.role)
          ? {
              deals: {
                select: { id: true, name: true, amount: true, currency: true, stage: { select: { id: true, name: true, isWon: true, isLost: true } } },
                orderBy: { createdAt: 'desc' as const },
                take: 10,
              },
            }
          : {}),
      },
    });
    if (!account) throw notFound('Account not found');
    return account;
  }
  async create(body: any, user: any): Promise<Account> {
    // Use the authenticated user as owner/creator if available
    const ownerUserId = body.ownerUserId || user?.userId;
    const createdByUserId = body.createdByUserId || user?.userId;
    assertInternal(user);
    if (!ownerUserId || !createdByUserId) {
      throw new BadRequestException('ownerUserId and createdByUserId are required');
    }
    // Prevent duplicate account names
    if (body.name) {
      const existing = await this.prisma.account.findFirst({ where: { name: body.name } });
      if (existing) {
        throw new ConflictException(`Ein Konto mit dem Namen "${body.name}" existiert bereits.`);
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
    // Management or the owner/creator may edit.
    assertManagerOrOwner(user, account.ownerUserId, account.createdByUserId);

    // Prevent duplicate account names on rename
    if (body.name && body.name !== account.name) {
      const existing = await this.prisma.account.findFirst({ where: { name: body.name, id: { not: id } } });
      if (existing) {
        throw new ConflictException(`Ein Konto mit dem Namen "${body.name}" existiert bereits.`);
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
    assertManagerOrOwner(user, account.ownerUserId, account.createdByUserId);
    await this.prisma.account.delete({ where: { id } });
    if (user?.userId) {
      await this.activityLogger.logActivity({ actorUserId: user.userId, entityType: 'Account', entityId: id, action: 'DELETE', payloadJson: { name: account.name } });
    }
    return { deleted: true };
  }

  // ─── Account Notes (threaded) ───
  async getNotes(accountId: string, user?: any) {
    assertInternal(user);
    return (this.prisma.note as any).findMany({
      where: { accountId },
      include: { createdBy: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addNote(accountId: string, content: string, user: any) {
    assertInternal(user);
    const account = await this.prisma.account.findUnique({ where: { id: accountId }, select: { name: true, ownerUserId: true } });
    if (!account) throw notFound('Konto nicht gefunden');
    const note = await (this.prisma.note as any).create({
      data: { accountId, content, createdByUserId: user.userId },
      include: { createdBy: { select: { id: true, name: true, email: true } } },
    });
    if (account.ownerUserId && account.ownerUserId !== user.userId) {
      this.notifications.createForUser(
        account.ownerUserId, 'TASK_COMMENT',
        'Neue Notiz',
        `${note.createdBy?.name || 'Jemand'} hat eine Notiz zu "${account.name}" hinzugefügt`,
        'Account', accountId, `/accounts/${accountId}`,
      ).catch(() => {});
    }
    return note;
  }

  async deleteNote(noteId: string, user?: any) {
    const note = await this.prisma.note.findUnique({ where: { id: noteId } });
    if (!note) throw notFound('Notiz nicht gefunden');
    // Management or the note's author may delete it.
    if (!isManager(user?.role) && note.createdByUserId !== user?.userId) {
      throw new ForbiddenException('Zugriff verweigert');
    }
    await this.prisma.note.delete({ where: { id: noteId } });
    return { deleted: true };
  }

  // ─── Bulk Operations ───
  async bulkAssign(ids: string[], ownerUserId: string, user: any) {
    if (user.role !== Role.ADMIN) throw forbidden('Nur Admins können Konten zuweisen');
    if (!Array.isArray(ids) || ids.length === 0) throw new BadRequestException('Keine Konten ausgewählt');
    if (!ownerUserId) throw new BadRequestException('ownerUserId ist erforderlich');
    await this.prisma.account.updateMany({ where: { id: { in: ids } }, data: { ownerUserId } });
    return { updated: ids.length };
  }

  async bulkChangeType(ids: string[], type: string, user: any) {
    if (user.role !== Role.ADMIN) throw forbidden('Nur Admins können den Typ ändern');
    if (!Array.isArray(ids) || ids.length === 0) throw new BadRequestException('Keine Konten ausgewählt');
    if (!type) throw new BadRequestException('Typ ist erforderlich');
    await this.prisma.account.updateMany({ where: { id: { in: ids } }, data: { type: type as any } });
    return { updated: ids.length };
  }
}
