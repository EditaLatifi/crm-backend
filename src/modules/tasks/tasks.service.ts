
import { Injectable, ForbiddenException, NotFoundException, BadRequestException, HttpException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SupabaseStorageService } from '../documents/supabase-storage.service';
import { EmailService } from '../email/email.service';
import { isManager } from '../../common/access.util';
import { Task, Role } from '@prisma/client';

@Injectable()
export class TasksService {
    async getHistory(taskId: string, user?: any) {
      await this.assertTaskAccess(taskId, user);
      return this.prisma.taskHistory.findMany({
        where: { taskId },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
      });
    }

    async getTimeEntries(taskId: string, user?: any) {
      await this.assertTaskAccess(taskId, user);
      return this.prisma.timeEntry.findMany({
        where: { taskId },
        orderBy: { startedAt: 'desc' },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
    }
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private storage: SupabaseStorageService,
    private email: EmailService,
  ) {}

  // Task access: management sees all; otherwise must be assignee, creator, or an extra assignee.
  private async assertTaskAccess(taskId: string, user: any): Promise<any> {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Task not found');
    if (isManager(user?.role)) return task;
    const extra = Array.isArray(task.assigneeIds) ? (task.assigneeIds as any[]) : [];
    const allowed =
      task.assignedToUserId === user?.userId ||
      task.createdByUserId === user?.userId ||
      extra.includes(user?.userId);
    if (!allowed) throw new ForbiddenException('Access denied');
    return task;
  }

  // ─── Task Documents ───
  async getDocuments(taskId: string, user?: any) {
    await this.assertTaskAccess(taskId, user);
    return this.prisma.taskDocument.findMany({
      where: { taskId },
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async uploadDocument(taskId: string, file: Express.Multer.File, category: string | undefined, user: any) {
    await this.assertTaskAccess(taskId, user);
    if (!file) throw new BadRequestException('Keine Datei hochgeladen');
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
    await this.assertTaskAccess(doc.taskId, user);
    if (doc.url.includes('supabase.co')) {
      await this.storage.deleteFile(doc.url).catch(() => {});
    }
    await this.prisma.taskDocument.delete({ where: { id: docId } });
    return { deleted: true };
  }
  // Resolve the primary phase link. When a ProjectPhase is selected, mirror its code into
  // the denormalized `phase` string so existing badges/grouping keep working unchanged.
  private async resolvePhaseCode(projectPhaseId?: string | null): Promise<string | null> {
    if (!projectPhaseId) return null;
    const pp = await this.prisma.projectPhase.findUnique({ where: { id: projectPhaseId }, select: { code: true } });
    return pp?.code ?? null;
  }

  async updateTask(id: string, body: any, user: any) {
    await this.assertTaskAccess(id, user);
    const { title, description, dueDate, estimate, status, priority, assignedToUserId, accountId, contactId, dealId, phase, specification, assigneeIds, budgetHours, projectPhaseId, isPaymentReminder } = body;
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
    if (projectPhaseId !== undefined) {
      data.projectPhaseId = projectPhaseId || null;
      // Keep the denormalized phase code in sync with the linked phase.
      data.phase = await this.resolvePhaseCode(projectPhaseId);
    } else if (phase !== undefined) {
      data.phase = phase || null;
    }
    if (isPaymentReminder !== undefined) data.isPaymentReminder = !!isPaymentReminder;
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

    // Auto-complete task when all checklist items are done
    if (body.checklists !== undefined && updated.status !== 'DONE') {
      const checklists = body.checklists as any[];
      if (Array.isArray(checklists) && checklists.length > 0) {
        const allItems = checklists.flatMap((cl: any) => cl.items || []);
        if (allItems.length > 0 && allItems.every((item: any) => item.done)) {
          await this.prisma.task.update({ where: { id }, data: { status: 'DONE' } });
          (updated as any).status = 'DONE';
          await this.prisma.taskHistory.create({
            data: { taskId: id, action: 'STATUS_CHANGED', payload: { from: oldTask?.status, to: 'DONE', reason: 'Alle Checklisten-Punkte erledigt' }, userId: user.userId },
          });
        }
      }
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
      projectPhaseId,
      isPaymentReminder,
    } = body;
    if (!title) throw new BadRequestException('Title is required');
    // When a ProjectPhase is linked, mirror its code into `phase`; otherwise keep the raw SIA code.
    const mirroredPhase = projectPhaseId ? await this.resolvePhaseCode(projectPhaseId) : (phase || undefined);
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
        projectPhaseId: projectPhaseId || undefined,
        phase: mirroredPhase || undefined,
        specification: specification || undefined,
        assigneeIds: assigneeIds || undefined,
        budgetHours: budgetHours ? Number(budgetHours) : undefined,
        isPaymentReminder: !!isPaymentReminder,
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
    // Also notify creator (confirmation)
    this.notifications.createForUser(
      createdByUserId, 'TASK_ASSIGNED',
      'Aufgabe erstellt',
      `Du hast die Aufgabe "${title}" erstellt`,
      'Task', task.id, `/tasks/${task.id}`,
    ).catch(() => {});
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
    await this.assertTaskAccess(id, user);
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
    await this.assertTaskAccess(id, user);
    const old = await this.prisma.task.findUnique({ where: { id }, select: { priority: true } });
    const updated = await this.prisma.task.update({ where: { id }, data: { priority: priority as any } });
    if (user?.userId && old && priority !== old.priority) {
      await this.prisma.taskHistory.create({
        data: { taskId: id, action: 'PRIORITY_CHANGED', payload: { from: old.priority, to: priority }, userId: user.userId },
      });
    }
    return updated;
  }

  async getComments(taskId: string, user?: any) {
    await this.assertTaskAccess(taskId, user);
    return this.prisma.comment.findMany({
      where: { taskId },
      include: { author: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

async addComment(taskId: string, text: string, user: any) {
  const authorId = user?.userId || user?.id || user?.sub;
  if (!authorId) throw new Error('Authentication required to add a comment');

  const comment = await this.prisma.comment.create({
    data: { taskId, text, authorId },
    include: { author: { select: { id: true, name: true, email: true } } },
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
      const { startedAt, endedAt, description, userId, projectId, phase, projectPhaseId } = body;
      if (!startedAt || !endedAt) {
        throw new BadRequestException('startedAt and endedAt are required');
      }
      const resolvedUserId = (user && user.userId) || userId || 'anonymous';

      // Auto-resolve accountId from body, then task, then project, then any account
      let resolvedAccountId: string | undefined = body.accountId;
      const taskRow = await this.prisma.task.findUnique({
        where: { id: taskId },
        select: { accountId: true, projectId: true, projectPhaseId: true, phase: true },
      });
      if (!resolvedAccountId) resolvedAccountId = taskRow?.accountId || undefined;
      const resolvedProjectId = projectId || taskRow?.projectId || undefined;
      // Link the entry to the task's project phase so it counts toward that phase's Kontingent.
      const resolvedProjectPhaseId = projectPhaseId || taskRow?.projectPhaseId || undefined;
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
        throw new BadRequestException('Endzeit muss nach Startzeit liegen');
      }
      const durationInt = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 60000));
      const entry = await this.prisma.timeEntry.create({
        data: {
          taskId,
          userId: resolvedUserId,
          accountId: resolvedAccountId,
          projectId: resolvedProjectId,
          projectPhaseId: resolvedProjectPhaseId,
          phase: phase || taskRow?.phase || undefined,
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
      if (e instanceof HttpException) throw e;
      throw new Error('Failed to add time entry: ' + (typeof e === 'object' && e !== null && 'message' in e ? (e as any).message : String(e)));
    }
  }

  async findByIdWithDetails(id: string, user: any) {
    try {
      const task = await this.prisma.task.findUnique({
        where: { id },
        include: {
          comments: { include: { author: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'desc' } },
          history: { include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'desc' } },
          timeEntries: { include: { user: { select: { id: true, name: true, email: true } }, account: true, task: true } },
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
      const extra = Array.isArray(task.assigneeIds) ? (task.assigneeIds as any[]) : [];
      if (!isManager(user.role) && task.assignedToUserId !== user.userId && task.createdByUserId !== user.userId && !extra.includes(user.userId)) {
        throw new ForbiddenException('Access denied');
      }
      return task;
    } catch (e) {
      // Preserve real HTTP errors (404/403); only wrap unexpected failures.
      if (e instanceof HttpException) throw e;
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
