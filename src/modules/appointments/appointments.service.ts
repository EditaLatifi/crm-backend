import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: any) {
    return this.prisma.appointment.findMany({
      where: { createdByUserId: user.userId },
      include: { account: { select: { id: true, name: true } }, contact: { select: { id: true, name: true } }, deal: { select: { id: true, name: true } } },
      orderBy: { startAt: 'asc' },
    });
  }

  async findById(id: string) {
    const appt = await this.prisma.appointment.findUnique({
      where: { id },
      include: { account: { select: { id: true, name: true } }, contact: { select: { id: true, name: true } }, deal: { select: { id: true, name: true } } },
    });
    if (!appt) throw new NotFoundException('Appointment not found');
    return appt;
  }

  async create(data: any, user: any) {
    return this.prisma.appointment.create({
      data: {
        title: data.title,
        description: data.description || null,
        startAt: new Date(data.startAt),
        endAt: new Date(data.endAt),
        accountId: data.accountId || null,
        contactId: data.contactId || null,
        dealId: data.dealId || null,
        createdByUserId: user.userId,
      },
    });
  }

  async update(id: string, data: any) {
    await this.findById(id);
    return this.prisma.appointment.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.startAt !== undefined && { startAt: new Date(data.startAt) }),
        ...(data.endAt !== undefined && { endAt: new Date(data.endAt) }),
        ...(data.accountId !== undefined && { accountId: data.accountId || null }),
        ...(data.contactId !== undefined && { contactId: data.contactId || null }),
        ...(data.dealId !== undefined && { dealId: data.dealId || null }),
      },
    });
  }

  async delete(id: string) {
    await this.findById(id);
    await this.prisma.appointment.delete({ where: { id } });
    return { deleted: true };
  }
}
