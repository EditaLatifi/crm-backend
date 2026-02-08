import { Injectable, ForbiddenException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Contact, Role } from '@prisma/client';
import { ActivityLoggerService } from '../activity/activity-logger.service';

@Injectable()
export class ContactsService {
  constructor(
    private prisma: PrismaService,
    private activityLogger: ActivityLoggerService,
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

  async findAll(user: any): Promise<Contact[]> {
    if (!user || !user.role) {
      return this.prisma.contact.findMany();
    }
    if (user.role === Role.ADMIN) {
      return this.prisma.contact.findMany();
    }
    // Only contacts for accounts user can access
    return this.prisma.contact.findMany({
      where: {
        OR: [
          { account: { ownerUserId: user.userId } },
          { account: { createdByUserId: user.userId } },
        ],
      },
    });
  }

  async findById(id: string, user: any): Promise<Contact> {
    const contact = await this.prisma.contact.findUnique({ where: { id }, include: { account: true } });
    if (!contact) throw new NotFoundException('Contact not found');
    if (!user || !user.role) {
      return contact;
    }
    if (
      user.role !== Role.ADMIN &&
      contact.account &&
      contact.account.ownerUserId !== user.userId &&
      contact.account.createdByUserId !== user.userId
    ) {
      throw new ForbiddenException('Access denied');
    }
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
}
