import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ActivityLoggerService } from '../activity/activity-logger.service';
import { EmailService } from '../email/email.service';
import { Role, PhaseStatus, ProjectStatus } from '@prisma/client';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UpdatePhaseDto } from './dto/update-phase.dto';

const DEFAULT_PHASES = [
  { name: '10 – Strategische Planung', description: 'Bedürfnisformulierung und Lösungsstrategien', order: 1 },
  { name: '20 – Vorstudien', description: 'Machbarkeitsstudie und Auswahlverfahren', order: 2 },
  { name: '31 – Vorprojekt', description: 'Vorprojekt und Voranfrage Baubewilligung', order: 3 },
  { name: '32 – Bauprojekt', description: 'Bauprojekt und Kostenvoranschlag', order: 4 },
  { name: '33 – Bewilligungsverfahren', description: 'Baubewilligungsgesuch und Bewilligung', order: 5 },
  { name: '41 – Ausschreibung', description: 'Ausschreibung und Vergabe', order: 6 },
  { name: '51 – Ausführungsplanung', description: 'Detailplanung und Ausführungsprojekt', order: 7 },
  { name: '52 – Ausführung', description: 'Bau und Bauleitung vor Ort', order: 8 },
  { name: '53 – Inbetriebnahme', description: 'Inbetriebnahme und Abschluss', order: 9 },
  { name: '61 – Bewirtschaftung', description: 'Betrieb und Unterhalt', order: 10 },
];

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private activityLogger: ActivityLoggerService,
    private email: EmailService,
  ) {}

  async getStats() {
    const total = await this.prisma.project.count();
    const byStatus = await this.prisma.project.groupBy({
      by: ['status'],
      _count: { id: true },
    });
    const byType = await this.prisma.project.groupBy({
      by: ['type'],
      _count: { id: true },
    });
    const totalBudget = await this.prisma.project.aggregate({
      _sum: { budget: true },
    });
    const active = byStatus.find(s => s.status === ProjectStatus.ACTIVE)?._count.id || 0;
    const completed = byStatus.find(s => s.status === ProjectStatus.COMPLETED)?._count.id || 0;
    const onHold = byStatus.find(s => s.status === ProjectStatus.ON_HOLD)?._count.id || 0;

    const phaseStats = await this.prisma.projectPhase.groupBy({
      by: ['status'],
      _count: { id: true },
    });

    return {
      total,
      active,
      completed,
      onHold,
      totalBudget: totalBudget._sum.budget || 0,
      byStatus: byStatus.map(s => ({ status: s.status, count: s._count.id })),
      byType: byType.map(t => ({ type: t.type, count: t._count.id })),
      phaseStats: phaseStats.map(p => ({ status: p.status, count: p._count.id })),
    };
  }

  async getBudgetOverview(user: any) {
    const isAdmin = user.role === Role.ADMIN;
    const where = isAdmin
      ? {}
      : {
          OR: [
            { ownerUserId: user.userId },
            { createdByUserId: user.userId },
            { members: { some: { userId: user.userId } } },
          ],
        };
    const projects = await this.prisma.project.findMany({
      where,
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        budget: true,
        currency: true,
        budgetItems: { select: { estimatedCost: true, actualCost: true } },
      },
    });
    const enriched = projects.map((p) => {
      const totalEstimated = p.budgetItems.reduce((s, i) => s + i.estimatedCost, 0);
      const totalActual = p.budgetItems.reduce((s, i) => s + (i.actualCost ?? 0), 0);
      return {
        id: p.id,
        name: p.name,
        type: p.type,
        status: p.status,
        budget: p.budget ?? 0,
        currency: p.currency,
        totalEstimated,
        totalActual,
        remaining: (p.budget ?? 0) - totalActual,
      };
    });
    const byType: Record<string, { count: number; budget: number; estimated: number; actual: number }> = {};
    let total = 0;
    let totalEstimated = 0;
    let totalActual = 0;
    for (const p of enriched) {
      total += p.budget;
      totalEstimated += p.totalEstimated;
      totalActual += p.totalActual;
      const k = p.type;
      if (!byType[k]) byType[k] = { count: 0, budget: 0, estimated: 0, actual: 0 };
      byType[k].count += 1;
      byType[k].budget += p.budget;
      byType[k].estimated += p.totalEstimated;
      byType[k].actual += p.totalActual;
    }
    return { totals: { budget: total, estimated: totalEstimated, actual: totalActual }, byType, projects: enriched };
  }

  async findAll(user: any, page = 1, pageSize = 50, search?: string) {
    // Admin + Projektleiter see all projects; Mitarbeiter/Extern only see assigned
    const canSeeAll = user.role === Role.ADMIN || user.role === 'PROJEKTLEITER';
    const where: any = canSeeAll
      ? {}
      : {
          OR: [
            { ownerUserId: user.userId },
            { createdByUserId: user.userId },
            { members: { some: { userId: user.userId } } },
          ],
        };

    if (search) {
      const searchFilter = {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { address: { contains: search, mode: 'insensitive' as const } },
        ],
      };
      if (where.OR) {
        where.AND = [{ OR: where.OR }, searchFilter];
        delete where.OR;
      } else {
        Object.assign(where, searchFilter);
      }
    }

    const [projects, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        include: {
          account: { select: { id: true, name: true } },
          deal: { select: { id: true, name: true } },
          owner: { select: { id: true, name: true, email: true } },
          phases: { select: { id: true, name: true, status: true, order: true }, orderBy: { order: 'asc' } },
          members: {
            include: { user: { select: { id: true, name: true, email: true } } },
            take: 5,
          },
          _count: { select: { members: true, phases: true } },
        },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.project.count({ where }),
    ]);
    return {
      data: projects.map((p: any) => this.redactProject(p, user)),
      total,
      page,
      pageSize,
    };
  }

  async findById(id: string, user: any) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        account: { select: { id: true, name: true, type: true } },
        deal: { select: { id: true, name: true, amount: true, currency: true } },
        owner: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } },
        phases: {
          orderBy: { order: 'asc' },
          include: {
            completedBy: { select: { id: true, name: true } },
            linkedTask: { select: { id: true, title: true, status: true, dueDate: true, assignedToUserId: true, assignee: { select: { id: true, name: true } } } },
            timeEntries: {
              select: { id: true, durationMinutes: true, description: true, startedAt: true, user: { select: { id: true, name: true } } },
              orderBy: { startedAt: 'desc' },
            },
          },
        },
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { addedAt: 'asc' },
        },
      },
    });
    if (!project) throw new NotFoundException('Projekt nicht gefunden');
    this.checkAccess(project, user);
    return this.redactProject(project as any, user);
  }

  private redactProject(project: any, user: any): any {
    if (user?.role === Role.ADMIN) return project;
    const { budget, budgetHours, notes, account, ...safe } = project;
    if (account) {
      const { phone, email, ...accountSafe } = account;
      return { ...safe, account: accountSafe };
    }
    return safe;
  }

  async create(dto: CreateProjectDto, user: any) {
    if (!user?.userId) throw new ForbiddenException('Authentifizierung erforderlich');
    if (!dto.address || !dto.address.trim()) {
      throw new ForbiddenException('Adresse ist erforderlich');
    }
    const ownerUserId = dto.ownerUserId || user.userId;

    let phaseSeed: any[] = DEFAULT_PHASES;
    let templateMilestoneIds: string[] = [];
    let templateBudgetItems: any[] = [];
    if ((dto as any).templateId) {
      const tpl = await this.prisma.projectTemplate.findUnique({ where: { id: (dto as any).templateId } });
      if (tpl) {
        if (Array.isArray(tpl.defaultPhases) && tpl.defaultPhases.length > 0) {
          phaseSeed = (tpl.defaultPhases as any[]).map((p: any, idx: number) => ({
            name: p.name,
            description: p.description ?? null,
            order: p.order ?? idx + 1,
            budgetHours: p.budgetHours ?? null,
          }));
        }
        if (Array.isArray(tpl.defaultMilestoneIds)) {
          templateMilestoneIds = (tpl.defaultMilestoneIds as any[]).filter((x) => typeof x === 'string');
        }
        if (Array.isArray(tpl.defaultBudgetItems)) {
          templateBudgetItems = tpl.defaultBudgetItems as any[];
        }
      }
    }

    const project = await this.prisma.project.create({
      data: {
        name: dto.name,
        description: dto.description,
        status: dto.status,
        type: dto.type,
        address: dto.address,
        budget: dto.budget,
        currency: (dto.currency === 'EUR' ? 'EUR' : 'CHF'),
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        expectedEndDate: dto.expectedEndDate ? new Date(dto.expectedEndDate) : undefined,
        notes: dto.notes,
        accountId: dto.accountId || undefined,
        ownerUserId,
        createdByUserId: user.userId,
        phases: {
          create: phaseSeed,
        },
        members: {
          create: [{ userId: ownerUserId }],
        },
      },
      include: {
        phases: { orderBy: { order: 'asc' } },
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
        owner: { select: { id: true, name: true, email: true } },
      },
    });

    if (templateMilestoneIds.length > 0) {
      await this.prisma.projectMilestone.createMany({
        data: templateMilestoneIds.map((mid, idx) => ({
          projectId: project.id,
          milestoneId: mid,
          order: idx,
        })),
        skipDuplicates: true,
      });
    }

    if (templateBudgetItems.length > 0) {
      await this.prisma.budgetItem.createMany({
        data: templateBudgetItems
          .filter((it: any) => it && it.description)
          .map((it: any) => ({
            projectId: project.id,
            category: it.category || 'SONSTIGES',
            description: it.description,
            estimatedCost: Number(it.estimatedCost) || 0,
            phase: it.phase || null,
            createdByUserId: user.userId,
          })),
      });
    }

    await this.activityLogger.logActivity({
      actorUserId: user.userId,
      entityType: 'Project',
      entityId: project.id,
      action: 'CREATE',
      payloadJson: { name: project.name },
    });

    const recipients = Array.from(
      new Set(
        [project.owner?.email, ...project.members.map((m) => m.user?.email)].filter(Boolean) as string[],
      ),
    );
    if (recipients.length > 0) {
      const link = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/projects/${project.id}`;
      this.email.send({
        to: recipients,
        subject: `Neues Projekt erstellt: ${project.name}`,
        text: [
          `Ein neues Projekt wurde erstellt.`,
          ``,
          `Projekt:        ${project.name}`,
          project.address ? `Adresse:        ${project.address}` : '',
          project.expectedEndDate ? `Fälligkeit:     ${project.expectedEndDate.toISOString().slice(0, 10)}` : '',
          `Verantwortlich: ${project.owner?.name || '—'}`,
          ``,
          project.description ? `Beschreibung:\n${project.description}` : '',
          ``,
          `Link: ${link}`,
        ].filter(Boolean).join('\n'),
        accountId: project.accountId || null,
        loggedByUserId: user.userId,
        entityType: 'Project',
        entityId: project.id,
      }).catch(() => {});
    }

    return project;
  }

  async update(id: string, dto: UpdateProjectDto, user: any) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Projekt nicht gefunden');
    if (user.role !== Role.ADMIN && project.ownerUserId !== user.userId && project.createdByUserId !== user.userId) {
      throw new ForbiddenException('Zugriff verweigert');
    }

    if (dto.address !== undefined && (!dto.address || !dto.address.trim())) {
      throw new ForbiddenException('Adresse darf nicht leer sein');
    }
    const updated = await this.prisma.project.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        status: dto.status,
        type: dto.type,
        address: dto.address,
        budget: dto.budget,
        budgetHours: (dto as any).budgetHours !== undefined
          ? (user.role === Role.ADMIN ? (dto as any).budgetHours : undefined)
          : undefined,
        currency: dto.currency,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        expectedEndDate: dto.expectedEndDate ? new Date(dto.expectedEndDate) : undefined,
        actualEndDate: dto.actualEndDate ? new Date(dto.actualEndDate) : undefined,
        notes: dto.notes,
        accountId: dto.accountId !== undefined ? (dto.accountId || null) : undefined,
        ownerUserId: dto.ownerUserId,
      },
      include: {
        phases: { orderBy: { order: 'asc' } },
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
        owner: { select: { id: true, name: true, email: true } },
        account: { select: { id: true, name: true } },
      },
    });

    await this.activityLogger.logActivity({
      actorUserId: user.userId,
      entityType: 'Project',
      entityId: id,
      action: 'UPDATE',
      payloadJson: { name: updated.name },
    });

    return updated;
  }

  async delete(id: string, user: any) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Projekt nicht gefunden');
    if (user.role !== Role.ADMIN && project.ownerUserId !== user.userId && project.createdByUserId !== user.userId) {
      throw new ForbiddenException('Zugriff verweigert');
    }
    await this.prisma.project.delete({ where: { id } });
    await this.activityLogger.logActivity({
      actorUserId: user.userId,
      entityType: 'Project',
      entityId: id,
      action: 'DELETE',
      payloadJson: { name: project.name },
    });
    return { deleted: true };
  }

  async createPhase(projectId: string, body: any, user: any) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { members: true },
    });
    if (!project) throw new NotFoundException('Projekt nicht gefunden');
    this.checkAccess(project, user);

    const order = body.order ?? (await this.prisma.projectPhase.count({ where: { projectId } }) + 1);

    const task = await this.prisma.task.create({
      data: {
        title: `${project.name} – ${body.name}`,
        description: body.description ?? null,
        status: 'OPEN',
        priority: 'MEDIUM',
        dueDate: body.endDate ? new Date(body.endDate) : null,
        projectId,
        accountId: project.accountId ?? null,
        assignedToUserId: project.ownerUserId,
        createdByUserId: user.userId,
      },
    });

    const phase = await this.prisma.projectPhase.create({
      data: {
        projectId,
        name: body.name,
        description: body.description ?? null,
        order,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        budgetHours: body.budgetHours ?? null,
        linkedTaskId: task.id,
      },
      include: { linkedTask: true },
    });

    await this.activityLogger.logActivity({
      actorUserId: user.userId,
      entityType: 'Project',
      entityId: projectId,
      action: 'PHASE_CREATE',
      payloadJson: { phaseName: phase.name, taskId: task.id },
    });

    return phase;
  }

  async updatePhase(projectId: string, phaseId: string, dto: UpdatePhaseDto, user: any) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Projekt nicht gefunden');
    this.checkAccess(project, user);

    const phase = await this.prisma.projectPhase.findFirst({
      where: { id: phaseId, projectId },
    });
    if (!phase) throw new NotFoundException('Phase nicht gefunden');

    const isCompleting = dto.status === PhaseStatus.COMPLETED && phase.status !== PhaseStatus.COMPLETED;
    const isReopening = phase.status === PhaseStatus.COMPLETED && dto.status && dto.status !== PhaseStatus.COMPLETED;

    const updated = await this.prisma.projectPhase.update({
      where: { id: phaseId },
      data: {
        status: dto.status,
        notes: dto.notes,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        budgetHours: dto.budgetHours !== undefined && user.role === Role.ADMIN ? dto.budgetHours : undefined,
        completedAt: isCompleting ? new Date() : (isReopening ? null : undefined),
        completedByUserId: isCompleting ? user.userId : (isReopening ? null : undefined),
      },
      include: { completedBy: { select: { id: true, name: true } }, linkedTask: { select: { id: true, status: true } } },
    });

    // Sync linked task status with phase status
    if (updated.linkedTaskId) {
      if (isCompleting) {
        await this.prisma.task.update({ where: { id: updated.linkedTaskId }, data: { status: 'DONE' } });
      } else if (isReopening) {
        await this.prisma.task.update({ where: { id: updated.linkedTaskId }, data: { status: 'OPEN' } });
      }
    }

    // If all phases are done, auto-set project to COMPLETED
    const allPhases = await this.prisma.projectPhase.findMany({ where: { projectId } });
    const allDone = allPhases.every(p =>
      p.id === phaseId ? dto.status === PhaseStatus.COMPLETED || dto.status === PhaseStatus.SKIPPED
        : p.status === PhaseStatus.COMPLETED || p.status === PhaseStatus.SKIPPED
    );
    if (allDone && project.status === ProjectStatus.ACTIVE) {
      await this.prisma.project.update({
        where: { id: projectId },
        data: { status: ProjectStatus.COMPLETED, actualEndDate: new Date() },
      });
    }

    await this.activityLogger.logActivity({
      actorUserId: user.userId,
      entityType: 'Project',
      entityId: projectId,
      action: 'PHASE_UPDATE',
      payloadJson: { phaseName: phase.name, newStatus: dto.status },
    });

    return updated;
  }

  async getPhaseKontingent(projectId: string, phaseId: string) {
    const phase = await this.prisma.projectPhase.findFirst({
      where: { id: phaseId, projectId },
      include: {
        timeEntries: { select: { durationMinutes: true } },
        originDealPhase: {
          select: { budgetChf: true, offeredHours: true, hourBudget: true },
        },
      },
    });
    if (!phase) throw new NotFoundException('Phase nicht gefunden');

    const budgetHours = phase.budgetHours || 0;
    const budgetChf = phase.budgetChf || phase.originDealPhase?.budgetChf || 0;
    const offeredHours = phase.offeredHours || phase.originDealPhase?.offeredHours || 0;
    const usedMinutes = phase.timeEntries.reduce((s, e) => s + e.durationMinutes, 0);
    const usedHours = usedMinutes / 60;
    const remaining = Math.max(0, budgetHours - usedHours);
    const percent = budgetHours > 0 ? Math.round((usedHours / budgetHours) * 100) : 0;

    return {
      phaseId,
      phaseName: phase.name,
      budgetHours,
      budgetChf,
      offeredHours,
      usedHours: Math.round(usedHours * 10) / 10,
      remaining: Math.round(remaining * 10) / 10,
      percent,
      status: percent >= 100 ? 'OVER' : percent >= 80 ? 'WARNING' : 'OK',
    };
  }

  async deletePhase(
    projectId: string,
    phaseId: string,
    user: any,
    linkedTaskAction: 'delete' | 'keep' = 'keep',
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { members: true },
    });
    if (!project) throw new NotFoundException('Projekt nicht gefunden');
    this.checkAccess(project, user);

    const phase = await this.prisma.projectPhase.findFirst({ where: { id: phaseId, projectId } });
    if (!phase) throw new NotFoundException('Phase nicht gefunden');

    const linkedTaskId = phase.linkedTaskId;

    await this.prisma.projectPhase.delete({ where: { id: phaseId } });

    if (linkedTaskId) {
      if (linkedTaskAction === 'delete') {
        await this.prisma.task.delete({ where: { id: linkedTaskId } }).catch(() => {});
      }
    }

    await this.activityLogger.logActivity({
      actorUserId: user.userId,
      entityType: 'Project',
      entityId: projectId,
      action: 'PHASE_DELETE',
      payloadJson: { phaseName: phase.name, linkedTaskId, linkedTaskAction },
    });
    return { deleted: true, hadLinkedTask: !!linkedTaskId };
  }

  // ─── Project Templates ───
  async listTemplates() {
    return this.prisma.projectTemplate.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
  }

  async getTemplate(id: string) {
    const tpl = await this.prisma.projectTemplate.findUnique({ where: { id } });
    if (!tpl) throw new NotFoundException('Template nicht gefunden');
    return tpl;
  }

  async createTemplate(body: any) {
    return this.prisma.projectTemplate.create({
      data: {
        name: body.name,
        type: body.type,
        description: body.description ?? null,
        defaultPhases: body.defaultPhases ?? [],
        defaultMilestoneIds: body.defaultMilestoneIds ?? [],
        defaultBudgetItems: body.defaultBudgetItems ?? [],
      },
    });
  }

  async updateTemplate(id: string, body: any) {
    return this.prisma.projectTemplate.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.type !== undefined && { type: body.type }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.defaultPhases !== undefined && { defaultPhases: body.defaultPhases }),
        ...(body.defaultMilestoneIds !== undefined && { defaultMilestoneIds: body.defaultMilestoneIds }),
        ...(body.defaultBudgetItems !== undefined && { defaultBudgetItems: body.defaultBudgetItems }),
        ...(body.active !== undefined && { active: body.active }),
      },
    });
  }

  async deleteTemplate(id: string) {
    await this.prisma.projectTemplate.update({ where: { id }, data: { active: false } });
    return { deleted: true };
  }

  // ─── Construction Milestones (master) ───
  async listMilestoneMaster() {
    const count = await this.prisma.constructionMilestone.count();
    if (count === 0) {
      const defaults = [
        'Planung',
        'Baustelleneinrichtung',
        'Start Aushub',
        'Start Rohbau',
        'Fertig Kellerdecke',
        'Fertig Erdgeschossdecke',
        'Fertig Dach',
        'Fertig Aussenhülle',
        'Fertig Innenausbau',
        'Abnahme',
      ];
      await this.prisma.constructionMilestone.createMany({
        data: defaults.map((name, order) => ({ name, order, isDefault: true })),
      });
    }
    return this.prisma.constructionMilestone.findMany({
      where: { active: true },
      orderBy: { order: 'asc' },
    });
  }

  async createMilestoneMaster(body: any) {
    const order = body.order ?? (await this.prisma.constructionMilestone.count());
    return this.prisma.constructionMilestone.create({
      data: {
        name: body.name,
        order,
        isDefault: body.isDefault ?? true,
      },
    });
  }

  async updateMilestoneMaster(id: string, body: any) {
    return this.prisma.constructionMilestone.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.order !== undefined && { order: body.order }),
        ...(body.isDefault !== undefined && { isDefault: body.isDefault }),
        ...(body.active !== undefined && { active: body.active }),
      },
    });
  }

  async deleteMilestoneMaster(id: string) {
    await this.prisma.constructionMilestone.update({
      where: { id },
      data: { active: false },
    });
    return { deleted: true };
  }

  // ─── Per-project milestones ───
  async listProjectMilestones(projectId: string, user: any) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { members: true },
    });
    if (!project) throw new NotFoundException('Projekt nicht gefunden');
    this.checkAccess(project, user);

    return this.prisma.projectMilestone.findMany({
      where: { projectId },
      include: { milestone: true },
      orderBy: { order: 'asc' },
    });
  }

  async setProjectMilestones(projectId: string, milestoneIds: string[], user: any) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { members: true },
    });
    if (!project) throw new NotFoundException('Projekt nicht gefunden');
    this.checkAccess(project, user);

    const masters = await this.prisma.constructionMilestone.findMany({
      where: { id: { in: milestoneIds } },
      orderBy: { order: 'asc' },
    });

    await this.prisma.$transaction([
      this.prisma.projectMilestone.deleteMany({ where: { projectId } }),
      this.prisma.projectMilestone.createMany({
        data: masters.map((m, idx) => ({
          projectId,
          milestoneId: m.id,
          order: idx,
        })),
      }),
    ]);

    return this.listProjectMilestones(projectId, user);
  }

  async toggleProjectMilestone(
    projectId: string,
    rowId: string,
    completed: boolean,
    user: any,
    comment?: string,
  ) {
    const row = await this.prisma.projectMilestone.findFirst({ where: { id: rowId, projectId } });
    if (!row) throw new NotFoundException('Milestone nicht gefunden');

    return this.prisma.projectMilestone.update({
      where: { id: rowId },
      data: {
        completed,
        completedAt: completed ? new Date() : null,
        completedByUserId: completed ? user.userId : null,
        ...(comment !== undefined && { comment }),
      },
      include: { milestone: true },
    });
  }

  async addMember(projectId: string, userId: string, role: string | undefined, user: any) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Projekt nicht gefunden');
    if (user.role !== Role.ADMIN && project.ownerUserId !== user.userId) {
      throw new ForbiddenException('Nur Admins oder Projektinhaber können Mitglieder hinzufügen');
    }
    return this.prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId } },
      update: { role },
      create: { projectId, userId, role },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }

  async removeMember(projectId: string, userId: string, user: any) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Projekt nicht gefunden');
    if (user.role !== Role.ADMIN && project.ownerUserId !== user.userId) {
      throw new ForbiddenException('Zugriff verweigert');
    }
    await this.prisma.projectMember.deleteMany({ where: { projectId, userId } });
    return { removed: true };
  }

  private checkAccess(project: any, user: any) {
    if (user.role === Role.ADMIN) return;
    const isMember = project.members?.some((m: any) => m.userId === user.userId);
    if (
      project.ownerUserId !== user.userId &&
      project.createdByUserId !== user.userId &&
      !isMember
    ) {
      throw new ForbiddenException('Zugriff verweigert');
    }
  }
}
