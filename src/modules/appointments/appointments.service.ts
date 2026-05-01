import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService, private email: EmailService) {}

  async findAll(user: any, upcoming?: boolean) {
    return this.prisma.appointment.findMany({
      where: {
        createdByUserId: user.userId,
        ...(upcoming && { startAt: { gte: new Date() } }),
      },
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
    const appt = await this.prisma.appointment.create({
      data: {
        title: data.title,
        description: data.description || null,
        startAt: new Date(data.startAt),
        endAt: new Date(data.endAt),
        accountId: data.accountId || null,
        contactId: data.contactId || null,
        dealId: data.dealId || null,
        assigneeUserId: data.assigneeUserId || null,
        createdByUserId: user.userId,
      },
    });

    if (appt.assigneeUserId) {
      const assignee = await this.prisma.user.findUnique({ where: { id: appt.assigneeUserId } });
      if (assignee?.email) {
        const link = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/calendar`;
        this.email.send({
          to: assignee.email,
          subject: `Neuer Termin: ${appt.title}`,
          text: [
            `Du hast einen neuen Termin.`,
            ``,
            `Termin:        ${appt.title}`,
            `Beginnt:       ${appt.startAt.toISOString().slice(0, 16).replace('T', ' ')}`,
            `Endet:         ${appt.endAt.toISOString().slice(0, 16).replace('T', ' ')}`,
            `Verantwortlich: ${assignee.name}`,
            ``,
            appt.description ? `Beschreibung:\n${appt.description}` : '',
            ``,
            `Link: ${link}`,
          ].filter(Boolean).join('\n'),
          accountId: appt.accountId,
          loggedByUserId: user.userId,
          entityType: 'Appointment',
          entityId: appt.id,
        }).catch(() => {});
      }
    }
    return appt;
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
        ...(data.assigneeUserId !== undefined && { assigneeUserId: data.assigneeUserId || null }),
      },
    });
  }

  async delete(id: string) {
    await this.findById(id);
    await this.prisma.appointment.delete({ where: { id } });
    return { deleted: true };
  }
}
