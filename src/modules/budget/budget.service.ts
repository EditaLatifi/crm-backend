import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class BudgetService {
  constructor(private prisma: PrismaService) {}

  async findByProject(projectId: string, user: any) {
    await this.checkProjectAccess(projectId, user);
    return this.prisma.budgetItem.findMany({
      where: { projectId },
      include: { creator: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(projectId: string, dto: any, user: any) {
    await this.checkProjectAccess(projectId, user);
    return this.prisma.budgetItem.create({
      data: {
        projectId,
        category: dto.category,
        description: dto.description,
        estimatedCost: parseFloat(dto.estimatedCost) || 0,
        actualCost: dto.actualCost ? parseFloat(dto.actualCost) : undefined,
        phase: dto.phase,
        notes: dto.notes,
        createdByUserId: user.userId,
      },
      include: { creator: { select: { id: true, name: true } } },
    });
  }

  async update(id: string, dto: any, user: any) {
    const item = await this.prisma.budgetItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Budgetposten nicht gefunden');
    await this.checkProjectAccess(item.projectId, user);
    return this.prisma.budgetItem.update({
      where: { id },
      data: {
        category: dto.category,
        description: dto.description,
        estimatedCost: dto.estimatedCost !== undefined ? parseFloat(dto.estimatedCost) : undefined,
        actualCost: dto.actualCost !== undefined ? (dto.actualCost === null ? null : parseFloat(dto.actualCost)) : undefined,
        phase: dto.phase,
        notes: dto.notes,
      },
    });
  }

  async delete(id: string, user: any) {
    const item = await this.prisma.budgetItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Nicht gefunden');
    await this.checkProjectAccess(item.projectId, user);
    await this.prisma.budgetItem.delete({ where: { id } });
    return { deleted: true };
  }

  async getSummary(projectId: string, user: any) {
    await this.checkProjectAccess(projectId, user);
    const items = await this.prisma.budgetItem.findMany({ where: { projectId } });
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { budget: true, currency: true } });

    const totalEstimated = items.reduce((s, i) => s + i.estimatedCost, 0);
    const totalActual = items.reduce((s, i) => s + (i.actualCost ?? 0), 0);
    const byCategory = items.reduce((acc: any, i) => {
      if (!acc[i.category]) acc[i.category] = { estimated: 0, actual: 0 };
      acc[i.category].estimated += i.estimatedCost;
      acc[i.category].actual += i.actualCost ?? 0;
      return acc;
    }, {});

    return {
      totalBudget: project?.budget ?? 0,
      currency: project?.currency ?? 'CHF',
      totalEstimated,
      totalActual,
      remaining: (project?.budget ?? 0) - totalActual,
      byCategory,
    };
  }

  async getAlerts(user: any) {
    const isAdmin = user.role === Role.ADMIN;
    const where = isAdmin ? {} : {
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
        budget: true,
        budgetItems: { select: { estimatedCost: true, actualCost: true } },
      },
    });
    return projects
      .map((p: any) => {
        const totalEstimated = p.budgetItems.reduce((s: number, i: any) => s + i.estimatedCost, 0);
        const totalActual = p.budgetItems.reduce((s: number, i: any) => s + (i.actualCost ?? 0), 0);
        const budget = p.budget ?? 0;
        const ref = budget > 0 ? budget : totalEstimated;
        const pct = ref > 0 ? Math.round((totalActual / ref) * 100) : 0;
        return { id: p.id, name: p.name, budget, totalEstimated, totalActual, pct };
      })
      .filter((p: any) => (p.budget > 0 || p.totalEstimated > 0) && p.pct >= 80)
      .sort((a: any, b: any) => b.pct - a.pct)
      .slice(0, 5);
  }

  private async checkProjectAccess(projectId: string, user: any) {
    if (user.role === Role.ADMIN) return;
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { members: { select: { userId: true } } },
    });
    if (!project) throw new NotFoundException('Projekt nicht gefunden');
    const isMember = project.members.some((m: any) => m.userId === user.userId);
    if (project.ownerUserId !== user.userId && project.createdByUserId !== user.userId && !isMember) {
      throw new ForbiddenException('Kein Zugriff');
    }
  }
}
