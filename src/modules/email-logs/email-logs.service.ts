import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EmailService } from '../email/email.service';
import { assertManagerOrOwner } from '../../common/access.util';

@Injectable()
export class EmailLogsService {
  constructor(
    private prisma: PrismaService,
    private email: EmailService,
  ) {}

  async findForEntity(entityType: 'account' | 'contact', entityId: string) {
    const where = entityType === 'account' ? { accountId: entityId } : { contactId: entityId };
    return this.prisma.emailLog.findMany({
      where,
      include: { loggedBy: { select: { id: true, name: true } } },
      orderBy: { loggedAt: 'desc' },
    });
  }

  async create(data: any, user: any) {
    // Resolve recipient email if sending outbound
    let recipientEmail: string | null = data.recipient || null;

    if (data.direction === 'OUTBOUND' && !recipientEmail) {
      // Try to resolve email from contact or account
      if (data.contactId) {
        const contact = await this.prisma.contact.findUnique({ where: { id: data.contactId }, select: { email: true } });
        recipientEmail = contact?.email || null;
      } else if (data.accountId) {
        const account = await this.prisma.account.findUnique({ where: { id: data.accountId }, select: { email: true } });
        recipientEmail = account?.email || null;
      }
    }

    // Actually send the email via SMTP if outbound and we have a recipient
    if (data.direction === 'OUTBOUND' && recipientEmail) {
      await this.email.send({
        to: recipientEmail,
        subject: data.subject,
        text: data.body || undefined,
        accountId: data.accountId || null,
        contactId: data.contactId || null,
        loggedByUserId: user.userId,
        entityType: data.contactId ? 'Contact' : 'Account',
        entityId: data.contactId || data.accountId || null,
      });
    }

    // Log the email
    return this.prisma.emailLog.create({
      data: {
        subject: data.subject,
        body: data.body || null,
        direction: data.direction || 'OUTBOUND',
        recipient: recipientEmail,
        status: recipientEmail && data.direction === 'OUTBOUND' ? 'SUCCESS' : undefined,
        accountId: data.accountId || null,
        contactId: data.contactId || null,
        loggedByUserId: user.userId,
      },
      include: { loggedBy: { select: { id: true, name: true } } },
    });
  }

  async delete(id: string, user: any) {
    const log = await this.prisma.emailLog.findUnique({ where: { id }, select: { loggedByUserId: true } });
    if (!log) throw new NotFoundException('E-Mail-Protokoll nicht gefunden');
    // Only management or the user who logged the email may delete it.
    assertManagerOrOwner(user, log.loggedByUserId);
    await this.prisma.emailLog.delete({ where: { id } });
    return { deleted: true };
  }
}
