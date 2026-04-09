import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ActivityLoggerService } from '../activity/activity-logger.service';
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

    // Phase distribution
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

  async findAll(user: any) {
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

    return this.prisma.project.findMany({
      where,
      include: {
        account: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true, email: true } },
        phases: { orderBy: { order: 'asc' } },
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        _count: { select: { members: true, phases: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findById(id: string, user: any) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        account: { select: { id: true, name: true, type: true } },
        owner: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } },
        phases: { orderBy: { order: 'asc' }, include: { completedBy: { select: { id: true, name: true } } } },
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { addedAt: 'asc' },
        },
      },
    });
    if (!project) throw new NotFoundException('Projekt nicht gefunden');
    this.checkAccess(project, user);
    return project;
  }

  async create(dto: CreateProjectDto, user: any) {
    if (!user?.userId) throw new ForbiddenException('Authentifizierung erforderlich');
    const ownerUserId = dto.ownerUserId || user.userId;

    const project = await this.prisma.project.create({
      data: {
        name: dto.name,
        description: dto.description,
        status: dto.status,
        type: dto.type,
        address: dto.address,
        budget: dto.budget,
        currency: dto.currency || 'CHF',
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        expectedEndDate: dto.expectedEndDate ? new Date(dto.expectedEndDate) : undefined,
        notes: dto.notes,
        accountId: dto.accountId || undefined,
        ownerUserId,
        createdByUserId: user.userId,
        phases: {
          create: DEFAULT_PHASES,
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

    await this.activityLogger.logActivity({
      actorUserId: user.userId,
      entityType: 'Project',
      entityId: project.id,
      action: 'CREATE',
      payloadJson: { name: project.name },
    });

    return project;
  }

  async update(id: string, dto: UpdateProjectDto, user: any) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Projekt nicht gefunden');
    if (user.role !== Role.ADMIN && project.ownerUserId !== user.userId && project.createdByUserId !== user.userId) {
      throw new ForbiddenException('Zugriff verweigert');
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

  async updatePhase(projectId: string, phaseId: string, dto: UpdatePhaseDto, user: any) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Projekt nicht gefunden');
    this.checkAccess(project, user);

    const phase = await this.prisma.projectPhase.findFirst({
      where: { id: phaseId, projectId },
    });
    if (!phase) throw new NotFoundException('Phase nicht gefunden');

    const isCompleting = dto.status === PhaseStatus.COMPLETED && phase.status !== PhaseStatus.COMPLETED;

    const updated = await this.prisma.projectPhase.update({
      where: { id: phaseId },
      data: {
        status: dto.status,
        notes: dto.notes,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        budgetHours: dto.budgetHours !== undefined && user.role === Role.ADMIN ? dto.budgetHours : undefined,
        completedAt: isCompleting ? new Date() : undefined,
        completedByUserId: isCompleting ? user.userId : undefined,
      },
      include: { completedBy: { select: { id: true, name: true } } },
    });

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
