import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma.service';
import { EmailService } from './email.service';

@Injectable()
export class DueDateCron {
  private readonly logger = new Logger(DueDateCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async sendDueDateReminders() {
    const start = startOfToday();
    const end = endOfToday();
    this.logger.log(`Running due-date reminder job for ${start.toISOString()}`);

    // Day-of reminders
    await this.remindTasksDueToday(start, end);
    await this.remindDealsDueToday(start, end);
    await this.remindAppointmentsToday(start, end);
    await this.remindPhasePaymentsDueToday(start, end);

    // Pre-deadline reminders (default 1 day before, configurable via REMINDER_DAYS_BEFORE)
    const daysBeforeRaw = process.env.REMINDER_DAYS_BEFORE || '1';
    const daysBefore = daysBeforeRaw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n > 0);
    for (const d of daysBefore) {
      const target = new Date();
      target.setDate(target.getDate() + d);
      const ts = startOf(target);
      const te = endOf(target);
      this.logger.log(`Running pre-deadline reminders for ${d} day(s) before (${ts.toISOString()})`);
      await this.remindTasksDueOn(ts, te, d);
      await this.remindDealsDueOn(ts, te, d);
      await this.remindAppointmentsOn(ts, te, d);
    }
  }

  private async remindTasksDueOn(start: Date, end: Date, daysBefore: number) {
    const tasks = await this.prisma.task.findMany({
      where: { dueDate: { gte: start, lte: end }, status: { not: 'DONE' } },
      include: { assignee: true, account: true, project: true, creator: true },
    });
    for (const t of tasks) {
      const recipients = Array.from(new Set([t.assignee?.email, t.creator?.email].filter(Boolean) as string[]));
      if (recipients.length === 0) continue;
      const link = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/tasks/${t.id}`;
      await this.email.send({
        to: recipients,
        subject: `Erinnerung: Aufgabe in ${daysBefore} Tag(en) fällig – ${t.title}`,
        text: [
          `Vorab-Erinnerung: Aufgabe ist in ${daysBefore} Tag(en) fällig.`,
          ``,
          `Aufgabe:        ${t.title}`,
          t.project ? `Projekt:        ${t.project.name}` : '',
          `Fälligkeit:     ${t.dueDate?.toISOString().slice(0, 10)}`,
          `Verantwortlich: ${t.assignee?.name || t.creator?.name || '—'}`,
          ``,
          `Link: ${link}`,
        ].filter(Boolean).join('\n'),
        accountId: t.accountId || null,
        loggedByUserId: t.createdByUserId,
        entityType: 'Task',
        entityId: t.id,
      });
    }
  }

  private async remindDealsDueOn(start: Date, end: Date, daysBefore: number) {
    const deals = await this.prisma.deal.findMany({
      where: {
        OR: [
          { expectedCloseDate: { gte: start, lte: end } },
          { followUpDate: { gte: start, lte: end } },
        ],
      },
      include: { owner: true, creator: true, account: true },
    });
    for (const d of deals) {
      const recipients = Array.from(new Set([d.owner?.email, d.creator?.email].filter(Boolean) as string[]));
      if (recipients.length === 0) continue;
      const isFollowUp = d.followUpDate && d.followUpDate >= start && d.followUpDate <= end;
      const link = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/deals/${d.id}`;
      await this.email.send({
        to: recipients,
        subject: `Erinnerung: Deal in ${daysBefore} Tag(en) – ${d.name}`,
        text: [
          `Vorab-Erinnerung: Deal "${d.name}" hat in ${daysBefore} Tag(en) eine Frist.`,
          ``,
          `Deal:           ${d.name}`,
          `Konto:          ${d.account?.name || '—'}`,
          `Betrag:         ${d.amount} ${d.currency}`,
          `Fälligkeit:     ${(isFollowUp ? d.followUpDate : d.expectedCloseDate)?.toISOString().slice(0, 10)}`,
          `Verantwortlich: ${d.owner?.name || d.creator?.name || '—'}`,
          ``,
          `Link: ${link}`,
        ].join('\n'),
        accountId: d.accountId,
        loggedByUserId: d.createdByUserId,
        entityType: 'Deal',
        entityId: d.id,
      });
    }
  }

  private async remindAppointmentsOn(start: Date, end: Date, daysBefore: number) {
    const appts = await this.prisma.appointment.findMany({
      where: { startAt: { gte: start, lte: end } },
      include: { assignee: true, creator: true, account: true },
    });
    for (const a of appts) {
      const recipients = Array.from(new Set([a.assignee?.email, a.creator?.email].filter(Boolean) as string[]));
      if (recipients.length === 0) continue;
      const link = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/calendar`;
      await this.email.send({
        to: recipients,
        subject: `Erinnerung: Termin in ${daysBefore} Tag(en) – ${a.title}`,
        text: [
          `Vorab-Erinnerung: Termin "${a.title}" ist in ${daysBefore} Tag(en).`,
          ``,
          `Termin:         ${a.title}`,
          `Beginnt:        ${a.startAt.toISOString().slice(0, 16).replace('T', ' ')}`,
          `Verantwortlich: ${a.assignee?.name || a.creator?.name || '—'}`,
          ``,
          `Link: ${link}`,
        ].join('\n'),
        accountId: a.accountId || null,
        loggedByUserId: a.createdByUserId,
        entityType: 'Appointment',
        entityId: a.id,
      });
    }
  }

  private async remindPhasePaymentsDueToday(start: Date, end: Date) {
    const payments = await this.prisma.dealPhasePayment.findMany({
      where: { dueDate: { gte: start, lte: end }, reminderSent: false },
      include: {
        dealPhase: {
          include: {
            deal: { include: { owner: true, creator: true, account: true } },
          },
        },
      },
    });
    for (const p of payments) {
      const deal = p.dealPhase.deal;
      const recipient = deal.owner?.email || deal.creator?.email;
      if (!recipient) continue;
      await this.email.send({
        to: recipient,
        subject: `Zahlung fällig: ${deal.name} – ${p.dealPhase.name}`,
        text: `Zahlung "${p.label}" für Phase "${p.dealPhase.name}" (Deal: ${deal.name}) ist heute fällig.${p.amount ? `\nBetrag: ${p.amount} ${deal.currency}` : ''}${p.percentage ? `\nProzentsatz: ${p.percentage}%` : ''}`,
        accountId: deal.accountId,
        loggedByUserId: deal.createdByUserId,
      });
      await this.prisma.dealPhasePayment.update({
        where: { id: p.id },
        data: { reminderSent: true },
      });
    }
  }

  private async remindTasksDueToday(start: Date, end: Date) {
    const tasks = await this.prisma.task.findMany({
      where: {
        dueDate: { gte: start, lte: end },
        status: { not: 'DONE' },
      },
      include: { assignee: true, account: true, project: true },
    });
    for (const t of tasks) {
      if (!t.assignee?.email) continue;
      const link = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/tasks/${t.id}`;
      await this.email.send({
        to: t.assignee.email,
        subject: `Erinnerung: Aufgabe heute fällig – ${t.title}`,
        text: [
          `Deine Aufgabe ist heute fällig.`,
          ``,
          `Aufgabe:        ${t.title}`,
          t.project ? `Projekt:        ${t.project.name}` : '',
          `Fälligkeit:     ${t.dueDate?.toISOString().slice(0, 10)}`,
          `Verantwortlich: ${t.assignee.name}`,
          ``,
          t.description ? `Beschreibung:\n${t.description}` : '',
          ``,
          `Link: ${link}`,
        ].filter(Boolean).join('\n'),
        accountId: t.accountId || null,
        loggedByUserId: t.createdByUserId,
        entityType: 'Task',
        entityId: t.id,
      });
    }
  }

  private async remindDealsDueToday(start: Date, end: Date) {
    const deals = await this.prisma.deal.findMany({
      where: {
        OR: [
          { expectedCloseDate: { gte: start, lte: end } },
          { followUpDate: { gte: start, lte: end } },
        ],
      },
      include: { owner: true, creator: true, account: true },
    });
    for (const d of deals) {
      const recipient = d.owner?.email || d.creator?.email;
      if (!recipient) continue;
      const isFollowUp = d.followUpDate && d.followUpDate >= start && d.followUpDate <= end;
      const link = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/deals/${d.id}`;
      await this.email.send({
        to: recipient,
        subject: isFollowUp
          ? `Erinnerung: Deal-Nachfass heute – ${d.name}`
          : `Erinnerung: Deal heute fällig – ${d.name}`,
        text: [
          `Erinnerung: Deal "${d.name}" ist heute fällig.`,
          ``,
          `Deal:           ${d.name}`,
          `Konto:          ${d.account?.name || '—'}`,
          `Betrag:         ${d.amount} ${d.currency}`,
          `Fälligkeit:     ${(isFollowUp ? d.followUpDate : d.expectedCloseDate)?.toISOString().slice(0, 10)}`,
          `Verantwortlich: ${d.owner?.name || d.creator?.name || '—'}`,
          ``,
          `Link: ${link}`,
        ].join('\n'),
        accountId: d.accountId,
        loggedByUserId: d.createdByUserId,
        entityType: 'Deal',
        entityId: d.id,
      });
    }
  }

  private async remindAppointmentsToday(start: Date, end: Date) {
    const appts = await this.prisma.appointment.findMany({
      where: { startAt: { gte: start, lte: end } },
      include: { assignee: true, creator: true, account: true },
    });
    for (const a of appts) {
      const recipient = a.assignee?.email || a.creator?.email;
      if (!recipient) continue;
      const link = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/calendar`;
      await this.email.send({
        to: recipient,
        subject: `Erinnerung: Termin heute – ${a.title}`,
        text: [
          `Erinnerung: dein Termin "${a.title}" beginnt heute.`,
          ``,
          `Termin:         ${a.title}`,
          `Beginnt:        ${a.startAt.toISOString().slice(0, 16).replace('T', ' ')}`,
          `Endet:          ${a.endAt.toISOString().slice(0, 16).replace('T', ' ')}`,
          `Verantwortlich: ${a.assignee?.name || a.creator?.name || '—'}`,
          ``,
          `Link: ${link}`,
        ].join('\n'),
        accountId: a.accountId || null,
        loggedByUserId: a.createdByUserId,
        entityType: 'Appointment',
        entityId: a.id,
      });
    }
  }
}

function startOfToday(): Date {
  return startOf(new Date());
}

function endOfToday(): Date {
  return endOf(new Date());
}

function startOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
