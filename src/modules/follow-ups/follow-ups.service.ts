import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class FollowUpsService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: {
    entityType?: string;
    entityId?: string;
    assignedToUserId?: string;
    completed?: boolean;
    dueBefore?: string;
    dueAfter?: string;
  }) {
    const where: any = {};

    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.entityId) where.entityId = filters.entityId;
    if (filters.assignedToUserId) where.assignedToUserId = filters.assignedToUserId;
    if (filters.completed !== undefined) where.completed = filters.completed;

    if (filters.dueBefore || filters.dueAfter) {
      where.dueDate = {};
      if (filters.dueBefore) where.dueDate.lte = new Date(filters.dueBefore);
      if (filters.dueAfter) where.dueDate.gte = new Date(filters.dueAfter);
    }

    return this.prisma.followUp.findMany({
      where,
      include: {
        assignedTo: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  async findOne(id: string) {
    const followUp = await this.prisma.followUp.findUnique({
      where: { id },
      include: {
        assignedTo: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
    if (!followUp) throw new NotFoundException('Follow-Up nicht gefunden');
    return followUp;
  }

  async create(data: {
    entityType: string;
    entityId: string;
    title: string;
    description?: string;
    dueDate: string;
    assignedToUserId?: string;
    createdByUserId: string;
  }) {
    return this.prisma.followUp.create({
      data: {
        entityType: data.entityType,
        entityId: data.entityId,
        title: data.title,
        description: data.description,
        dueDate: new Date(data.dueDate),
        assignedToUserId: data.assignedToUserId || null,
        createdByUserId: data.createdByUserId,
      },
      include: {
        assignedTo: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  async update(id: string, data: {
    title?: string;
    description?: string;
    dueDate?: string;
    assignedToUserId?: string | null;
    completed?: boolean;
  }) {
    await this.findOne(id);
    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.dueDate !== undefined) updateData.dueDate = new Date(data.dueDate);
    if (data.assignedToUserId !== undefined) updateData.assignedToUserId = data.assignedToUserId;
    if (data.completed !== undefined) {
      updateData.completed = data.completed;
      updateData.completedAt = data.completed ? new Date() : null;
    }

    return this.prisma.followUp.update({
      where: { id },
      data: updateData,
      include: {
        assignedTo: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.followUp.delete({ where: { id } });
  }

  async getUpcoming(userId: string, days = 7) {
    const now = new Date();
    const until = new Date();
    until.setDate(until.getDate() + days);

    return this.prisma.followUp.findMany({
      where: {
        completed: false,
        dueDate: { gte: now, lte: until },
        OR: [
          { assignedToUserId: userId },
          { createdByUserId: userId },
        ],
      },
      include: {
        assignedTo: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: 'asc' },
    });
  }
}
