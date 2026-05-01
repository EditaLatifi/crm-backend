import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../../common/prisma.service';

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  accountId?: string | null;
  contactId?: string | null;
  loggedByUserId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}

export const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';

export function buildEntityLink(entityType: string | null | undefined, entityId: string | null | undefined): string | null {
  if (!entityType || !entityId) return null;
  const map: Record<string, string> = {
    Deal: `/deals/${entityId}`,
    Task: `/tasks/${entityId}`,
    Project: `/projects/${entityId}`,
    Appointment: `/calendar`,
  };
  const path = map[entityType];
  return path ? `${APP_BASE_URL}${path}` : null;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly fromAddress: string;
  private readonly enabled: boolean;

  constructor(private readonly prisma: PrismaService) {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    this.fromAddress = process.env.SMTP_FROM || user || 'no-reply@crm.local';
    this.enabled = !!host && !!user && !!pass;

    if (this.enabled) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
    } else {
      this.logger.warn('SMTP not configured. Emails will be logged only.');
    }
  }

  async send(params: SendEmailParams): Promise<void> {
    const recipients = Array.isArray(params.to) ? params.to : [params.to];
    const validRecipients = recipients.filter((r) => !!r && /.+@.+\..+/.test(r));
    if (validRecipients.length === 0) return;

    let status: 'SUCCESS' | 'FAILED' = 'SUCCESS';
    let errorMessage: string | null = null;

    try {
      if (this.enabled && this.transporter) {
        await this.transporter.sendMail({
          from: this.fromAddress,
          to: validRecipients.join(','),
          subject: params.subject,
          text: params.text,
          html: params.html,
        });
      } else {
        this.logger.log(`[email-disabled] To: ${validRecipients.join(',')} | ${params.subject}`);
      }
    } catch (err) {
      status = 'FAILED';
      errorMessage = (err as Error).message;
      this.logger.error(`Failed to send email: ${errorMessage}`);
    }

    if (params.loggedByUserId) {
      await this.prisma.emailLog.create({
        data: {
          subject: params.subject,
          body: params.text || params.html || null,
          direction: 'OUTBOUND',
          recipient: validRecipients.join(','),
          status,
          errorMessage,
          entityType: params.entityType || null,
          entityId: params.entityId || null,
          accountId: params.accountId || null,
          contactId: params.contactId || null,
          loggedByUserId: params.loggedByUserId,
        },
      }).catch((e) => this.logger.error(`Failed to log email: ${e.message}`));
    }
  }
}
