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
    type: NotificationType,
    title: string,
    body: string,
    entityType?: string,
    entityId?: string,
    href?: string,
  ) {
    const notification = await this.prisma.notification.create({
      data: { userId, type, title, body, entityType, entityId, href },
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
}
