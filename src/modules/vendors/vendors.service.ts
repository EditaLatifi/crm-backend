import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class VendorsService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: any) {
    return this.prisma.vendor.findMany({
      include: {
        creator: { select: { id: true, name: true } },
        projects: {
          include: { project: { select: { id: true, name: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, name: true } },
        projects: {
          include: { project: { select: { id: true, name: true, status: true } } },
        },
      },
    });
    if (!vendor) throw new NotFoundException('Lieferant nicht gefunden');
    return vendor;
  }

  async findByProject(projectId: string, user: any) {
    await this.checkProjectAccess(projectId, user);
    return this.prisma.projectVendor.findMany({
      where: { projectId },
      include: { vendor: true },
      orderBy: { assignedAt: 'desc' },
    });
  }

  async create(dto: any, user: any) {
    return this.prisma.vendor.create({
      data: {
        name: dto.name,
        type: dto.type,
        contactName: dto.contactName,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        notes: dto.notes,
        rating: dto.rating ? parseInt(dto.rating) : undefined,
        createdByUserId: user.userId,
      },
      include: { creator: { select: { id: true, name: true } } },
    });
  }

  async update(id: string, dto: any, user: any) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id } });
    if (!vendor) throw new NotFoundException('Lieferant nicht gefunden');
    if (user.role !== Role.ADMIN && vendor.createdByUserId !== user.userId) {
      throw new ForbiddenException('Kein Zugriff');
    }
    return this.prisma.vendor.update({
      where: { id },
      data: {
        name: dto.name,
        type: dto.type,
        contactName: dto.contactName,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        notes: dto.notes,
        rating: dto.rating ? parseInt(dto.rating) : undefined,
      },
    });
  }

  async delete(id: string, user: any) {
    if (user.role !== Role.ADMIN) throw new ForbiddenException('Nur Admins können löschen');
    const vendor = await this.prisma.vendor.findUnique({ where: { id } });
    if (!vendor) throw new NotFoundException('Nicht gefunden');
    await this.prisma.vendor.delete({ where: { id } });
    return { deleted: true };
  }

  async assignToProject(projectId: string, vendorId: string, dto: any, user: any) {
    await this.checkProjectAccess(projectId, user);
    return this.prisma.projectVendor.upsert({
      where: { projectId_vendorId: { projectId, vendorId } },
      create: { projectId, vendorId, phase: dto.phase, notes: dto.notes },
      update: { phase: dto.phase, notes: dto.notes },
    });
  }

  async removeFromProject(projectId: string, vendorId: string, user: any) {
    await this.checkProjectAccess(projectId, user);
    await this.prisma.projectVendor.delete({
      where: { projectId_vendorId: { projectId, vendorId } },
    });
    return { removed: true };
  }

  async getStats() {
    const total = await this.prisma.vendor.count();
    const byType = await this.prisma.vendor.groupBy({ by: ['type'], _count: { id: true } });
    return { total, byType: byType.map(t => ({ type: t.type, count: t._count.id })) };
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
