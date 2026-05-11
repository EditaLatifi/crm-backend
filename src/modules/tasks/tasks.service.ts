
import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SupabaseStorageService } from '../documents/supabase-storage.service';
import { EmailService } from '../email/email.service';
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
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private storage: SupabaseStorageService,
    private email: EmailService,
  ) {}

  // ─── Task Documents ───
  async getDocuments(taskId: string) {
    return this.prisma.taskDocument.findMany({
      where: { taskId },
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async uploadDocument(taskId: string, file: Express.Multer.File, category: string | undefined, user: any) {
    const url = await this.storage.uploadFile(`tasks/${taskId}`, file);
    return this.prisma.taskDocument.create({
      data: {
        taskId,
        name: file.originalname,
        url,
        mimeType: file.mimetype,
        size: file.size,
        category: category || null,
        uploadedByUserId: user.userId,
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });
  }

  async deleteDocument(docId: string, user: any) {
    const doc = await this.prisma.taskDocument.findUnique({ where: { id: docId } });
    if (!doc) throw new NotFoundException('Dokument nicht gefunden');
    if (doc.url.includes('supabase.co')) {
      await this.storage.deleteFile(doc.url).catch(() => {});
    }
    await this.prisma.taskDocument.delete({ where: { id: docId } });
    return { deleted: true };
  }
  async updateTask(id: string, body: any, user: any) {
    const { title, description, dueDate, estimate, status, priority, assignedToUserId, accountId, contactId, dealId, phase, specification, assigneeIds, budgetHours } = body;
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
    if (body.projectId !== undefined) data.projectId = body.projectId || null;
    if (phase !== undefined) data.phase = phase || null;
    if (specification !== undefined) data.specification = specification || null;
    if (assigneeIds !== undefined) data.assigneeIds = assigneeIds;
    if (budgetHours !== undefined) data.budgetHours = budgetHours !== null && budgetHours !== '' ? Number(budgetHours) : null;
    if (body.checklists !== undefined) data.checklists = body.checklists;
    if (Object.keys(data).length === 0) return this.prisma.task.findUnique({ where: { id } });
    const oldTask = await this.prisma.task.findUnique({ where: { id }, select: { assignedToUserId: true, title: true, status: true, priority: true, description: true, phase: true, specification: true, checklists: true } });
    const updated = await this.prisma.task.update({ where: { id }, data });
    if (
      oldTask &&
      assignedToUserId &&
      assignedToUserId !== oldTask.assignedToUserId &&
      assignedToUserId !== user?.userId
    ) {
      this.notifications.createForUser(
        assignedToUserId, 'TASK_ASSIGNED',
        'Aufgabe zugewiesen',
        updated.title,
        'Task', id, `/tasks/${id}`,
      ).catch(() => {});
    }
    if (user?.userId && oldTask) {
      const historyEntries: Promise<any>[] = [];
      if (title !== undefined && title !== oldTask.title) {
        historyEntries.push(this.prisma.taskHistory.create({
          data: { taskId: id, action: 'TITLE_CHANGED', payload: { from: oldTask.title, to: title }, userId: user.userId },
        }));
      }
      if (status !== undefined && status !== oldTask.status) {
        historyEntries.push(this.prisma.taskHistory.create({
          data: { taskId: id, action: 'STATUS_CHANGED', payload: { from: oldTask.status, to: status }, userId: user.userId },
        }));
      }
      if (priority !== undefined && priority !== oldTask.priority) {
        historyEntries.push(this.prisma.taskHistory.create({
          data: { taskId: id, action: 'PRIORITY_CHANGED', payload: { from: oldTask.priority, to: priority }, userId: user.userId },
        }));
      }
      if (description !== undefined && description !== (oldTask.description || '')) {
        historyEntries.push(this.prisma.taskHistory.create({
          data: { taskId: id, action: 'DESCRIPTION_CHANGED', payload: {}, userId: user.userId },
        }));
      }
      if (assignedToUserId !== undefined && assignedToUserId !== oldTask.assignedToUserId) {
        const [fromUser, toUser] = await Promise.all([
          oldTask.assignedToUserId ? this.prisma.user.findUnique({ where: { id: oldTask.assignedToUserId }, select: { name: true } }) : Promise.resolve(null),
          assignedToUserId ? this.prisma.user.findUnique({ where: { id: assignedToUserId }, select: { name: true } }) : Promise.resolve(null),
        ]);
        historyEntries.push(this.prisma.taskHistory.create({
          data: { taskId: id, action: 'ASSIGNED', payload: { from: fromUser?.name ?? null, to: toUser?.name ?? null }, userId: user.userId },
        }));
      }
      if (body.checklists !== undefined) {
        historyEntries.push(this.prisma.taskHistory.create({
          data: { taskId: id, action: 'CHECKLIST_UPDATED', payload: {}, userId: user.userId },
        }));
      }
      await Promise.all(historyEntries);
    }
    return updated;
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
      phase,
      specification,
      assigneeIds,
      budgetHours,
    } = body;
    if (!title) throw new Error('Title is required');
    const task = await this.prisma.task.create({
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
        projectId: body.projectId || undefined,
        phase: phase || undefined,
        specification: specification || undefined,
        assigneeIds: assigneeIds || undefined,
        budgetHours: budgetHours ? Number(budgetHours) : undefined,
        createdByUserId,
      },
    });
    if (assignedToUserId && assignedToUserId !== createdByUserId) {
      this.notifications.createForUser(
        assignedToUserId, 'TASK_ASSIGNED',
        'Neue Aufgabe zugewiesen',
        title,
        'Task', task.id, `/tasks/${task.id}`,
      ).catch(() => {});
    }
    await this.prisma.taskHistory.create({
      data: { taskId: task.id, action: 'CREATED', payload: { title }, userId: createdByUserId },
    });

    if (assignedToUserId) {
      const assignee = await this.prisma.user.findUnique({ where: { id: assignedToUserId } });
      const project = task.projectId ? await this.prisma.project.findUnique({ where: { id: task.projectId } }) : null;
      if (assignee?.email) {
        const link = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/tasks/${task.id}`;
        this.email.send({
          to: assignee.email,
          subject: `Neue Aufgabe zugewiesen: ${title}`,
          text: [
            `Dir wurde eine neue Aufgabe zugewiesen.`,
            ``,
            `Aufgabe:     ${title}`,
            project ? `Projekt:     ${project.name}` : '',
            `Fälligkeit:  ${task.dueDate ? task.dueDate.toISOString().slice(0, 10) : '—'}`,
            `Verantwortlich: ${assignee.name}`,
            ``,
            description ? `Beschreibung:\n${description}` : '',
            ``,
            `Link: ${link}`,
          ].filter(Boolean).join('\n'),
          accountId: accountId || null,
          loggedByUserId: createdByUserId,
          entityType: 'Task',
          entityId: task.id,
        }).catch(() => {});
      }
    }
    return task;
  }

  async updateStatus(id: string, status: string, user: any) {
    const old = await this.prisma.task.findUnique({
      where: { id },
      select: { status: true, title: true, assignedToUserId: true, createdByUserId: true, linkedFromPhase: { select: { id: true, status: true } } },
    });
    const updated = await this.prisma.task.update({ where: { id }, data: { status: status as any } });
    if (user?.userId && old && status !== old.status) {
      await this.prisma.taskHistory.create({
        data: { taskId: id, action: 'STATUS_CHANGED', payload: { from: old.status, to: status }, userId: user.userId },
      });
      // Notify assignee and creator about status change
      const STATUS_LABELS: Record<string, string> = { OPEN: 'Offen', IN_PROGRESS: 'In Bearbeitung', DONE: 'Erledigt' };
      const recipients = new Set([old.assignedToUserId, old.createdByUserId].filter(Boolean));
      recipients.delete(user.userId);
      for (const recipientId of recipients) {
        this.notifications.createForUser(
          recipientId!, 'TASK_STATUS_CHANGED',
          'Aufgabe aktualisiert',
          `"${old.title}" ist jetzt: ${STATUS_LABELS[status] || status}`,
          'Task', id, `/tasks/${id}`,
        ).catch(() => {});
      }
    }

    // Sync linked phase
    if (old?.linkedFromPhase) {
      if (status === 'DONE' && old.linkedFromPhase.status !== 'COMPLETED') {
        await this.prisma.projectPhase.update({
          where: { id: old.linkedFromPhase.id },
          data: { status: 'COMPLETED', completedAt: new Date(), completedByUserId: user?.userId || null },
        });
      } else if (status !== 'DONE' && old.linkedFromPhase.status === 'COMPLETED') {
        await this.prisma.projectPhase.update({
          where: { id: old.linkedFromPhase.id },
          data: { status: 'IN_PROGRESS', completedAt: null, completedByUserId: null },
        });
      }
    }

    return updated;
  }

  async updatePriority(id: string, priority: string, user: any) {
    const old = await this.prisma.task.findUnique({ where: { id }, select: { priority: true } });
    const updated = await this.prisma.task.update({ where: { id }, data: { priority: priority as any } });
    if (user?.userId && old && priority !== old.priority) {
      await this.prisma.taskHistory.create({
        data: { taskId: id, action: 'PRIORITY_CHANGED', payload: { from: old.priority, to: priority }, userId: user.userId },
      });
    }
    return updated;
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

  const comment = await this.prisma.comment.create({
    data: { taskId, text, authorId },
    include: { author: true },
  });

  const task = await this.prisma.task.findUnique({
    where: { id: taskId },
    select: { title: true, createdByUserId: true, assignedToUserId: true },
  });
  if (task) {
    const recipients = new Set([task.createdByUserId, task.assignedToUserId].filter(Boolean));
    recipients.delete(authorId);
    for (const recipientId of recipients) {
      this.notifications.createForUser(
        recipientId!, 'TASK_COMMENT',
        'Neuer Kommentar',
        `${comment.author.name} hat auf "${task.title}" kommentiert`,
        'Task', taskId, `/tasks/${taskId}`,
      ).catch(() => {});
    }
  }

  return comment;
}


  async addTimeEntry(taskId: string, body: any, user: any) {
    try {
      const { startedAt, endedAt, description, userId, projectId, phase } = body;
      if (!startedAt || !endedAt) {
        throw new Error('startedAt and endedAt are required');
      }
      const resolvedUserId = (user && user.userId) || userId || 'anonymous';

      // Auto-resolve accountId from body, then task, then project, then any account
      let resolvedAccountId: string | undefined = body.accountId;
      const taskRow = await this.prisma.task.findUnique({
        where: { id: taskId },
        select: { accountId: true, projectId: true },
      });
      if (!resolvedAccountId) resolvedAccountId = taskRow?.accountId || undefined;
      const resolvedProjectId = projectId || taskRow?.projectId || undefined;
      if (!resolvedAccountId && resolvedProjectId) {
        const proj = await this.prisma.project.findUnique({
          where: { id: resolvedProjectId },
          select: { accountId: true },
        });
        resolvedAccountId = proj?.accountId || undefined;
      }
      if (!resolvedAccountId) {
        const fallback = await this.prisma.account.findFirst({ select: { id: true } });
        if (!fallback) throw new Error('Kein Konto verfügbar.');
        resolvedAccountId = fallback.id;
      }

      const start = new Date(startedAt);
      const end = new Date(endedAt);
      if (end.getTime() <= start.getTime()) {
        throw new Error('Endzeit muss nach Startzeit liegen');
      }
      const durationInt = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 60000));
      const entry = await this.prisma.timeEntry.create({
        data: {
          taskId,
          userId: resolvedUserId,
          accountId: resolvedAccountId,
          projectId: resolvedProjectId,
          phase: phase || undefined,
          startedAt: start,
          endedAt: end,
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
          project: { select: { id: true, name: true } },
          account: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true } },
          deal: { select: { id: true, name: true } },
          linkedFromPhase: {
            select: {
              id: true,
              name: true,
              status: true,
              order: true,
              project: { select: { id: true, name: true } },
            },
          },
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

  async findAll(user?: any, assignedToMe = false, page = 1, pageSize = 50, search?: string): Promise<{ data: any[]; total: number; page: number; pageSize: number }> {
    const where: any = {};
    // Mitarbeiter/Extern/USER: only see own/assigned tasks; Admin/Projektleiter see all
    const isRestricted = user?.role && user.role !== 'ADMIN' && user.role !== 'PROJEKTLEITER';
    if ((assignedToMe || isRestricted) && user?.userId) {
      where.OR = [
        { assignedToUserId: user.userId },
        { assigneeIds: { array_contains: [user.userId] } },
        { createdByUserId: user.userId },
      ];
    }
    if (search) {
      const searchFilter = { title: { contains: search, mode: 'insensitive' as const } };
      if (where.OR) {
        where.AND = [{ OR: where.OR }, searchFilter];
        delete where.OR;
      } else {
        Object.assign(where, searchFilter);
      }
    }
    const [data, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        include: {
          assignee: { select: { id: true, name: true, email: true } },
          deal: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
          account: { select: { id: true, name: true } },
        },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.task.count({ where }),
    ]);
    return { data, total, page, pageSize };
  }

  async findById(id: string, _user?: any): Promise<Task> {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }
}
