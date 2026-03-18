import { Injectable, NotFoundException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class ShareService {
  constructor(private prisma: PrismaService) {}

  async getSharesByProject(projectId: string, user: any) {
    await this.checkProjectAccess(projectId, user);
    return this.prisma.projectShare.findMany({
      where: { projectId },
      include: { creator: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createShare(projectId: string, dto: any, user: any) {
    await this.checkProjectAccess(projectId, user);
    return this.prisma.projectShare.create({
      data: {
        projectId,
        label: dto.label,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        createdByUserId: user.userId,
      },
      include: { creator: { select: { id: true, name: true } } },
    });
  }

  async deleteShare(id: string, user: any) {
    const share = await this.prisma.projectShare.findUnique({ where: { id } });
    if (!share) throw new NotFoundException('Share-Link nicht gefunden');
    await this.checkProjectAccess(share.projectId, user);
    await this.prisma.projectShare.delete({ where: { id } });
    return { deleted: true };
  }

  async getPublicView(token: string) {
    const share = await this.prisma.projectShare.findUnique({
      where: { token },
      include: {
        project: {
          include: {
            phases: { orderBy: { order: 'asc' } },
            permits: {
              select: { id: true, title: true, status: true, authority: true, submittedAt: true, expectedDecisionAt: true, decidedAt: true },
              orderBy: { createdAt: 'desc' },
            },
            account: { select: { id: true, name: true } },
            owner: { select: { id: true, name: true } },
            members: { include: { user: { select: { id: true, name: true } } } },
          },
        },
      },
    });

    if (!share) throw new NotFoundException('Link nicht gefunden oder abgelaufen');
    if (share.expiresAt && share.expiresAt < new Date()) {
      throw new UnauthorizedException('Dieser Link ist abgelaufen');
    }

    return {
      project: share.project,
      label: share.label,
      expiresAt: share.expiresAt,
    };
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
