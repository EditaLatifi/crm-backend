import { Injectable, ForbiddenException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Contact, Role } from '@prisma/client';
import { ActivityLoggerService } from '../activity/activity-logger.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ContactsService {
  constructor(
    private prisma: PrismaService,
    private activityLogger: ActivityLoggerService,
    private notifications: NotificationsService,
  ) {}

  async deleteContact(id: string, user?: any): Promise<void> {
    const deleted = await this.prisma.contact.delete({ where: { id } });
    // Log activity
    if (user && user.userId) {
      await this.activityLogger.logActivity({
        actorUserId: user.userId,
        entityType: 'Contact',
        entityId: id,
        action: 'DELETE',
        payloadJson: deleted,
      });
    }
  }

  async findAll(user: any, page = 1, pageSize = 50, search?: string): Promise<{ data: Contact[]; total: number; page: number; pageSize: number }> {
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [data, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        include: { account: { select: { id: true, name: true } } },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.contact.count({ where }),
    ]);
    return { data, total, page, pageSize };
  }

  async findById(id: string, user: any): Promise<Contact> {
    const contact = await this.prisma.contact.findUnique({ where: { id }, include: { account: true } });
    if (!contact) throw new NotFoundException('Contact not found');
    return contact;
  }

  async bulkDelete(ids: string[], user?: any): Promise<{ deleted: number }> {
    if (!Array.isArray(ids) || ids.length === 0) return { deleted: 0 };
    const result = await this.prisma.contact.deleteMany({ where: { id: { in: ids } } });
    // Log activity for each deleted contact
    if (user && user.userId) {
      for (const id of ids) {
        await this.activityLogger.logActivity({
          actorUserId: user.userId,
          entityType: 'Contact',
          entityId: id,
          action: 'DELETE',
          payloadJson: {},
        });
      }
    }
    return { deleted: result.count };
  }

  async updateContact(id: string, data: any, user: any): Promise<Contact> {
    const contact = await this.prisma.contact.findUnique({ where: { id }, include: { account: true } });
    if (!contact) throw new NotFoundException('Contact not found');
    const updated = await this.prisma.contact.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.title !== undefined && { title: data.title }),
        ...(data.accountId !== undefined && { accountId: data.accountId || null }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.followUpDate !== undefined && { followUpDate: data.followUpDate ? new Date(data.followUpDate) : null }),
      },
    });
    if (user?.userId) {
      await this.activityLogger.logActivity({
        actorUserId: user.userId,
        entityType: 'Contact',
        entityId: id,
        action: 'UPDATE',
        payloadJson: updated,
      });
    }
    return updated;
  }

  async createContact(data: any, user: any): Promise<Contact> {
    // Validate required fields
    if (!data.name || !data.email) {
      throw new Error('Missing required fields: name, email');
    }
    // Optionally, check if account exists and user has access if accountId is provided
    // Create the contact
    const contact = await this.prisma.contact.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone || '',
        accountId: data.accountId || null,
      },
    });
    // Log activity
    if (user && user.userId) {
      await this.activityLogger.logActivity({
        actorUserId: user.userId,
        entityType: 'Contact',
        entityId: contact.id,
        action: 'CREATE',
        payloadJson: contact,
      });
    }
    return contact;
  }

  // ─── Contact Notes (threaded) ───
  async getNotes(contactId: string) {
    return (this.prisma.note as any).findMany({
      where: { contactId },
      include: { createdBy: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addNote(contactId: string, content: string, user: any) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { name: true, accountId: true },
    });
    if (!contact) throw new NotFoundException('Kontakt nicht gefunden');

    const note = await (this.prisma.note as any).create({
      data: { contactId, content, createdByUserId: user.userId },
      include: { createdBy: { select: { id: true, name: true, email: true } } },
    });

    // Notify account owner if contact belongs to an account
    if (contact.accountId) {
      const account = await this.prisma.account.findUnique({
        where: { id: contact.accountId },
        select: { ownerUserId: true },
      });
      if (account?.ownerUserId && account.ownerUserId !== user.userId) {
        this.notifications.createForUser(
          account.ownerUserId, 'TASK_COMMENT',
          'Neue Notiz',
          `${note.createdBy?.name || 'Jemand'} hat eine Notiz zu "${contact.name}" hinzugefügt`,
          'Contact', contactId, `/contacts/${contactId}`,
        ).catch(() => {});
      }
    }

    return note;
  }

  async deleteNote(noteId: string) {
    await this.prisma.note.delete({ where: { id: noteId } });
    return { deleted: true };
  }
}
