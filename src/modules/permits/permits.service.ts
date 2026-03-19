import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Role, PermitStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class PermitsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async findByProject(projectId: string, user: any) {
    await this.checkProjectAccess(projectId, user);
    return this.prisma.permit.findMany({
      where: { projectId },
      include: {
        creator: { select: { id: true, name: true } },
        history: { include: { actor: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAll(user: any) {
    if (user.role !== Role.ADMIN) throw new ForbiddenException('Nur Admins');
    return this.prisma.permit.findMany({
      include: {
        project: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async create(projectId: string, dto: any, user: any) {
    await this.checkProjectAccess(projectId, user);
    return this.prisma.permit.create({
      data: {
        projectId,
        title: dto.title,
        authority: dto.authority,
        referenceNumber: dto.referenceNumber,
        status: dto.status || PermitStatus.VORBEREITUNG,
        submittedAt: dto.submittedAt ? new Date(dto.submittedAt) : undefined,
        expectedDecisionAt: dto.expectedDecisionAt ? new Date(dto.expectedDecisionAt) : undefined,
        notes: dto.notes,
        documents: dto.documents || [],
        createdByUserId: user.userId,
        history: { create: [{ toStatus: dto.status || PermitStatus.VORBEREITUNG, actorUserId: user.userId, notes: 'Erstellt' }] },
      },
      include: { history: { include: { actor: { select: { id: true, name: true } } } }, creator: { select: { id: true, name: true } } },
    });
  }

  async update(id: string, dto: any, user: any) {
    const permit = await this.prisma.permit.findUnique({ where: { id } });
    if (!permit) throw new NotFoundException('Baubewilligung nicht gefunden');
    await this.checkProjectAccess(permit.projectId, user);

    const statusChanged = dto.status && dto.status !== permit.status;
    const updated = await this.prisma.permit.update({
      where: { id },
      data: {
        title: dto.title,
        authority: dto.authority,
        referenceNumber: dto.referenceNumber,
        status: dto.status,
        submittedAt: dto.submittedAt ? new Date(dto.submittedAt) : undefined,
        expectedDecisionAt: dto.expectedDecisionAt ? new Date(dto.expectedDecisionAt) : undefined,
        decidedAt: (dto.status === 'BEWILLIGT' || dto.status === 'ABGELEHNT') && statusChanged ? new Date() : undefined,
        notes: dto.notes,
        documents: dto.documents,
      },
    });

    if (statusChanged) {
      await this.prisma.permitHistory.create({
        data: {
          permitId: id,
          fromStatus: permit.status,
          toStatus: dto.status,
          notes: dto.historyNote,
          actorUserId: user.userId,
        },
      });
      if (permit.createdByUserId !== user.userId) {
        this.notifications.createForUser(
          permit.createdByUserId, 'PERMIT_STATUS_CHANGED',
          'Baubewilligung aktualisiert',
          `"${permit.title}" ist jetzt: ${dto.status}`,
          'Permit', id, `/projects/${permit.projectId}`,
        ).catch(() => {});
      }
    }
    return updated;
  }

  async delete(id: string, user: any) {
    const permit = await this.prisma.permit.findUnique({ where: { id } });
    if (!permit) throw new NotFoundException('Nicht gefunden');
    await this.checkProjectAccess(permit.projectId, user);
    if (user.role !== Role.ADMIN) throw new ForbiddenException('Nur Admins können löschen');
    await this.prisma.permit.delete({ where: { id } });
    return { deleted: true };
  }

  async getStats() {
    const total = await this.prisma.permit.count();
    const byStatus = await this.prisma.permit.groupBy({ by: ['status'], _count: { id: true } });
    const overdue = await this.prisma.permit.count({
      where: { expectedDecisionAt: { lt: new Date() }, status: { notIn: ['BEWILLIGT', 'ABGELEHNT', 'ZURUECKGEZOGEN'] } },
    });
    return { total, overdue, byStatus: byStatus.map(s => ({ status: s.status, count: s._count.id })) };
  }

  private async checkProjectAccess(projectId: string, user: any) {
    if (user.role === Role.ADMIN) return;
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { members: { select: { userId: true } } },
    });
    if (!project) throw new NotFoundException('Projekt nicht gefunden');
    const isMember = project.members.some(m => m.userId === user.userId);
    if (project.ownerUserId !== user.userId && project.createdByUserId !== user.userId && !isMember) {
      throw new ForbiddenException('Kein Zugriff');
    }
  }
}
