import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationType } from '@prisma/client';

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private gateway: NotificationsGateway,
  ) {}

  async createForUser(
    userId: string,
    type: NotificationType | string,
    title: string,
    body: string,
    entityType?: string,
    entityId?: string,
    href?: string,
  ) {
    const notification = await this.prisma.notification.create({
      data: { userId, type: type as NotificationType, title, body, entityType, entityId, href },
    });
    this.gateway.push(userId, { event: 'notification', data: notification });
    return notification;
  }

  async findAll(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, read: false },
    });
    return { count };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return { success: true };
  }

  async markRead(id: string, userId: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    });
    return { success: true };
  }

  async deleteOne(id: string, userId: string) {
    await this.prisma.notification.deleteMany({ where: { id, userId } });
    return { deleted: true };
  }

  async deleteOlderThan(days: number) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    await this.prisma.notification.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
  }

  /** Get or create default preferences for a user */
  async getPreferences(userId: string) {
    let prefs = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    if (!prefs) {
      prefs = await this.prisma.notificationPreference.create({ data: { userId } });
    }
    return prefs;
  }

  /** Update preferences for a user */
  async updatePreferences(userId: string, data: any) {
    const allowed = [
      'emailOnTaskAssigned', 'emailOnTaskComment', 'emailOnDealCreated',
      'emailOnDealStageChange', 'emailOnDueDate', 'emailOnFollowUp',
      'emailOnPaymentDue', 'emailOnVacation',
    ];
    const update: Record<string, boolean> = {};
    for (const key of allowed) {
      if (data[key] !== undefined) update[key] = Boolean(data[key]);
    }
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...update },
      update,
    });
  }

  /** Check if a user wants a specific email type */
  async wantsEmail(userId: string, prefKey: string): Promise<boolean> {
    const prefs = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    if (!prefs) return true; // Default: all enabled
    return (prefs as any)[prefKey] ?? true;
  }
}
