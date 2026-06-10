import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { SupabaseStorageService } from './supabase-storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Role } from '@prisma/client';

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private storage: SupabaseStorageService,
    private notifications: NotificationsService,
  ) {}

  async findByProject(projectId: string, user: any) {
    await this.checkProjectAccess(projectId, user);
    return this.prisma.projectDocument.findMany({
      where: { projectId },
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async uploadFile(projectId: string, file: Express.Multer.File, dto: any, user: any) {
    await this.checkProjectAccess(projectId, user);
    if (!file) throw new BadRequestException('Keine Datei hochgeladen');
    const url = await this.storage.uploadFile(projectId, file);
    const doc = await this.prisma.projectDocument.create({
      data: {
        projectId,
        name: dto.name || file.originalname,
        url,
        category: dto.category || 'SONSTIGES',
        version: dto.version || undefined,
        notes: dto.notes || undefined,
        uploadedByUserId: user.userId,
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });

    // Notify project members about new document
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, ownerUserId: true, members: { select: { userId: true } } },
    });
    if (project) {
      const recipients = new Set([project.ownerUserId, ...project.members.map((m: any) => m.userId)]);
      recipients.delete(user.userId);
      for (const uid of recipients) {
        this.notifications.createForUser(
          uid, 'TASK_COMMENT',
          'Neues Dokument',
          `"${doc.name}" wurde in "${project.name}" hochgeladen`,
          'Project', projectId, `/projects/${projectId}`,
        ).catch(() => {});
      }
    }

    return doc;
  }

  async create(projectId: string, dto: any, user: any) {
    await this.checkProjectAccess(projectId, user);
    return this.prisma.projectDocument.create({
      data: {
        projectId,
        name: dto.name,
        url: dto.url,
        category: dto.category,
        version: dto.version,
        notes: dto.notes,
        uploadedByUserId: user.userId,
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });
  }

  async update(id: string, dto: any, user: any) {
    const doc = await this.prisma.projectDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Dokument nicht gefunden');
    await this.checkProjectAccess(doc.projectId, user);
    return this.prisma.projectDocument.update({
      where: { id },
      data: { name: dto.name, category: dto.category, version: dto.version, notes: dto.notes },
    });
  }

  async delete(id: string, user: any) {
    const doc = await this.prisma.projectDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Nicht gefunden');
    await this.checkProjectAccess(doc.projectId, user);
    // Try to delete from storage if it's a Supabase URL
    if (doc.url.includes('supabase.co')) {
      await this.storage.deleteFile(doc.url).catch(() => {});
    }
    await this.prisma.projectDocument.delete({ where: { id } });
    return { deleted: true };
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
