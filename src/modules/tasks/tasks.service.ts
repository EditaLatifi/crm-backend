
import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Task, Role } from '@prisma/client';

@Injectable()
export class TasksService {
    async getHistory(taskId: string) {
      try {
        return await this.prisma.taskHistory.findMany({
          where: { taskId },
          include: { user: true },
          orderBy: { createdAt: 'desc' },
        });
      } catch (e) {
        throw new Error('Failed to fetch task history');
      }
    }

    async getTimeEntries(taskId: string) {
      try {
        return await this.prisma.timeEntry.findMany({
          where: { taskId },
          orderBy: { startedAt: 'desc' },
          include: { user: true },
        });
      } catch (e) {
        throw new Error('Failed to fetch time entries');
      }
    }
  constructor(private prisma: PrismaService) {}
  async updateTask(id: string, body: any, user: any) {
    const { title, description, dueDate, estimate, status, priority, assignedToUserId, accountId, contactId, dealId } = body;
    const data: any = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
    if (estimate !== undefined) data.estimate = estimate !== '' ? Number(estimate) : null;
    if (status !== undefined) data.status = status;
    if (priority !== undefined) data.priority = priority;
    if (assignedToUserId !== undefined) data.assignedToUserId = assignedToUserId || null;
    if (accountId !== undefined) data.accountId = accountId || null;
    if (contactId !== undefined) data.contactId = contactId || null;
    if (dealId !== undefined) data.dealId = dealId || null;
    if (Object.keys(data).length === 0) return this.prisma.task.findUnique({ where: { id } });
    return this.prisma.task.update({ where: { id }, data });
  }
  
  async createTask(body: any, user: any) {
    if (!user?.userId) throw new ForbiddenException('Authentication required');
    const createdByUserId = user.userId;
    const {
      title,
      description,
      status = 'OPEN',
      priority = 'LOW',
      dueDate,
      assignedToUserId,
      accountId,
      contactId,
      dealId,
    } = body;
    if (!title) throw new Error('Title is required');
    return this.prisma.task.create({
      data: {
        title,
        description,
        status,
        priority,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        assignedToUserId: assignedToUserId || undefined,
        accountId: accountId || undefined,
        contactId: contactId || undefined,
        dealId: dealId || undefined,
        createdByUserId,
      },
    });
  }

  async updateStatus(id: string, status: string, user: any) {
    // Optionally: check permissions here
    // Cast status to TaskStatus enum
    return this.prisma.task.update({
      where: { id },
      data: { status: status as any },
    });
  }

  async updatePriority(id: string, priority: string, user: any) {
    return this.prisma.task.update({
      where: { id },
      data: { priority: priority as any },
    });
  }

  async getComments(taskId: string) {
    try {
      return await this.prisma.comment.findMany({
        where: { taskId },
        include: { author: true },
        orderBy: { createdAt: 'desc' },
      });
    } catch (e) {
      throw new Error('Failed to fetch comments');
    }
  }

async addComment(taskId: string, text: string, user: any) {
  const authorId = user?.userId || user?.id || user?.sub;
  if (!authorId) throw new Error('Authentication required to add a comment');

  return this.prisma.comment.create({
    data: { taskId, text, authorId },
    include: { author: true },
  });
}


  async addTimeEntry(taskId: string, body: any, user: any) {
    try {
      // Allow unauthenticated: fallback to userId from body or 'anonymous'
      const { startedAt, endedAt, durationMinutes, description, accountId, userId } = body;
      if (!accountId) {
        throw new Error('accountId is required to add a time entry');
      }
      const resolvedUserId = (user && user.userId) || userId || 'anonymous';
      // Ensure durationMinutes is an integer
      const durationInt = typeof durationMinutes === 'string' ? parseInt(durationMinutes, 10) : durationMinutes;
      if (isNaN(durationInt)) {
        throw new Error('durationMinutes must be a number');
      }
      const entry = await this.prisma.timeEntry.create({
        data: {
          taskId,
          userId: resolvedUserId,
          accountId,
          startedAt: new Date(startedAt),
          endedAt: new Date(endedAt),
          durationMinutes: durationInt,
          description,
        },
      });
      await this.prisma.taskHistory.create({
        data: {
          taskId,
          action: 'TIME_LOGGED',
          payload: { durationMinutes: durationInt, description },
          userId: resolvedUserId,
        },
      });
      return entry;
    } catch (e: any) {
      throw new Error('Failed to add time entry: ' + (typeof e === 'object' && e !== null && 'message' in e ? (e as any).message : String(e)));
    }
  }

  async findByIdWithDetails(id: string, user: any) {
    try {
      const task = await this.prisma.task.findUnique({
        where: { id },
        include: {
          comments: { include: { author: true }, orderBy: { createdAt: 'desc' } },
          history: { include: { user: true }, orderBy: { createdAt: 'desc' } },
          timeEntries: { include: { user: true, account: true, task: true } },
        },
      });
      if (!task) throw new NotFoundException('Task not found');
      if (!user || !user.role) {
        return task;
      }
      if (user.role !== Role.ADMIN && task.assignedToUserId !== user.userId && task.createdByUserId !== user.userId) {
        throw new ForbiddenException('Access denied');
      }
      return task;
    } catch (e) {
      throw new Error('Failed to fetch task details');
    }
  }

  async findAll(_user?: any): Promise<any[]> {
    return this.prisma.task.findMany({
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string, _user?: any): Promise<Task> {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }
}
