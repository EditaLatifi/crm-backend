import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Role } from '@prisma/client';

// Parse to a finite number, or undefined for null/empty/non-numeric input (never NaN to the DB).
const toNum = (v: any): number | undefined => {
  if (v === null || v === undefined || v === '') return undefined;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
};

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
        estimatedCost: toNum(dto.estimatedCost) ?? 0,
        actualCost: toNum(dto.actualCost),
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
        estimatedCost: dto.estimatedCost !== undefined ? (toNum(dto.estimatedCost) ?? 0) : undefined,
        actualCost: dto.actualCost !== undefined ? (toNum(dto.actualCost) ?? null) : undefined,
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
    const budget = project?.budget ?? 0;
    // Reference budget: the project's overall budget if set, otherwise the sum of planned cost items.
    // Without this, a project with cost items but no overall budget showed a wrong negative "Verbleibend".
    const ref = budget > 0 ? budget : totalEstimated;
    const remaining = ref - totalActual;
    const percent = ref > 0 ? Math.round((totalActual / ref) * 100) : 0;
    const byCategory = items.reduce((acc: any, i) => {
      if (!acc[i.category]) acc[i.category] = { estimated: 0, actual: 0 };
      acc[i.category].estimated += i.estimatedCost;
      acc[i.category].actual += i.actualCost ?? 0;
      return acc;
    }, {});

    // Budget status warnings
    let status: 'OK' | 'WARNING' | 'OVER' = 'OK';
    let warning: string | null = null;
    if (ref > 0) {
      if (percent >= 100) {
        status = 'OVER';
        warning = `Budget überschritten: ${percent}% verbraucht (${totalActual.toFixed(2)} / ${ref.toFixed(2)} CHF)`;
      } else if (percent >= 80) {
        status = 'WARNING';
        warning = `Achtung: ${percent}% des Budgets verbraucht (${totalActual.toFixed(2)} / ${ref.toFixed(2)} CHF)`;
      }
    }

    return {
      totalBudget: ref,
      // true = the project has its own overall Baukosten-Budget; false = we fell back to the planned sum.
      // The UI uses this so "Gesamtbudget" and "Geplant" aren't shown as two identical numbers.
      budgetSet: budget > 0,
      currency: project?.currency ?? 'CHF',
      totalEstimated,
      totalActual,
      remaining,
      percent,
      status,
      warning,
      byCategory,
    };
  }

  async validateBudget(projectId: string, additionalCost: number, user: any) {
    const summary = await this.getSummary(projectId, user);
    const afterCost = summary.totalActual + additionalCost;
    const budget = summary.totalBudget;

    if (budget > 0) {
      const percent = Math.round((afterCost / budget) * 100);
      if (percent > 110 && user.role !== Role.ADMIN && user.role !== 'PROJEKTLEITER') {
        throw new ForbiddenException(
          `Budget würde um ${(percent - 100)}% überschritten. Genehmigung durch Admin/Projektleiter erforderlich.`,
        );
      }
      if (percent >= 100) {
        return { allowed: true, warning: `Budget wird überschritten: ${percent}% nach Buchung` };
      }
      if (percent >= 80) {
        return { allowed: true, warning: `Achtung: ${percent}% des Budgets nach Buchung` };
      }
    }
    return { allowed: true, warning: null };
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
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { members: { select: { userId: true } } },
    });
    // The project must exist even for admins (otherwise summary returns fake zeroed data).
    if (!project) throw new NotFoundException('Projekt nicht gefunden');
    if (user.role === Role.ADMIN) return;
    const isMember = project.members.some((m: any) => m.userId === user.userId);
    if (project.ownerUserId !== user.userId && project.createdByUserId !== user.userId && !isMember) {
      throw new ForbiddenException('Kein Zugriff');
    }
  }
}
