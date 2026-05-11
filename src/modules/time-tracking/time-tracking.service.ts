
import { RunningTimer, TimeEntry, Role } from '@prisma/client';
import { Injectable, BadRequestException } from '@nestjs/common';
import { forbidden, notFound } from '../../common/error/error.response';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class TimeTrackingService {
  constructor(private prisma: PrismaService) {}

  async startTimer(user: any, accountId: string, taskId?: string, description?: string, projectId?: string, projectPhaseId?: string): Promise<RunningTimer> {
    const existing = await this.prisma.runningTimer.findUnique({ where: { userId: user.userId } });
    if (existing) throw new BadRequestException('Ein Timer läuft bereits. Stoppe ihn zuerst.');
    return this.prisma.runningTimer.create({
      data: {
        userId: user.userId,
        accountId,
        taskId: taskId || null,
        description: description || null,
        projectId: projectId || null,
        projectPhaseId: projectPhaseId || null,
        startedAt: new Date(),
      },
      include: { account: true, task: true },
    });
  }

  async getTimerStatus(user: any): Promise<{ running: boolean; elapsedSeconds?: number; startedAt?: Date; accountId?: string; taskId?: string | null; description?: string | null; accountName?: string; taskTitle?: string | null }> {
    const runningTimer = await this.prisma.runningTimer.findUnique({
      where: { userId: user.userId },
      include: { account: true, task: true },
    });
    if (!runningTimer) return { running: false };
    const elapsedSeconds = Math.floor((Date.now() - new Date(runningTimer.startedAt).getTime()) / 1000);
    return {
      running: true,
      startedAt: runningTimer.startedAt,
      elapsedSeconds,
      accountId: runningTimer.accountId,
      taskId: runningTimer.taskId,
      description: runningTimer.description,
      accountName: (runningTimer as any).account?.name,
      taskTitle: (runningTimer as any).task?.title,
    };
  }

  async stopTimer(user: any): Promise<{ timeEntry: TimeEntry }> {
    // 1. Read running timer
    const runningTimer = await this.prisma.runningTimer.findUnique({ where: { userId: user.userId } });
    if (!runningTimer) throw forbidden('No running timer found');

    // 2. Calculate duration
    const endedAt = new Date();
    const startedAt = runningTimer.startedAt;
    const durationMinutes = Math.max(1, Math.floor((endedAt.getTime() - startedAt.getTime()) / 60000));

    // 3. Atomic transaction: delete running timer, create time entry, log activity
    const [_, timeEntry, __] = await this.prisma.$transaction([
      this.prisma.runningTimer.delete({ where: { userId: user.userId } }),
      this.prisma.timeEntry.create({
        data: {
          userId: user.userId,
          accountId: runningTimer.accountId,
          taskId: runningTimer.taskId,
          projectId: (runningTimer as any).projectId || null,
          projectPhaseId: (runningTimer as any).projectPhaseId || null,
          startedAt,
          endedAt,
          durationMinutes,
          description: runningTimer.description || undefined,
        },
      }),
      this.prisma.activity.create({
        data: {
          actorUserId: user.userId,
          entityType: 'TimeEntry',
          entityId: runningTimer.id,
          action: 'timer_stop',
          payloadJson: {
            startedAt,
            endedAt,
            durationMinutes,
            accountId: runningTimer.accountId,
            taskId: runningTimer.taskId,
          },
        },
      }),
    ]);
    return { timeEntry };
  }

  async manualEntry(
    user: any,
    body: {
      projectId?: string;
      accountId?: string;
      projectPhaseId?: string;
      taskId?: string;
      hours?: number;
      durationMinutes?: number;
      date?: string;
      description?: string;
      employeeUserId?: string;
    },
  ): Promise<TimeEntry> {
    const userId = body.employeeUserId && user.role === Role.ADMIN ? body.employeeUserId : user.userId;

    let accountId = body.accountId;
    let projectId = body.projectId;
    if (body.taskId) {
      const t = await this.prisma.task.findUnique({
        where: { id: body.taskId },
        select: { accountId: true, projectId: true },
      });
      if (t) {
        accountId = accountId || t.accountId || undefined;
        projectId = projectId || t.projectId || undefined;
      }
    }
    if (!accountId && projectId) {
      const proj = await this.prisma.project.findUnique({ where: { id: projectId }, select: { accountId: true } });
      accountId = proj?.accountId || undefined;
    }
    if (!accountId) {
      const fallback = await this.prisma.account.findFirst({ select: { id: true } });
      if (!fallback) throw new BadRequestException('Kein Konto verfügbar.');
      accountId = fallback.id;
    }

    const minutes = body.durationMinutes ?? Math.round((body.hours || 0) * 60);
    if (!minutes || minutes < 1) throw new BadRequestException('Stunden sind erforderlich.');
    if (minutes > 840) throw new BadRequestException('Maximale Erfassung pro Eintrag: 14 Stunden.');
    if (minutes > 600) {
      // Warning threshold: 10h = 600min — logged but allowed
      console.warn(`[TimeTracking] Hohe Stundenerfassung: ${minutes} Minuten (${(minutes / 60).toFixed(1)}h) für User ${userId}`);
    }

    const startedAt = body.date ? new Date(body.date) : new Date();
    startedAt.setHours(9, 0, 0, 0);
    const endedAt = new Date(startedAt.getTime() + minutes * 60000);

    return this.prisma.timeEntry.create({
      data: {
        userId,
        accountId,
        projectId: projectId || null,
        projectPhaseId: body.projectPhaseId || null,
        taskId: body.taskId || null,
        startedAt,
        endedAt,
        durationMinutes: minutes,
        description: body.description || null,
      },
      include: {
        user: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        projectPhase: { select: { id: true, name: true } },
      },
    });
  }

  async discardTimer(user: any): Promise<{ discarded: boolean }> {
    const runningTimer = await this.prisma.runningTimer.findUnique({ where: { userId: user.userId } });
    if (!runningTimer) return { discarded: false };
    await this.prisma.runningTimer.delete({ where: { userId: user.userId } });
    return { discarded: true };
  }

  async findAll(
    user: any,
    filters: { userId?: string; from?: string; to?: string; accountId?: string; projectId?: string } = {},
    page = 1,
    pageSize = 1000,
  ): Promise<TimeEntry[]> {
    const include = {
      user: true,
      account: true,
      task: true,
      project: true,
      projectPhase: { select: { id: true, name: true, order: true } },
    };
    const where: any = {};

    // Role-based base filter
    if (user && user.role && user.role !== Role.ADMIN) {
      where.userId = user.userId;
    }

    // Additional filters
    if (filters.userId) where.userId = filters.userId;
    if (filters.accountId) where.accountId = filters.accountId;
    if (filters.projectId) where.projectId = filters.projectId;
    if (filters.from || filters.to) {
      where.startedAt = {};
      if (filters.from) where.startedAt.gte = new Date(filters.from);
      if (filters.to) {
        const toDate = new Date(filters.to);
        toDate.setHours(23, 59, 59, 999);
        where.startedAt.lte = toDate;
      }
    }

    return this.prisma.timeEntry.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      include,
    });
  }

  async getOverview(user: any, filters: { from?: string; to?: string; userId?: string } = {}) {
    const where: any = {};
    if (user.role !== Role.ADMIN) {
      where.userId = user.userId;
    } else if (filters.userId) {
      where.userId = filters.userId;
    }
    if (filters.from || filters.to) {
      where.startedAt = {};
      if (filters.from) where.startedAt.gte = new Date(filters.from);
      if (filters.to) {
        const t = new Date(filters.to);
        t.setHours(23, 59, 59, 999);
        where.startedAt.lte = t;
      }
    }
    const entries = await this.prisma.timeEntry.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        projectPhase: { select: { id: true, name: true, order: true } },
      },
    });

    const totalMinutes = entries.reduce((s, e) => s + e.durationMinutes, 0);

    const byProject: Record<string, { id: string; name: string; minutes: number; entries: number }> = {};
    const byEmployee: Record<string, { id: string; name: string; minutes: number; entries: number }> = {};
    const byPhase: Record<string, { id: string; name: string; project: string; minutes: number; entries: number }> = {};

    for (const e of entries) {
      const pid = e.projectId || 'no-project';
      const pname = e.project?.name || 'Ohne Projekt';
      if (!byProject[pid]) byProject[pid] = { id: pid, name: pname, minutes: 0, entries: 0 };
      byProject[pid].minutes += e.durationMinutes;
      byProject[pid].entries += 1;

      const uid = e.userId;
      const uname = e.user?.name || '—';
      if (!byEmployee[uid]) byEmployee[uid] = { id: uid, name: uname, minutes: 0, entries: 0 };
      byEmployee[uid].minutes += e.durationMinutes;
      byEmployee[uid].entries += 1;

      if (e.projectPhase) {
        const ph = e.projectPhase.id;
        if (!byPhase[ph]) byPhase[ph] = {
          id: ph, name: e.projectPhase.name, project: e.project?.name || '—', minutes: 0, entries: 0,
        };
        byPhase[ph].minutes += e.durationMinutes;
        byPhase[ph].entries += 1;
      }
    }

    return {
      totalMinutes,
      totalEntries: entries.length,
      byProject: Object.values(byProject).sort((a, b) => b.minutes - a.minutes),
      byEmployee: Object.values(byEmployee).sort((a, b) => b.minutes - a.minutes),
      byPhase: Object.values(byPhase).sort((a, b) => b.minutes - a.minutes),
    };
  }

  async findById(id: string, user: any): Promise<TimeEntry> {
    const entry = await this.prisma.timeEntry.findUnique({
      where: { id },
      include: { user: true, account: true, task: true, project: true },
    });
    if (!entry) throw notFound('Time entry not found');
    if (!user || !user.role) {
      return entry;
    }
    if (user.role !== Role.ADMIN && entry.userId !== user.userId) {
      throw forbidden('Access denied');
    }
    return entry;
  }
}
