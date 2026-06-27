
import { RunningTimer, TimeEntry, Role } from '@prisma/client';
import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { forbidden, notFound } from '../../common/error/error.response';
import { PrismaService } from '../../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { isManager } from '../../common/access.util';

@Injectable()
export class TimeTrackingService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // Booking time requires access to the target project: management, owner/creator, or a member.
  private async assertProjectAccess(projectId: string | undefined | null, user: any): Promise<void> {
    if (!projectId) return;
    if (isManager(user?.role)) return;
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerUserId: true, createdByUserId: true, members: { select: { userId: true } } },
    });
    if (!project) return; // a bad id is handled downstream; don't leak existence here
    const allowed =
      project.ownerUserId === user?.userId ||
      project.createdByUserId === user?.userId ||
      project.members.some((m) => m.userId === user?.userId);
    if (!allowed) throw new ForbiddenException('Kein Zugriff auf dieses Projekt');
  }

  // ── Phase is the single time carrier ────────────────────────────────────────────────
  // Resolve the MAIN project phase a time entry must attach to.
  // - sub-phase -> its parent main phase
  // - no phase given -> the project's "Allgemein" catch-all main phase (auto-created if missing)
  // - project derived from the task when only a task is given
  private async resolveTimePhase(opts: { projectId?: string; projectPhaseId?: string; taskId?: string }): Promise<{ projectId: string; projectPhaseId: string; accountId: string }> {
    let projectId = opts.projectId || undefined;
    let projectPhaseId = opts.projectPhaseId || undefined;
    if ((!projectId || !projectPhaseId) && opts.taskId) {
      const t = await this.prisma.task.findUnique({ where: { id: opts.taskId }, select: { projectId: true, projectPhaseId: true } });
      projectId = projectId || t?.projectId || undefined;
      if (!projectPhaseId) projectPhaseId = t?.projectPhaseId || undefined;
    }
    if (projectPhaseId) {
      const ph = await this.prisma.projectPhase.findUnique({ where: { id: projectPhaseId }, select: { id: true, parentPhaseId: true, projectId: true } });
      if (ph) {
        projectId = projectId || ph.projectId;
        projectPhaseId = ph.parentPhaseId || ph.id; // always store the MAIN phase
      } else {
        projectPhaseId = undefined;
      }
    }
    if (!projectId) throw new BadRequestException('Projekt ist erforderlich, um Zeit zu erfassen.');
    if (!projectPhaseId) {
      // Auto-create / reuse an "Allgemein" catch-all main phase so time entry is never blocked.
      let allg = await this.prisma.projectPhase.findFirst({ where: { projectId, parentPhaseId: null, name: 'Allgemein' }, select: { id: true } });
      if (!allg) {
        const order = await this.prisma.projectPhase.count({ where: { projectId } });
        allg = await this.prisma.projectPhase.create({ data: { projectId, name: 'Allgemein', order, status: 'PENDING' }, select: { id: true } });
      }
      projectPhaseId = allg.id;
    }
    const proj = await this.prisma.project.findUnique({ where: { id: projectId }, select: { accountId: true } });
    let accountId = proj?.accountId || undefined;
    if (!accountId) {
      const fb = await this.prisma.account.findFirst({ select: { id: true } });
      if (!fb) throw new BadRequestException('Kein Konto verfügbar.');
      accountId = fb.id;
    }
    return { projectId, projectPhaseId, accountId };
  }

  // The ONE writer of TimeEntry. Resolves the main phase, runs the single Kontingent check
  // (Mehrkosten excluded), and creates the row. Every entry point delegates here.
  private async createPhaseTimeEntry(input: {
    userId: string; actingUser: any;
    projectId?: string; projectPhaseId?: string; taskId?: string;
    durationMinutes: number; startedAt: Date; endedAt: Date;
    description?: string | null; isBillableExtra?: boolean; overBudgetReason?: string;
  }): Promise<{ entry: any; kontingentWarning: string | null; overBudget: boolean; projectPhaseId: string }> {
    const { projectId, projectPhaseId, accountId } = await this.resolveTimePhase({ projectId: input.projectId, projectPhaseId: input.projectPhaseId, taskId: input.taskId });
    const minutes = input.durationMinutes;
    const isExtra = !!input.isBillableExtra;

    let kontingentWarning: string | null = null;
    let overBudget = false;
    if (!isExtra) {
      const phase = await this.prisma.projectPhase.findUnique({
        where: { id: projectPhaseId },
        include: {
          timeEntries: { select: { durationMinutes: true, isBillableExtra: true } },
          children: { select: { timeEntries: { select: { durationMinutes: true, isBillableExtra: true } } } },
        },
      });
      if (phase?.budgetHours && phase.budgetHours > 0) {
        const all = [...phase.timeEntries, ...phase.children.flatMap((c) => c.timeEntries)].filter((e) => !e.isBillableExtra);
        const usedHours = all.reduce((s, e) => s + e.durationMinutes, 0) / 60;
        const afterBooking = usedHours + minutes / 60;
        const pct = (afterBooking / phase.budgetHours) * 100;
        if (afterBooking > phase.budgetHours) {
          overBudget = true;
          if (!input.overBudgetReason || !input.overBudgetReason.trim()) {
            throw new BadRequestException('Begründung für Budgetüberschreitung erforderlich.');
          }
          kontingentWarning = `Kontingent überschritten (${afterBooking.toFixed(1)}h / ${phase.budgetHours}h)`;
          const proj = await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, ownerUserId: true } });
          if (proj?.ownerUserId && proj.ownerUserId !== input.userId) {
            this.notifications.createForUser(proj.ownerUserId, 'BUDGET_WARNING', 'Kontingent überschritten', `Buchung in "${proj.name}": ${afterBooking.toFixed(1)}h / ${phase.budgetHours}h`, 'Project', proj.id, `/projects/${proj.id}`).catch(() => {});
          }
        } else if (pct >= 80) {
          kontingentWarning = `${pct.toFixed(0)}% des Kontingents verbraucht (${afterBooking.toFixed(1)}h / ${phase.budgetHours}h)`;
        }
      }
    }

    const entry = await this.prisma.timeEntry.create({
      data: {
        userId: input.userId,
        accountId,
        projectId,
        projectPhaseId,
        taskId: input.taskId || null,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        durationMinutes: minutes,
        description: input.description || null,
        isBillableExtra: isExtra,
        overBudgetReason: overBudget ? input.overBudgetReason!.trim() : null,
      },
      include: {
        user: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        projectPhase: { select: { id: true, name: true } },
      },
    });
    return { entry, kontingentWarning, overBudget, projectPhaseId };
  }

  async startTimer(user: any, accountId: string, taskId?: string, description?: string, projectId?: string, projectPhaseId?: string, isBillableExtra?: boolean): Promise<RunningTimer> {
    await this.assertProjectAccess(projectId, user);
    const existing = await this.prisma.runningTimer.findUnique({ where: { userId: user.userId } });
    if (existing) throw new BadRequestException('Ein Timer läuft bereits. Stoppe ihn zuerst.');
    // Resolve to the MAIN phase up front so the booking on stop is always phase-attributed.
    let resolvedProjectId = projectId || undefined;
    let resolvedPhaseId = projectPhaseId || undefined;
    let resolvedAccountId = accountId;
    if (projectId || projectPhaseId || taskId) {
      const r = await this.resolveTimePhase({ projectId, projectPhaseId, taskId });
      resolvedProjectId = r.projectId;
      resolvedPhaseId = r.projectPhaseId;
      resolvedAccountId = accountId || r.accountId;
    }
    return this.prisma.runningTimer.create({
      data: {
        userId: user.userId,
        accountId: resolvedAccountId,
        taskId: taskId || null,
        description: description || null,
        projectId: resolvedProjectId || null,
        projectPhaseId: resolvedPhaseId || null,
        startedAt: new Date(),
        isBillableExtra: !!isBillableExtra,
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

  async stopTimer(user: any, overBudgetReasonInput?: string): Promise<{ timeEntry: TimeEntry; kontingentWarning?: string; overBudget?: boolean }> {
    const runningTimer = await this.prisma.runningTimer.findUnique({ where: { userId: user.userId } });
    if (!runningTimer) throw forbidden('No running timer found');

    const endedAt = new Date();
    const startedAt = runningTimer.startedAt;
    const durationMinutes = Math.max(1, Math.floor((endedAt.getTime() - startedAt.getTime()) / 60000));

    // Delegate to the single phase-keyed writer (resolves main phase, one Kontingent check).
    const { entry, kontingentWarning, overBudget, projectPhaseId } = await this.createPhaseTimeEntry({
      userId: user.userId,
      actingUser: user,
      projectId: (runningTimer as any).projectId || undefined,
      projectPhaseId: (runningTimer as any).projectPhaseId || undefined,
      taskId: runningTimer.taskId || undefined,
      durationMinutes,
      startedAt,
      endedAt,
      description: runningTimer.description || undefined,
      isBillableExtra: runningTimer.isBillableExtra || false,
      overBudgetReason: overBudgetReasonInput,
    });

    await this.prisma.$transaction([
      this.prisma.runningTimer.delete({ where: { userId: user.userId } }),
      this.prisma.activity.create({
        data: {
          actorUserId: user.userId,
          entityType: 'TimeEntry',
          entityId: entry.id,
          action: 'timer_stop',
          payloadJson: { startedAt, endedAt, durationMinutes, accountId: entry.accountId, projectPhaseId, taskId: runningTimer.taskId, overBudget },
        },
      }),
    ]);
    return {
      timeEntry: entry,
      ...(kontingentWarning ? { kontingentWarning } : {}),
      ...(overBudget ? { overBudget: true } : {}),
    };
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
      startedAt?: string | Date;
      endedAt?: string | Date;
      date?: string;
      description?: string;
      employeeUserId?: string;
      overBudgetReason?: string;
      isBillableExtra?: boolean;
    },
  ): Promise<TimeEntry> {
    const userId = body.employeeUserId && user.role === Role.ADMIN ? body.employeeUserId : user.userId;

    // Resolve project from task if needed, then verify access.
    let projectId = body.projectId;
    if (!projectId && body.taskId) {
      const t = await this.prisma.task.findUnique({ where: { id: body.taskId }, select: { projectId: true } });
      projectId = t?.projectId || undefined;
    }
    await this.assertProjectAccess(projectId, user);

    // Accept every input shape: explicit durationMinutes, decimal hours, OR a start..end window.
    let minutes = body.durationMinutes ?? (body.hours != null ? Math.round(body.hours * 60) : undefined);
    let startedAt: Date;
    let endedAt: Date;
    if (minutes == null && body.startedAt && body.endedAt) {
      startedAt = new Date(body.startedAt);
      endedAt = new Date(body.endedAt);
      minutes = Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000));
    } else {
      if (!minutes || minutes < 1) throw new BadRequestException('Stunden sind erforderlich.');
      startedAt = body.date ? new Date(body.date) : new Date();
      startedAt.setHours(9, 0, 0, 0);
      endedAt = new Date(startedAt.getTime() + minutes * 60000);
    }
    if (!minutes || minutes < 1) throw new BadRequestException('Stunden sind erforderlich.');
    if (minutes > 840) throw new BadRequestException('Maximale Erfassung pro Eintrag: 14 Stunden.');

    // Delegate to the single phase-keyed writer.
    const { entry, kontingentWarning, overBudget } = await this.createPhaseTimeEntry({
      userId,
      actingUser: user,
      projectId,
      projectPhaseId: body.projectPhaseId,
      taskId: body.taskId,
      durationMinutes: minutes,
      startedAt,
      endedAt,
      description: body.description,
      isBillableExtra: body.isBillableExtra,
      overBudgetReason: body.overBudgetReason,
    });
    if (kontingentWarning || overBudget) {
      return { ...entry, ...(kontingentWarning ? { kontingentWarning } : {}), ...(overBudget ? { overBudget: true } : {}) } as any;
    }
    return entry;
  }

  // Public entry used by other modules (e.g. task time tab) — same single writer.
  async logTime(user: any, input: {
    userId?: string; projectId?: string; projectPhaseId?: string; taskId?: string;
    durationMinutes?: number; hours?: number; startedAt?: string | Date; endedAt?: string | Date; date?: string;
    description?: string | null; isBillableExtra?: boolean; overBudgetReason?: string;
  }): Promise<any> {
    const userId = input.userId || user.userId;
    let minutes = input.durationMinutes ?? (input.hours != null ? Math.round(input.hours * 60) : undefined);
    let startedAt: Date;
    let endedAt: Date;
    if (input.startedAt && input.endedAt) {
      startedAt = new Date(input.startedAt);
      endedAt = new Date(input.endedAt);
      minutes = minutes ?? Math.max(1, Math.floor((endedAt.getTime() - startedAt.getTime()) / 60000));
    } else {
      if (!minutes || minutes < 1) throw new BadRequestException('Stunden sind erforderlich.');
      startedAt = input.date ? new Date(input.date) : new Date();
      startedAt.setHours(9, 0, 0, 0);
      endedAt = new Date(startedAt.getTime() + minutes * 60000);
    }
    if (minutes! > 840) throw new BadRequestException('Maximale Erfassung pro Eintrag: 14 Stunden.');
    const { entry, kontingentWarning, overBudget } = await this.createPhaseTimeEntry({
      userId, actingUser: user,
      projectId: input.projectId, projectPhaseId: input.projectPhaseId, taskId: input.taskId,
      durationMinutes: minutes!, startedAt, endedAt,
      description: input.description, isBillableExtra: input.isBillableExtra, overBudgetReason: input.overBudgetReason,
    });
    return (kontingentWarning || overBudget)
      ? { ...entry, ...(kontingentWarning ? { kontingentWarning } : {}), ...(overBudget ? { overBudget: true } : {}) }
      : entry;
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
      // Never serialize the full user record (it contains passwordHash) — only safe fields.
      user: { select: { id: true, name: true, email: true } },
      account: true,
      task: true,
      project: true,
      projectPhase: { select: { id: true, name: true, order: true, budgetHours: true, timeEntries: { select: { durationMinutes: true } } } },
    };
    const where: any = {};

    // Role-based base filter: management (ADMIN + PROJEKTLEITER) sees all entries so the budget and
    // team views are accurate; regular employees (MITARBEITER) see only their own.
    if (!isManager(user?.role)) {
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
    // Management (ADMIN + PROJEKTLEITER) sees the whole team's time (optionally filtered to one user);
    // regular employees see only their own.
    if (!isManager(user?.role)) {
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
      include: { user: { select: { id: true, name: true, email: true } }, account: true, task: true, project: true },
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

  async updateEntry(id: string, body: any, user: any) {
    const entry = await this.prisma.timeEntry.findUnique({ where: { id } });
    if (!entry) throw notFound('Zeiteintrag nicht gefunden');
    if (user.role !== Role.ADMIN && entry.userId !== user.userId) {
      throw forbidden('Nur eigene Zeiteinträge bearbeiten');
    }
    const data: any = {};
    if (body.durationMinutes !== undefined) {
      if (body.durationMinutes < 1) throw new BadRequestException('Mindestens 1 Minute');
      if (body.durationMinutes > 840) throw new BadRequestException('Maximum 14 Stunden');
      data.durationMinutes = body.durationMinutes;
      data.endedAt = new Date(entry.startedAt.getTime() + body.durationMinutes * 60000);
    }
    if (body.hours !== undefined) {
      const mins = Math.round(body.hours * 60);
      if (mins < 1 || mins > 840) throw new BadRequestException('Stunden: 0.25 - 14');
      data.durationMinutes = mins;
      data.endedAt = new Date(entry.startedAt.getTime() + mins * 60000);
    }
    if (body.description !== undefined) data.description = body.description;
    if (body.isBillableExtra !== undefined) data.isBillableExtra = !!body.isBillableExtra;
    if (body.projectPhaseId !== undefined) {
      if (body.projectPhaseId) {
        // Normalize to the MAIN phase (same as the write path) so the "time lives on the main
        // phase" invariant can never be broken by a re-point to a sub-phase.
        const resolved = await this.resolveTimePhase({ projectPhaseId: body.projectPhaseId, projectId: entry.projectId || undefined });
        data.projectPhaseId = resolved.projectPhaseId;
      } else {
        data.projectPhaseId = null;
      }
    }
    return this.prisma.timeEntry.update({ where: { id }, data });
  }

  async deleteEntry(id: string, user: any) {
    const entry = await this.prisma.timeEntry.findUnique({ where: { id } });
    if (!entry) throw notFound('Zeiteintrag nicht gefunden');
    if (user.role !== Role.ADMIN && entry.userId !== user.userId) {
      throw forbidden('Nur eigene Zeiteinträge löschen');
    }
    await this.prisma.timeEntry.delete({ where: { id } });
    return { deleted: true };
  }
}
