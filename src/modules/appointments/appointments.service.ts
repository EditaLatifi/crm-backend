import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { isManager } from '../../common/access.util';

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService, private email: EmailService, private notifications: NotificationsService) {}

  // Editing/deleting an appointment requires being its creator/assignee, or management.
  private async assertCanModify(id: string, user: any) {
    const appt = await this.prisma.appointment.findUnique({ where: { id } });
    if (!appt) throw new NotFoundException('Appointment not found');
    if (!isManager(user?.role) && appt.createdByUserId !== user?.userId && appt.assigneeUserId !== user?.userId) {
      throw new ForbiddenException('Zugriff verweigert');
    }
    return appt;
  }

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

    // In-app notification for assignee
    if (appt.assigneeUserId && appt.assigneeUserId !== user.userId) {
      this.notifications.createForUser(
        appt.assigneeUserId, 'APPOINTMENT_CREATED',
        'Neuer Termin',
        `"${appt.title}" am ${new Date(appt.startAt).toLocaleDateString('de-CH')}`,
        'Appointment', appt.id, `/calendar`,
      ).catch(() => {});
    }

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
    // Generate recurring instances if recurrence is set
    if (data.recurrence && data.recurrence !== 'NONE' && data.recurrenceEnd) {
      const instances = this.generateRecurrences(appt, data.recurrence, new Date(data.recurrenceEnd));
      for (const inst of instances) {
        await this.prisma.appointment.create({
          data: { ...inst, parentId: appt.id, createdByUserId: user.userId },
        }).catch(() => {});
      }
    }

    return appt;
  }

  private generateRecurrences(parent: any, recurrence: string, until: Date): any[] {
    const instances: any[] = [];
    const start = new Date(parent.startAt);
    const end = new Date(parent.endAt);
    const duration = end.getTime() - start.getTime();
    let current = new Date(start);

    const advance = (d: Date) => {
      if (recurrence === 'DAILY') d.setDate(d.getDate() + 1);
      else if (recurrence === 'WEEKLY') d.setDate(d.getDate() + 7);
      else if (recurrence === 'BIWEEKLY') d.setDate(d.getDate() + 14);
      else if (recurrence === 'MONTHLY') d.setMonth(d.getMonth() + 1);
    };

    advance(current); // skip first (already created as parent)
    while (current <= until && instances.length < 52) { // max 52 instances
      const s = new Date(current);
      const e = new Date(s.getTime() + duration);
      instances.push({
        title: parent.title,
        description: parent.description,
        startAt: s,
        endAt: e,
        accountId: parent.accountId,
        contactId: parent.contactId,
        dealId: parent.dealId,
        assigneeUserId: parent.assigneeUserId,
        recurrence: null,
      });
      advance(current);
    }
    return instances;
  }

  async update(id: string, data: any, user: any) {
    await this.assertCanModify(id, user);
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

  async delete(id: string, user: any) {
    await this.assertCanModify(id, user);
    await this.prisma.appointment.delete({ where: { id } });
    return { deleted: true };
  }
}
